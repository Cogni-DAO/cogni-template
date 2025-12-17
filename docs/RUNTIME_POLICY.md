# Route Runtime Policy

Next.js API routes default to Node.js runtime. This doc specifies when to explicitly declare `runtime`.

## Policy

**Default:** Omit `export const runtime` (Node.js is the default).

**Add `runtime = "nodejs"` when:**

- Route imports Node builtins (`node:crypto`, `fs`, `path`, `net`, etc.)
- Route uses DB drivers or server-only adapters (`@/adapters/server/*`, Drizzle)
- Route uses SDKs that aren't Edge-compatible
- Route path matches `src/app/api/v1/ai/**` (policy: AI routes must never drift to Edge)
- Route relies on Node streaming semantics or otel instrumentation

**Set `runtime = "edge"` only when:**

- Route is proven Edge-safe AND you explicitly want Edge latency
- No Node builtins, no DB drivers, no non-Edge SDKs; fetch-only + Web APIs

## Current Decisions

| Route                  | Runtime | Reason                            |
| ---------------------- | ------- | --------------------------------- |
| `api/v1/ai/chat`       | nodejs  | `node:crypto` import; AI policy   |
| `api/v1/ai/completion` | nodejs  | AI policy; server facade deps     |
| `api/v1/ai/models`     | nodejs  | AI policy; uniform across `ai/*`  |
| `api/metrics`          | nodejs  | `node:crypto` import; prom-client |
| `api/setup/verify`     | nodejs  | otel instrumentation; viem RPC    |

## CI Enforcement (Future)

Add `pnpm lint:runtime` with these rules:

1. If route imports `node:*` or known Node builtins → require `runtime='nodejs'`
2. If route imports `@/adapters/server/**` or DB client → require `runtime='nodejs'`
3. If route path matches `src/app/api/v1/ai/**` → require `runtime='nodejs'`
4. Otherwise → forbid explicit `runtime='nodejs'` (optional, reduces noise)
