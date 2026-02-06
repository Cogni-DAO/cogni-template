---
work_item_id: ini.performance-efficiency
work_item_type: initiative
title: Performance & Efficiency
state: Active
priority: 2
estimate: 4
summary: Audit and optimize caching, query performance, LLM cost efficiency, and CI speed across the stack
outcome: Measurable reduction in redundant API calls, LLM token waste, and CI cycle time
assignees: derekg1729
created: 2026-02-07
updated: 2026-02-07
labels: [performance, infra]
---

# Performance & Efficiency

## Goal

Systematically identify and fix performance bottlenecks across the stack — client-side query caching, server-side response caching, LLM prompt/response caching, and CI pipeline speed. Each track can progress independently.

## Roadmap

### Web Caching Track

> Source: `docs/CACHING.md`

#### P0: Investigation

**Goal:** Audit current caching behavior, document gaps.

| Deliverable                                                   | Status      | Est | Work Item |
| ------------------------------------------------------------- | ----------- | --- | --------- |
| Audit all React Query hooks for missing/incorrect `staleTime` | Not Started | 1   | —         |
| Document theme hydration mismatch root cause                  | Not Started | 1   | —         |
| Review server-side caching strategy (models, etc.)            | Not Started | 1   | —         |
| Identify analytics/usage query caching gaps                   | Not Started | 1   | —         |

**Known Issues:**

| Area            | Issue                                       | Location                                           |
| --------------- | ------------------------------------------- | -------------------------------------------------- |
| Credits summary | No `staleTime`, refetches every mount/focus | `src/features/payments/hooks/useCreditsSummary.ts` |
| Theme           | Hydration mismatch on initial load          | Theme provider                                     |
| Models          | 5-min staleTime, may need tuning            | `src/features/ai/hooks/useModels.ts`               |
| Analytics/Usage | No client caching strategy defined          | Activity queries                                   |

#### P1: Fixes

**Goal:** Apply staleTime tuning, fix hydration issues.

| Deliverable                                           | Status      | Est | Work Item |
| ----------------------------------------------------- | ----------- | --- | --------- |
| Set appropriate `staleTime` on credits/activity hooks | Not Started | 1   | —         |
| Fix theme hydration mismatch                          | Not Started | 1   | —         |

### LLM Caching Track

| Deliverable                                                     | Status      | Est | Work Item |
| --------------------------------------------------------------- | ----------- | --- | --------- |
| Evaluate LiteLLM prompt caching / semantic cache options        | Not Started | 2   | —         |
| Evaluate Anthropic/OpenAI native prompt caching (beta features) | Not Started | 1   | —         |

### CI Performance Track

| Deliverable                                                         | Status      | Est | Work Item |
| ------------------------------------------------------------------- | ----------- | --- | --------- |
| Benchmark current `check:full` end-to-end time                      | Not Started | 1   | —         |
| Identify slowest test suites and Docker build stages                | Not Started | 1   | —         |
| Evaluate parallelization opportunities (test sharding, layer cache) | Not Started | 2   | —         |

## Constraints

- Avoid unnecessary refetches: Client queries should use appropriate `staleTime` to prevent redundant API calls on mount/focus
- SSR hydration safety: Theme and other client state must initialize without hydration mismatches
- Cache invalidation correctness: Mutations must invalidate related queries to prevent stale UI

## Dependencies

- [ ] LiteLLM prompt caching support availability (LLM track)

## As-Built Specs

- (none yet — specs created when code merges)

## Design Notes

### React Query Defaults (current behavior)

> Source: `docs/CACHING.md`

- `staleTime: 0` (always stale, refetches on mount)
- `refetchOnWindowFocus: true`

These defaults cause the "multiple API calls on refresh" behavior observed in logs.

Models endpoint already uses server-side cache (`cacheHit: true` in logs). No action needed there.

### File Pointers

| File                                               | Status                  |
| -------------------------------------------------- | ----------------------- |
| `src/features/payments/hooks/useCreditsSummary.ts` | Needs `staleTime`       |
| `src/features/ai/hooks/useModels.ts`               | Has 5-min cache, review |
| Theme provider (TBD)                               | Hydration investigation |
