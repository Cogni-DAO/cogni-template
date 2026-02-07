# Sandbox Scaling Roadmap

> Scaling strategy for sandboxed agent LLM gateway. Covers proxy selection, per-run vs shared proxy tradeoffs, trusted attribution at concurrency, and threat model.
>
> **Prerequisite**: [SANDBOXED_AGENTS.md](SANDBOXED_AGENTS.md) for core invariants, current architecture, and phase definitions.

---

## OSS Proxy Comparison

Evaluated for: unix socket bind (proxy listens on socket), header strip/inject, SSE streaming, dynamic per-request headers, config complexity.

> **Note**: "Socket Bind" = proxy binds a listener to a unix socket (our use case). This is distinct from "socket upstream" (proxy connects to a backend via socket), which most proxies support but is not what we need.

| Criterion                       | nginx:alpine | OpenResty:alpine       | Envoy (distroless)       | HAProxy:alpine         | Caddy:alpine | Traefik     |
| ------------------------------- | ------------ | ---------------------- | ------------------------ | ---------------------- | ------------ | ----------- |
| **Unix Socket Bind (listener)** | Native       | Native                 | Native (pipe address)    | Native (bind)          | Supported    | **NO**      |
| **Header Strip + Inject**       | Static only  | Static + Dynamic (Lua) | Static + Limited Dynamic | Static + Dynamic (Lua) | Static only  | Static only |
| **SSE/Streaming**               | Excellent    | Excellent              | Good (needs tuning)      | Good (timeout tuning)  | Good         | Fair        |
| **Config Complexity**           | **Very Low** | Low-Moderate           | High                     | Low-Moderate           | Low          | High        |
| **Dynamic Per-Request Headers** | No           | **YES (Lua)**          | Limited                  | YES (Lua)              | No           | No          |
| **Lua/Scripting**               | None         | **Full LuaJIT**        | Limited Lua filter       | Built-in Lua 5.3       | None         | None        |

**Disqualified**: Traefik -- cannot bind a listener to a unix socket in Docker ([known panic](https://github.com/traefik/traefik/issues/10924)).

**Eliminated**: Envoy (over-engineered for this use case, verbose YAML, limited Lua). Caddy (no scripting runtime, requires custom Go module for dynamic headers).

**Viable at scale**: nginx:alpine (static config only), **OpenResty:alpine** (dynamic + static), HAProxy:alpine (dynamic + static).

### Selection

| Phase              | Proxy                        | Why                                                                                                                 |
| ------------------ | ---------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **P0.5** (current) | `nginx:alpine`               | Simplest. Static config via `envsubst`. 10 MB. Config-only, no code.                                                |
| **P1+** (scale)    | `openresty/openresty:alpine` | Drop-in nginx superset. Existing `nginx.conf.template` works unmodified. Add Lua only when dynamic behavior needed. |

OpenResty is preferred over HAProxy for the upgrade path because: (1) existing nginx config works unchanged, (2) richer Lua ecosystem (`lua-resty-hmac`, `lua-resty-jwt`), (3) better community docs for unix socket + SSE + header injection pattern.

---

## Per-Run vs Long-Lived Proxy

### Per-Run Proxy (P0.5 -- current)

One `nginx:alpine` container per sandbox run, with runId/attempt/key baked into static config via `envsubst`.

| Property             | Value                                                |
| -------------------- | ---------------------------------------------------- |
| Attribution trust    | Trivial -- runId in static config, cannot be spoofed |
| Container overhead   | ~2-5 MB RAM, ~100-200ms startup per proxy            |
| Concurrency ceiling  | ~50 simultaneous runs practical                      |
| Audit isolation      | Natural -- one log file per run                      |
| Secret scoping       | Each proxy has its own `LITELLM_MASTER_KEY` copy     |
| Failure blast radius | Proxy crash kills one run                            |

**Verdict**: Correct for P0.5. Overhead negligible for single-digit concurrency. Simplicity advantage is overwhelming.

### Long-Lived Shared Proxy (P1+ when needed)

Single `openresty:alpine` container serving all concurrent sandbox runs. Attribution via host-minted signed run tokens verified per-request in Lua.

| Property             | Value                                                           |
| -------------------- | --------------------------------------------------------------- |
| Attribution trust    | HMAC-SHA256 signed token verified per-request                   |
| Container overhead   | One proxy, ~10 MB total                                         |
| Concurrency ceiling  | Thousands of concurrent runs                                    |
| Audit isolation      | Must parse/filter shared log by runId                           |
| Secret scoping       | Single proxy holds `LITELLM_MASTER_KEY` + `PROXY_SHARED_SECRET` |
| Failure blast radius | Proxy crash kills ALL concurrent runs                           |

**Trigger to switch**: When container overhead becomes measurable (>~20 concurrent sandbox runs) OR when dynamic per-request behavior is needed (rate limiting, tool routing).

---

## Signed Run Token Scheme

> **DO NOT BUILD YET.** This section is P1+ reference material for when the shared proxy pattern is needed (trigger: >~20 concurrent runs). Per-run proxy with static config is correct until then.

For the shared proxy pattern, a minimal HMAC-SHA256 token (no JWT -- avoids unnecessary complexity for internal host-to-proxy trust).

### Token Format

```
X-Run-Token: {runId}|{attempt}|{expiry}.{base64(HMAC-SHA256(data, PROXY_SHARED_SECRET))}
```

### Host Side (Node.js)

```typescript
import { createHmac } from "crypto";

function mintRunToken(runId: string, attempt: number, secret: string): string {
  const expiry = Math.floor(Date.now() / 1000) + 86400; // 24h
  const data = `${runId}|${attempt}|${expiry}`;
  const sig = createHmac("sha256", secret).update(data).digest("base64url");
  return `${data}.${sig}`;
}
```

### Proxy Side (OpenResty Lua)

```lua
-- access_by_lua_block
local hmac = require "resty.hmac"

local token = ngx.req.get_headers()["X-Run-Token"]
if not token then return ngx.exit(401) end

local data_part, sig_part = token:match("^(.+)%.(.+)$")
if not data_part then return ngx.exit(401) end

local parts = {}
for p in data_part:gmatch("[^|]+") do parts[#parts+1] = p end
-- parts = { runId, attempt, expiry }

if tonumber(parts[3]) < ngx.time() then return ngx.exit(401) end

local h = hmac:new(SHARED_SECRET, hmac.ALGOS.SHA256)
local expected = ngx.encode_base64url(h:final(data_part))
if expected ~= sig_part then return ngx.exit(401) end

ngx.req.set_header("x-litellm-end-user-id", parts[1] .. "/" .. parts[2])
ngx.req.set_header("Authorization", "Bearer " .. LITELLM_KEY)
```

**Dependencies**: [`lua-resty-hmac`](https://github.com/jkeys089/lua-resty-hmac) (15 KB, pure Lua, available via OPM).

---

## Threat Model

All mitigations assume core invariants from [SANDBOXED_AGENTS.md](SANDBOXED_AGENTS.md) are enforced.

| Attack                              | Mitigation                                                                   | Enforcement Point                                             | Residual Risk                                                          |
| ----------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Exfiltrate `LITELLM_MASTER_KEY`     | Key only in proxy config dir (`conf/`), never in sandbox-mounted `sock/` dir | LlmProxyManager split: `sock/` shared, `conf/` proxy-only     | None -- key physically absent from sandbox                             |
| Bypass attribution (spoof identity) | Per-run: static config overwrites all `x-litellm-*` headers. Shared: HMAC    | nginx `proxy_set_header` override / OpenResty `access_by_lua` | None -- unconditional override or cryptographic verification           |
| Reach internet from sandbox         | `NetworkMode: 'none'` -- no network stack                                    | SandboxRunnerAdapter container creation                       | None -- kernel-enforced                                                |
| Pivot to Docker socket              | Socket not mounted, `CapDrop: ALL`, `no-new-privileges`                      | SandboxRunnerAdapter security hardening                       | None -- socket physically absent                                       |
| Poison audit logs                   | Logs written by proxy container, not sandbox                                 | nginx `access_log` in proxy container                         | Low -- sandbox could inflate volume via high request count             |
| Consume unbounded LLM tokens        | P0.5: sandbox timeout. P1+: rate limiting in proxy                           | Container `maxRuntimeSec` / OpenResty `lua-resty-limit-req`   | **Accepted in P0.5**. LiteLLM per-key spend limits as backstop         |
| Cross-run traffic via shared socket | Per-run: unique socket dir. Shared: HMAC token scoped to runId               | Filesystem isolation / token expiry + signature               | None with per-run. Low with shared (token replay within expiry window) |
| Fork bomb / resource exhaustion     | `PidsLimit: 256`, `maxMemoryMb`, `maxRuntimeSec`                             | Docker container resource limits                              | Low -- limits kernel-enforced                                          |
| Exfiltrate workspace data via LLM   | Not mitigated -- inherent to running an agent with LLM access                | None                                                          | **Accepted**. Data classification deferred to P2                       |

---

## Migration Plan

| Step                 | When                      | Change                                                                    | Diff Size                                         |
| -------------------- | ------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------- |
| 1. Ship P0.5         | Now                       | Current `nginx:alpine` per-run proxy                                      | Already built                                     |
| 2. Swap image        | When first Lua needed     | Change `nginx:alpine` to `openresty/openresty:alpine` in LlmProxyManager  | 1 line                                            |
| 3. Add rate limiting | When abuse risk increases | Add `access_by_lua_block` with `lua-resty-limit-req`                      | ~20 lines Lua                                     |
| 4. Shared proxy      | When concurrency > ~20    | Replace per-run containers with single long-lived OpenResty + HMAC tokens | New `SharedLlmProxyManager` adapter               |
| 5. CogniGateway      | P1 tool execution         | Node.js gateway: `/v1/*` passthrough + `/tool/exec` endpoint              | New service, replaces proxy for tool-enabled runs |

Each step is independently shippable. Steps 2-3 are backward-compatible with per-run model.

---

## Decision Criteria (Ranked)

1. **Fewest moving parts** -- count processes/containers/config surfaces
2. **Security posture** -- secrets containment, spoof resistance, egress control
3. **Attribution correctness** -- trusted runId/attempt, never client-asserted
4. **Hermetic reproducibility** -- Docker-only dev + CI parity
5. **Scalability** -- supports long-running sandboxes and concurrent runs

---

**Last Updated**: 2026-02-06
