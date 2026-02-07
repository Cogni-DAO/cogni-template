# Caching Strategy

> [!NOTE]
> Investigation needed to audit and optimize client/server caching across the stack.

## Core Invariants

1. **Avoid unnecessary refetches**: Client queries should use appropriate `staleTime` to prevent redundant API calls on mount/focus.

2. **SSR hydration safety**: Theme and other client state must initialize without hydration mismatches.

3. **Cache invalidation correctness**: Mutations must invalidate related queries to prevent stale UI.

---

## Implementation Checklist

### P0: Investigation

- [ ] Audit all React Query hooks for missing/incorrect `staleTime`
- [ ] Document theme hydration mismatch root cause
- [ ] Review server-side caching strategy (models, etc.)
- [ ] Identify analytics/usage query caching gaps

---

## Known Issues

| Area            | Issue                                       | Location                                           |
| --------------- | ------------------------------------------- | -------------------------------------------------- |
| Credits summary | No `staleTime`, refetches every mount/focus | `src/features/payments/hooks/useCreditsSummary.ts` |
| Theme           | Hydration mismatch on initial load          | Theme provider                                     |
| Models          | 5-min staleTime, may need tuning            | `src/features/ai/hooks/useModels.ts`               |
| Analytics/Usage | No client caching strategy defined          | Activity queries                                   |

---

## Design Decisions

### 1. React Query Defaults

- `staleTime: 0` (always stale, refetches on mount)
- `refetchOnWindowFocus: true`

These defaults cause the "multiple API calls on refresh" behavior observed in logs.

### 2. Server-Side Caching

Models endpoint already uses server-side cache (`cacheHit: true` in logs). No action needed there.

---

## File Pointers

| File                                               | Status                  |
| -------------------------------------------------- | ----------------------- |
| `src/features/payments/hooks/useCreditsSummary.ts` | Needs `staleTime`       |
| `src/features/ai/hooks/useModels.ts`               | Has 5-min cache, review |
| Theme provider (TBD)                               | Hydration investigation |

---

**Last Updated**: 2025-12-08
**Status**: Investigation Needed
