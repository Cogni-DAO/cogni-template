---
id: cross-spec-alignment-review
type: research
title: Cross-Spec Alignment Review
status: draft
trust: draft
summary: Review of ToolErrorCode drift, MetricsQueryPort naming, and AI_GOVERNANCE_DATA spec alignment with existing code.
read_when: Working on tool types, metrics ports, or governance data implementation.
owner: derekg1729
created: 2026-01-21
tags: [ai-graphs, data]
---

# Cross-Spec Alignment Review

> **Date**: 2026-01-21
> **Scope**: TOOL_USE_SPEC, USAGE_HISTORY, GRAPH_EXECUTION, AI_GOVERNANCE_DATA

---

## Critical Findings (Existing Code)

### 1. ToolErrorCode Drift

**Problem:** Same type defined in two packages with different values.

```typescript
// @cogni/ai-core/tooling/types.ts
type ToolErrorCode =
  | "validation"
  | "execution"
  | "unavailable"
  | "redaction_failed"
  | "invalid_json"
  | "timeout"
  | "policy_denied";

// @cogni/ai-tools/types.ts (MISSING: "invalid_json", "timeout")
type ToolErrorCode =
  | "validation"
  | "execution"
  | "unavailable"
  | "redaction_failed"
  | "policy_denied";
```

**Fix:**

- [ ] `@cogni/ai-tools/types.ts` imports `ToolErrorCode` from `@cogni/ai-core`

---

### 2. MetricsQueryPort Name vs Interface Mismatch

**Problem:** `MetricsQueryPort` uses PromQL-specific types (`PrometheusTimeSeries`, `RangeQueryParams.query: string` expects PromQL). Name suggests generic, interface is vendor-specific.

**Options:**
| Option | Change |
|--------|--------|
| A | Rename to `PromqlQueryPort` (honest naming) |
| B | Keep name, accept it's Prometheus-specific |

AI_GOVERNANCE_DATA proposes a different `MetricsQueryPort` (semantic layer). If we proceed with governance spec, need distinct name: `GovernedMetricsPort`.

**Fix (if proceeding with governance):**

- [ ] Rename existing to `PromqlQueryPort` (14 files)
- [ ] Governance spec uses `GovernedMetricsPort`

---

## Spec Review Notes (No Code Changes)

For AI_GOVERNANCE_DATA.md implementation:

- Flatten proposed `ports/governance/` subdirectory to match existing flat structure
- SourceAdapters belong in `src/adapters/`, not `packages/`
- WorkItemPort: keep for system reads, agent writes via MCP tools
- Add cross-refs to TOOL_USE_SPEC, AI_SETUP_SPEC, USAGE_HISTORY
- Create shared TEMPORAL_PATTERNS.md (both SCHEDULER_SPEC and AI_GOVERNANCE_DATA duplicate Temporal invariants)

---

**Status**: Review Complete
