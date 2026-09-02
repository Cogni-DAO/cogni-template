// Mock operator compute API for the crossplane-akash spike.
//
// Faithfully implements the *port-level* compute contract that the operator's
// ComputeResourcePort / ComputeWorkloadLifecyclePort expose internally, surfaced
// as the REST shape the task's "/api/v1/compute/deployments" seam would carry:
//
//   POST   /api/v1/compute/deployments        -> provision, returns ProvisionOutput
//   GET    /api/v1/compute/deployments/:lease  -> status  (ProvisionOutput + echoed desired)
//   PUT    /api/v1/compute/deployments/:lease  -> update in place (same leaseId)
//   DELETE /api/v1/compute/deployments/:lease  -> release
//   GET    /api/v1/compute/balances            -> ComputeBalance[]
//   GET    /debug/state                        -> demo introspection (no auth)
//
// Field names mirror the real port types (packages/ai-tools/src/capabilities/compute.ts):
//   ProvisionOutput = { provider, leaseId, state, endpoints }
//   ProvisionState  = "pending" | "active" | "closed" | "unknown"
//   ComputeBalance  = { provider, accountId, currency, remaining, asOf, estimatedDaysRemaining }
//
// CRASH-SAFE / NO-DOUBLE-SPEND: the real Akash adapter derives a pre-POST
// allocationCursor (max on-chain dseq) and adopts the single post-baseline
// deployment on recovery, and keys mutations by an idempotency key that includes
// the workload identity (namespace:name:uid:generation). The invariant that falls
// out of that is: **a repeated provision of the same logical workload returns the
// SAME leaseId, never a second lease.** This mock reproduces exactly that property
// by keying provisioning on `nodeId` (the real CRD enforces one paid workload per
// node/env: metadata.name == spec.nodeId). That is what makes provider-http's
// re-issued CREATE (after a lost status write) safe: the server refuses to mint a
// second lease.
//
// Zero npm dependencies (Node built-in http only) so it runs in a bare node:alpine
// container mounted from a ConfigMap, and is unit-testable with `node --test`.

"use strict";

const http = require("http");
const crypto = require("crypto");

const PROVIDER = "akash";
const DSEQ_START = 1_000_000; // dseq-like numeric handle, stringified like the real adapter

function createStore() {
  return {
    byLease: new Map(), // leaseId -> record
    byNode: new Map(), // nodeId  -> leaseId (only while active)
    nextDseq: DSEQ_START,
    // demo/debug counters
    provisionAttempts: 0, // total POSTs that passed validation (incl. idempotent repeats)
    updateCount: 0,
    deleteCount: 0,
    mintedLeaseIds: new Set(), // distinct leases ever created (the no-double-spend witness)
  };
}

function specHashOf(body) {
  const canonical = JSON.stringify({
    publicHost: body.publicHost ?? null,
    services: body.services ?? [],
  });
  return crypto.createHash("sha256").update(canonical).digest("hex").slice(0, 16);
}

function provisionOutput(record) {
  // The canonical ProvisionOutput plus the echoed desired-state the status read
  // needs so a drift check (expectedResponseCheck) can compare observed vs desired.
  return {
    provider: record.provider,
    leaseId: record.leaseId,
    state: record.state,
    endpoints: record.endpoints,
    nodeId: record.nodeId,
    publicHost: record.publicHost,
    services: record.services,
    specHash: record.specHash,
  };
}

function json(res, status, obj) {
  const buf = Buffer.from(JSON.stringify(obj));
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": buf.length,
  });
  res.end(buf);
}

function isAuthorized(req) {
  // provider-http (ProviderConfig credentials.source: Secret) sets the full
  // Authorization header value from a k8s Secret. We only assert it is present
  // and non-empty — that proves the bearer-token plumbing end to end without
  // hardcoding any secret in git.
  const h = req.headers["authorization"];
  return typeof h === "string" && h.trim().length > 0;
}

// Pure request handler over a store, so unit tests can call it directly.
function handle(store, method, url, headers, body) {
  const u = new URL(url, "http://mock");
  const path = u.pathname;

  if (method === "GET" && path === "/healthz") {
    return { status: 200, body: { ok: true } };
  }
  if (method === "GET" && path === "/debug/state") {
    return {
      status: 200,
      body: {
        provisionAttempts: store.provisionAttempts,
        distinctLeasesMinted: store.mintedLeaseIds.size,
        activeLeaseIds: [...store.byLease.values()]
          .filter((r) => r.state !== "closed")
          .map((r) => r.leaseId),
        updateCount: store.updateCount,
        deleteCount: store.deleteCount,
      },
    };
  }

  // Everything below is authenticated.
  if (!headers.authorized) {
    return { status: 401, body: { error: "unauthorized" } };
  }

  if (path === "/api/v1/compute/balances" && method === "GET") {
    const active = [...store.byLease.values()].filter((r) => r.state !== "closed").length;
    return {
      status: 200,
      body: {
        balances: [
          {
            provider: PROVIDER,
            accountId: "akash1mockaccount000000000000000000000000",
            currency: "USD",
            // start at 100, each active lease escrows 0.5 (the console minimum deposit)
            remaining: Number((100 - active * 0.5).toFixed(2)),
            asOf: new Date().toISOString(),
            estimatedDaysRemaining: null,
          },
        ],
      },
    };
  }

  // Collection: POST provision
  if (path === "/api/v1/compute/deployments" && method === "POST") {
    let parsed;
    try {
      parsed = JSON.parse(body || "{}");
    } catch {
      return { status: 400, body: { error: "invalid_body" } };
    }
    const { nodeId, name, publicHost, services } = parsed;
    if (!nodeId || !name || !publicHost || !Array.isArray(services) || services.length === 0) {
      return { status: 400, body: { error: "invalid_body", message: "nodeId,name,publicHost,services required" } };
    }
    store.provisionAttempts += 1;

    // IDEMPOTENCY / no-double-spend: an existing active workload for this nodeId
    // returns its existing lease unchanged. This is the crash-safety crux — a
    // provider-http CREATE re-issued after a lost status write lands here.
    const existingLease = store.byNode.get(nodeId);
    if (existingLease && store.byLease.has(existingLease)) {
      const rec = store.byLease.get(existingLease);
      if (rec.state !== "closed") {
        return { status: 200, body: provisionOutput(rec) };
      }
    }

    const leaseId = String(store.nextDseq++);
    const record = {
      provider: PROVIDER,
      leaseId,
      nodeId,
      name,
      publicHost,
      services,
      specHash: specHashOf(parsed),
      state: "active",
      endpoints: [`https://${publicHost}`],
      createdAt: new Date().toISOString(),
    };
    store.byLease.set(leaseId, record);
    store.byNode.set(nodeId, leaseId);
    store.mintedLeaseIds.add(leaseId);
    return { status: 200, body: provisionOutput(record) };
  }

  // Item: /api/v1/compute/deployments/:leaseId
  const m = path.match(/^\/api\/v1\/compute\/deployments\/([^/]+)$/);
  if (m) {
    const leaseId = decodeURIComponent(m[1]);
    const record = store.byLease.get(leaseId);

    if (method === "GET") {
      if (!record || record.state === "closed") {
        return { status: 404, body: { error: "not_found" } };
      }
      return { status: 200, body: provisionOutput(record) };
    }
    if (method === "PUT") {
      if (!record || record.state === "closed") {
        return { status: 404, body: { error: "not_found" } };
      }
      let parsed;
      try {
        parsed = JSON.parse(body || "{}");
      } catch {
        return { status: 400, body: { error: "invalid_body" } };
      }
      if (parsed.publicHost) record.publicHost = parsed.publicHost;
      if (Array.isArray(parsed.services)) record.services = parsed.services;
      record.specHash = specHashOf(record);
      record.endpoints = [`https://${record.publicHost}`];
      record.state = "active";
      store.updateCount += 1;
      return { status: 200, body: provisionOutput(record) };
    }
    if (method === "DELETE") {
      // Idempotent release: unknown/closed lease still succeeds (mirrors the real
      // lifecycle adapter swallowing not_found on delete).
      if (record && record.state !== "closed") {
        record.state = "closed";
        store.byNode.delete(record.nodeId);
        store.deleteCount += 1;
      }
      return { status: 200, body: { leaseId, state: "closed" } };
    }
  }

  return { status: 404, body: { error: "route_not_found", path, method } };
}

function createServer(store = createStore()) {
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      const headers = { authorized: isAuthorized(req) };
      let result;
      try {
        result = handle(store, req.method, req.url, headers, body);
      } catch (err) {
        result = { status: 500, body: { error: "internal", message: String(err && err.message) } };
      }
      json(res, result.status, result.body);
    });
  });
  server.store = store;
  return server;
}

module.exports = { createStore, handle, createServer, specHashOf };

// Run directly: `node server.js`
if (require.main === module) {
  const port = Number(process.env.PORT || 8080);
  const server = createServer();
  server.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`mock operator compute API listening on :${port}`);
  });
}
