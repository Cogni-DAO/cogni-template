// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/scheduler-worker-service/health`
 * Purpose: Health endpoint HTTP server for orchestrator probes.
 * Scope: /livez (liveness) and /readyz (readiness) endpoints.
 * Invariants:
 * - /livez always returns 200 (process alive)
 * - /readyz returns 200 only when ready=true, 503 otherwise
 * Side-effects: Binds HTTP server to HEALTH_PORT
 * Links: docs/SERVICES_ARCHITECTURE.md
 * @internal
 */

import { createServer, type Server } from "node:http";

export interface HealthState {
  ready: boolean;
}

export function startHealthServer(state: HealthState, port: number): Server {
  const server = createServer((req, res) => {
    if (req.url === "/livez") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("ok");
    } else if (req.url === "/readyz") {
      if (state.ready) {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("ok");
      } else {
        res.writeHead(503, { "Content-Type": "text/plain" });
        res.end("not ready");
      }
    } else {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("not found");
    }
  });

  server.listen(port);
  return server;
}
