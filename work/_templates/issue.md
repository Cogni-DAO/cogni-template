---
work_item_id: wi.
work_item_type: issue
title:
state: Backlog
priority: 1
estimate: 2
summary:
outcome:
spec_refs:
assignees:
initiative:
created:
updated:
labels: []
pr:
external_refs:
---

# [Issue Title]

## Execution Checklist

- [ ] Task 1
- [ ] Task 2
- [ ] Task 3

## PR Checklist

<!-- All required for merge -->

- [ ] **Work Item:** `wi.issue-id` linked in PR body
- [ ] **Spec:** `docs/spec/spec-name.md#section` linked in PR body
- [ ] **Invariants Validated:** List invariant IDs verified by this PR

```markdown
## References

Work: wi.issue-id
Spec: docs/spec/spec-name.md#core-invariants
Invariants Validated: INVARIANT_001, INVARIANT_002
```

## Validation

<!-- Name exact commands/tests and expected outcome -->

**Command:**

```bash
pnpm test path/to/test.ts
```

**Expected:** All tests pass.

## Notes
