---
id: runtime-policy-spec
type: spec
title: Route Runtime Policy
status: active
spec_state: draft
trust: draft
summary: Next.js API route runtime declarations — when to use Node.js vs Edge, with route-level decisions and enforcement rules.
read_when: Adding a new API route, debugging runtime errors, or deciding between Node.js and Edge runtime.
owner: derekg1729
created: 2026-02-06
verified: 2026-02-06
tags: [deployment]
---

# Route Runtime Policy

## Context

Next.js API routes default to Node.js runtime. Explicit `runtime` declarations are needed when routes use Node builtins, DB drivers, or AI infrastructure to prevent accidental Edge deployment.

## Goal

Ensure every API route runs in the correct runtime (Node.js or Edge) with explicit declarations where needed, preventing silent failures from runtime mismatches.

## Non-Goals

- Edge-first migration (Node.js is the default and preferred runtime)
- Runtime selection for pages/components (this covers API routes only)

## Core Invariants

1. **NODEJS_DEFAULT**: Omit `export const runtime` when no Node builtins or server-only deps are used. Node.js is the implicit default.

2. **EXPLICIT_NODEJS_REQUIRED**: Add `runtime = "nodejs"` when a route imports Node builtins (`node:crypto`, `fs`, `path`, `net`), DB drivers, server-only adapters (`@/adapters/server/*`, Drizzle), non-Edge SDKs, or matches `src/app/api/v1/ai/**`.

3. **EDGE_PROVEN_ONLY**: Set `runtime = "edge"` only when the route is proven Edge-safe AND you explicitly want Edge latency — no Node builtins, no DB drivers, no non-Edge SDKs; fetch-only + Web APIs.

4. **AI_ROUTES_ALWAYS_NODEJS**: All routes under `src/app/api/v1/ai/**` must declare `runtime = "nodejs"` regardless of current imports. Policy: AI routes must never drift to Edge.

## Design

### Current Route Decisions

| Route                  | Runtime | Reason                            |
| ---------------------- | ------- | --------------------------------- |
| `api/v1/ai/chat`       | nodejs  | `node:crypto` import; AI policy   |
| `api/v1/ai/completion` | nodejs  | AI policy; server facade deps     |
| `api/v1/ai/models`     | nodejs  | AI policy; uniform across `ai/*`  |
| `api/metrics`          | nodejs  | `node:crypto` import; prom-client |
| `api/setup/verify`     | nodejs  | otel instrumentation; viem RPC    |

### When to Declare Runtime

**Add `runtime = "nodejs"` when:**

- Route imports Node builtins (`node:crypto`, `fs`, `path`, `net`, etc.)
- Route uses DB drivers or server-only adapters (`@/adapters/server/*`, Drizzle)
- Route uses SDKs that aren't Edge-compatible
- Route path matches `src/app/api/v1/ai/**` (AI policy)
- Route relies on Node streaming semantics or otel instrumentation

**Set `runtime = "edge"` only when:**

- Route is proven Edge-safe AND you explicitly want Edge latency
- No Node builtins, no DB drivers, no non-Edge SDKs; fetch-only + Web APIs

### File Pointers

| File                                | Role                        |
| ----------------------------------- | --------------------------- |
| `src/app/api/v1/ai/*/route.ts`      | AI routes (always nodejs)   |
| `src/app/api/metrics/route.ts`      | Metrics endpoint (nodejs)   |
| `src/app/api/setup/verify/route.ts` | Setup verification (nodejs) |

## Acceptance Checks

**Manual:**

1. Verify all `api/v1/ai/**` routes declare `runtime = "nodejs"`
2. Verify no route using Node builtins or DB drivers omits the runtime declaration

## Open Questions

_(none — future CI lint enforcement (`pnpm lint:runtime`) tracked in ini.cicd-services-gitops.md: auto-detect Node builtins and adapter imports, require `runtime='nodejs'` declaration)_

## Related

- [Architecture](./architecture.md) — Hexagonal layers, adapter patterns
- [Build Architecture](./build-architecture.md) — Build pipeline and Next.js config
