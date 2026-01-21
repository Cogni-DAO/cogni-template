# Design Review: Scheduler, Graph Execution, and Tool Use Specs

> **Date**: 2026-01-19
> **Scope**: Critical analysis of SCHEDULER_SPEC.md, GRAPH_EXECUTION.md, TOOL_USE_SPEC.md
> **Focus**: Overengineering, OSS alternatives, roadmap alignment, missing foundations

---

## Critical Takeaways

### 1. `connectionId` Is Missing Everywhere

All three specs reference OAuth-connected tools and scheduled execution, but none define how OAuth connections are stored, authorized, or resolved at runtime.

**Impact**:

- Scheduled graph executions cannot use external services (GitHub, Slack, etc.)
- MCP server integration (P2) has no credential storage design
- `git-review-daemon` and `git-admin-daemon` (Phases 3-4) will need GitHub OAuth

**Required additions**:

- `connections` table schema
- `ConnectionPort` interface
- `connectionIds` field in `ExecutionGrant`
- Tool execution context with connection resolver

### 2. Scheduling Is Not in the Roadmap

SCHEDULER_SPEC.md is extensive (~660 lines) but scheduled execution doesn't appear in ROADMAP.md Phases 0-6. Either:

- Add scheduling to the roadmap with clear phase placement, or
- Defer the spec until scheduling is prioritized

### 3. ~30% of Spec Content Is Premature

| Premature Item                                | Spec            | Why                                    |
| --------------------------------------------- | --------------- | -------------------------------------- |
| MCP tool namespacing (`core__`, `mcp__`)      | TOOL_USE        | MCP is P2; no MCP tools exist          |
| Multi-executor parity enforcement             | TOOL_USE        | Only InProc is customer-billable in P0 |
| Redaction framework (mandatory for all tools) | TOOL_USE        | Start with opt-in for sensitive tools  |
| `attempt` field in P0 schemas                 | GRAPH_EXECUTION | Always 0; add when persistence lands   |
| Wire encoder/decoder abstractions             | TOOL_USE        | LangChain handles this already         |

### 4. Consider Temporal.io for Scheduling

The SCHEDULER_SPEC builds a mini-Temporal with Graphile Worker:

- Producer-chain scheduling (each run enqueues next)
- Reconciler with self-rescheduling every 5 minutes
- Job-key idempotency + execution_requests table
- Queue serialization per schedule

Temporal handles all of this natively with better observability and proven durability.

### 5. Consolidate or Choose Execution Paths

Current design maintains parity between:

- InProc execution (LangGraphInProcProvider)
- LangGraph Server execution (external)

This creates ongoing maintenance burden. Recommendation: commit to one path for P0/P1.

---

## Research Summary

### Documents Analyzed

| Document           | Lines | Invariants | P0 Checklist Items |
| ------------------ | ----- | ---------- | ------------------ |
| SCHEDULER_SPEC.md  | 661   | 14         | 35                 |
| GRAPH_EXECUTION.md | 877   | 31         | 47                 |
| TOOL_USE_SPEC.md   | 476   | 25         | 28                 |

### North Star (from ROADMAP.md)

- **Mission**: DAO-first "org factory" — sovereign nodes that fork and run independently
- **Current Phase**: P0/P1 — Node Formation MVP + First LangGraph Graph + Evals
- **Key Constraint**: Fork freedom, no vendor lock-in, OSS-first

---

## Overengineering Analysis

### SCHEDULER_SPEC.md

| Decision                     | Assessment  | Notes                                                       |
| ---------------------------- | ----------- | ----------------------------------------------------------- |
| Graphile Worker              | ✅ Good     | Proven PostgreSQL job queue                                 |
| ExecutionGrants              | ⚠️ Bespoke  | Custom auth system; could use standard API keys with scopes |
| `execution_requests` table   | ✅ Standard | Idempotency persistence is correct                          |
| Reconciler self-rescheduling | ⚠️ Complex  | Temporal handles this natively                              |
| Producer-chain scheduling    | ⚠️ Fragile  | Chain breaks on crash; reconciler is compensating mechanism |

**OSS Alternatives**:

- **Temporal.io**: Durable workflows with native cron, retry, and catch-up
- **Inngest**: Event-driven functions with built-in scheduling
- **BullMQ**: Simpler than Graphile if PostgreSQL coupling isn't required

### GRAPH_EXECUTION.md

| Decision                  | Assessment        | Notes                                          |
| ------------------------- | ----------------- | ---------------------------------------------- |
| 31 invariants             | ⚠️ Over-specified | Many are restatements; consolidate to ~10      |
| StreamDriver + Fanout     | ⚠️ Bespoke        | Vercel AI SDK has `onFinish` hooks for billing |
| Adapter abstraction stack | ⚠️ Deep           | 4 layers for single execution path             |
| `callIndex` fallback      | ⚠️ Smell          | If `usageUnitId` is required, enforce it       |
| P0_ATTEMPT_FREEZE         | ⚠️ Dead code      | Remove field; add when persistence lands       |

**Specific concern** — the pump+fanout pattern:

```
AiRuntimeService.runGraph()
  → RunEventRelay.pump()
    → Billing subscriber (bounded queue, backpressure blocks)
    → UI subscriber (bounded queue, may drop)
```

This solves a real problem (billing independent of client connection) but custom. Alternatives:

- Vercel AI SDK's `onFinish` callback
- Event emitter with billing listener
- Redis Streams for durability

### TOOL_USE_SPEC.md

| Decision                      | Assessment     | Notes                                                                                 |
| ----------------------------- | -------------- | ------------------------------------------------------------------------------------- |
| Custom wire encoders/decoders | ⚠️ Reinventing | LangChain and Vercel AI SDK handle this                                               |
| Type proliferation            | ⚠️ Complex     | 6+ types for tools: `ToolSpec`, `ToolContract`, `BoundTool`, `BoundToolRuntime`, etc. |
| Namespaced IDs (`core__`)     | ⚠️ Premature   | Building for MCP before MCP exists                                                    |
| Forced executor parity        | ⚠️ Burden      | LangGraph Server handles tools differently                                            |
| Mandatory redaction           | ⚠️ Overkill    | Start opt-in for sensitive tools                                                      |

**Specific concern** — TOOL_SAME_PATH_ALL_EXECUTORS invariant:

> "Same policy/redaction/audit path for dev, server, and InProc. No executor-specific bypass paths."

This creates maintenance burden. LangGraph Server has its own tool execution model; forcing `toLangChainTool()` wrapping adds complexity for unclear benefit.

---

## Missing Foundations

### Connection Management

The specs assume tools can access external services but don't define how:

| Missing Component                   | Purpose                                             |
| ----------------------------------- | --------------------------------------------------- |
| `connections` table                 | Store OAuth tokens, API keys for external services  |
| `ConnectionPort` interface          | Abstract connection CRUD + token refresh            |
| `connectionIds` in ExecutionGrant   | Authorize which connections a scheduled run can use |
| Connection resolver in tool context | Runtime access to credentials                       |

**Where it's mentioned** (GRAPH_EXECUTION.md, invariant 30):

> "Only opaque reference IDs (e.g., `virtualKeyId`, `connectionId`). Secrets resolved from secure store inside tool runner/runtime at execution time."

But `connectionId` is never defined in schemas, types, or ports.

**Proposed schema**:

```sql
CREATE TABLE connections (
  id UUID PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  provider TEXT NOT NULL,  -- 'github', 'slack', 'mcp:<server>'
  encrypted_credentials BYTEA NOT NULL,
  scopes TEXT[] NOT NULL,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_connections_user_provider ON connections(user_id, provider);
```

**Proposed grant extension**:

```typescript
interface ExecutionGrant {
  // existing
  scopes: string[]; // graph:execute:{graphId}
  billingAccountId: string;

  // new
  connectionIds: string[]; // which OAuth connections are authorized
}
```

### Scheduling in Roadmap

SCHEDULER_SPEC.md is not referenced in ROADMAP.md phases:

| Phase | Content                       | Scheduling?                |
| ----- | ----------------------------- | -------------------------- |
| 0     | Node Formation MVP            | No                         |
| 0.5   | Freeze Node Template          | No                         |
| 1     | First LangGraph Graph + Evals | No                         |
| 2     | Operator Services Scaffold    | No                         |
| 3     | git-review-daemon             | No (but needs scheduling?) |
| 4     | git-admin-daemon              | No                         |
| 5     | Operational Readiness         | No                         |
| 6     | Operator Repo Extraction      | No                         |

**Question**: When does scheduling land? If git-review-daemon needs to poll for PR changes or run on schedules, this is a Phase 3 dependency.

---

## Invariant Consolidation Recommendations

### GRAPH_EXECUTION.md — Proposed Groupings

Current: 31 invariants spread across document.

**Proposed consolidation**:

| Group               | Invariants                         | New Count |
| ------------------- | ---------------------------------- | --------- |
| Execution boundary  | 1, 11, 12, 14, 16                  | 1         |
| Billing/idempotency | 2, 3, 4, 7, 20, 21, 31             | 1         |
| Run identity        | 9, 10, 29                          | 1         |
| Streaming/fanout    | 6, 8, 20                           | 1         |
| Graph contracts     | 17, 22, 23, 24, 25, 26, 27, 28, 30 | 2         |
| LangChain isolation | 18, 19                             | 1         |
| Provider patterns   | 13, 15, 16                         | 1         |

**Result**: ~8 invariant groups instead of 31 individual statements.

### TOOL_USE_SPEC.md — Defer to P1

| Invariant                                | Recommendation                        |
| ---------------------------------------- | ------------------------------------- |
| TOOL_ID_NAMESPACED (16)                  | Defer — no MCP in P0                  |
| MCP_UNTRUSTED_BY_DEFAULT (21)            | Defer — MCP is P2                     |
| TOOL_SAME_PATH_ALL_EXECUTORS (25)        | Defer — only InProc in P0             |
| GOLDEN_FIXTURES_ENFORCE_WIRE_FORMAT (15) | Defer — use LangChain's wire handling |

---

## OSS Alternatives Summary

| Problem                | Current Approach      | OSS Alternative          | Decision                |
| ---------------------- | --------------------- | ------------------------ | ----------------------- |
| Durable scheduling     | Graphile + reconciler | Temporal.io              | ✅ **APPROVED** for P1  |
| Streaming with billing | Custom StreamDriver   | Vercel AI SDK            | Evaluate later          |
| Tool wire encoding     | Custom encoders       | LangChain (already used) | Use LangChain           |
| OAuth connection mgmt  | Not designed          | Nango                    | Evaluate (not for POC)  |
| Job queuing            | Graphile Worker       | BullMQ                   | N/A (Temporal replaces) |

**Decision**: Temporal.io approved for scheduling migration (P1). See [SCHEDULER_SPEC.md](../SCHEDULER_SPEC.md) for design.

---

## Action Items

### Immediate (Before More P0 Work)

1. [ ] Add `connections` table to schema design
2. [ ] Add `ConnectionPort` interface to ports
3. [ ] Add `connectionIds` to `ExecutionGrant` type
4. [ ] Clarify scheduling placement in ROADMAP.md

### Short-term (P1 Scope)

5. [x] Evaluate Temporal.io for scheduling — **APPROVED** (see SCHEDULER_SPEC.md)
6. [ ] Evaluate Nango for connection management — POC with GitHub OAuth
7. [ ] Consolidate GRAPH_EXECUTION invariants from 31 to ~8 groups
8. [ ] Remove `attempt` field from P0 schemas (add back in P1 with persistence)

### Deferred (P2+)

9. [ ] MCP tool namespacing and policy
10. [ ] Multi-executor parity enforcement
11. [ ] Mandatory tool redaction framework

---

## Connection POC Analysis (2026-01-19 Update)

### Key Insight: GitHub App ≠ OAuth

Analysis of [cogni-git-review](https://github.com/Cogni-DAO/cogni-git-review) reveals the git-review prototype uses **GitHub App Installation Auth**, not OAuth:

| Auth Type                           | How It Works                                                             | Use Case                                          |
| ----------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------- |
| **GitHub App (Installation Token)** | App installed on org/repo → short-lived tokens (1hr) generated on-demand | Bot actions: PR comments, status checks, labels   |
| **GitHub OAuth (User Token)**       | User authorizes app → long-lived tokens (8hr) with refresh               | User-attributed actions, accessing personal repos |

**For git-review-daemon and scheduled graph executions that post PR comments:**

- **Installation tokens are sufficient** — no OAuth needed
- Actions appear as the GitHub App (bot), not a specific user
- No user involvement required for background automation

### What cogni-git-review Actually Stores

Probot handles GitHub App auth automatically. The app stores:

- **App ID** (static, from GitHub App settings)
- **Private Key** (PEM file, stored securely)
- **Installation ID** (per org/repo where app is installed — received via webhooks)

**NOT stored:** OAuth tokens, user credentials, installation tokens (generated on-demand).

### Nango Evaluation

| Aspect               | Assessment                                                                |
| -------------------- | ------------------------------------------------------------------------- |
| **What it provides** | OAuth flows, token refresh, credential storage for 500+ APIs              |
| **Free self-hosted** | Auth flows only — NO syncing, NO actions, NO AI tools                     |
| **Paid tiers**       | $50-$500/mo for full features                                             |
| **GitHub support**   | Both GitHub App OAuth and regular OAuth                                   |
| **Verdict**          | **Overkill for POC** — adds infrastructure for features we don't need yet |

### Simplest First Connection: Bluesky (Not GitHub)

| Platform       | Auth Method              | Complexity  | Implementation                             |
| -------------- | ------------------------ | ----------- | ------------------------------------------ |
| **Bluesky**    | Handle + App Password    | **Trivial** | 4 lines, no OAuth dance                    |
| **GitHub App** | JWT + Installation Token | Simple      | Already proven in cogni-git-review         |
| **Twitter/X**  | OAuth 2.0 + PKCE         | Complex     | Developer registration, $42K/mo enterprise |

**Bluesky is not OAuth** — it uses AT Protocol with "App Passwords" (one-time generated passwords):

```typescript
import { BskyAgent } from "@atproto/api";
const agent = new BskyAgent({ service: "https://bsky.social" });
await agent.login({
  identifier: "handle.bsky.social",
  password: "app-password",
});
await agent.post({ text: "Hello from scheduled graph!" });
```

**Why Bluesky first:**

1. Zero OAuth complexity — no redirect flow, no token refresh
2. Free API access — no developer registration
3. Proves the `connections` table + tool integration pattern
4. Can add GitHub App and OAuth later using same infrastructure

### Revised Connection Schema

Given GitHub App ≠ OAuth, the `connections` table needs to support multiple credential types:

```sql
CREATE TABLE connections (
  id UUID PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  provider TEXT NOT NULL,           -- 'bluesky', 'github_app', 'github_oauth', 'twitter'
  credential_type TEXT NOT NULL,    -- 'app_password', 'installation', 'oauth2', 'api_key'
  encrypted_credentials JSONB NOT NULL,  -- Provider-specific, encrypted at rest
  scopes TEXT[],                     -- For OAuth providers
  expires_at TIMESTAMPTZ,            -- For tokens that expire
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Example credentials by type:**

| Provider       | credential_type | encrypted_credentials shape                |
| -------------- | --------------- | ------------------------------------------ |
| `bluesky`      | `app_password`  | `{ handle, password }`                     |
| `github_app`   | `installation`  | `{ appId, installationId, privateKeyRef }` |
| `github_oauth` | `oauth2`        | `{ accessToken, refreshToken, expiresAt }` |
| `twitter`      | `oauth2`        | `{ accessToken, refreshToken, expiresAt }` |

### Recommendation: Two-Phase Approach

**Phase A: Bluesky POC (Immediate)**

1. Add `connections` table with minimal schema
2. Create `BlueskyConnectionAdapter` (no OAuth, just App Password)
3. Create `post_to_bluesky` tool in `@cogni/ai-tools`
4. Wire tool to graph execution context
5. Test with scheduled graph posting to Bluesky

**Phase B: GitHub App Integration (After Phase A)**

1. Port cogni-git-review's Probot patterns to cogni-template
2. Store Installation IDs in `connections` table
3. Create `post_github_comment` tool
4. Test with scheduled graph posting PR comments

**Phase C: Full OAuth (When Needed)**

1. Evaluate Nango vs custom OAuth implementation
2. Add Twitter/X, LinkedIn, etc.
3. Implement token refresh background job

### Updated Action Items

**Immediate (Connection POC)**

1. [ ] ~~Evaluate Nango~~ → **Skip for now** — overkill for POC
2. [ ] Add `connections` table schema (supports multiple credential types)
3. [ ] Implement Bluesky connection (App Password auth)
4. [ ] Create `post_to_bluesky` tool
5. [ ] Test tool in graph execution

**After Bluesky Works**

6. [ ] Port GitHub App patterns from cogni-git-review
7. [ ] Add `github_app` connection type
8. [ ] Create `post_github_comment` tool
9. [ ] Test scheduled graph posting to GitHub PR

---

## Related Documents

- [SCHEDULER_SPEC.md](../SCHEDULER_SPEC.md)
- [GRAPH_EXECUTION.md](../GRAPH_EXECUTION.md)
- [TOOL_USE_SPEC.md](../TOOL_USE_SPEC.md)
- [ROADMAP.md](../../ROADMAP.md)
- [ARCHITECTURE.md](../ARCHITECTURE.md)

---

**Status**: Research Complete
**Next Step**: Review with team, prioritize action items
