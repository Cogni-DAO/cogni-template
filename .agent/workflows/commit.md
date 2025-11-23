---
description: Create a Conventional Commit message
---

It is time to create a commit message for our current staged changes. Your job is to objectively analyze all code + documentation that has been created on this branch, and create a clear, structured commit message following Conventional Commits. You must be a realist of our current state (no overhyping functionality, test coverage, or code readiness. Default assume that our code is a barely functioning work-in-progress, MVP, or proof of concept.)

Your process:

1. **File Analysis**: Use `git status` to see all changed files, then `git diff` to examine the exact changes being made.

2. **Scope Check**: Ensure changes are cohesive and serve a single purpose. If you find disjoint features, you MUST call this out, and design a split into separate commits.

3. **Commit Message**: Use Conventional Commits. Subject is imperative, ≤ 72 chars, no trailing period. Scope is lowercase kebab-case and maps to the affected area (e.g., `app`, `features`, `infra`, `docs`). 90% of commits should be 1 line only. Only the most complex changes recieve a commit body. If the commit introduces a breaking change include a `BREAKING CHANGE:` footer with the impact and required actions.

4. **Commit**: Create the commit

**Format:** `type(scope): description`

**Types:** feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert

Be factual, avoid overhyping. Nothing is ever Production ready, nor comprehensive. Any commits with those words will be rejected

**Examples**

- `feat(login): add oauth callback route`
- `refactor(core): extract price calc into pure function`
- `fix(adapters): handle null tenant id`
- `build(release): pin node to v20.17`
- `docs(architecture): clarify ports vs adapters`

**Footers**

- `BREAKING CHANGE: rename env VAR_X to VAR_Y; update deploy secrets`
- `Refs: #123`

## Breaking changes

- Keep header ≤ 72 chars; leave one blank line before footers.
- Always add a footer explaining impact:

  ```
  BREAKING CHANGE: describe impact and required migration steps
  ```

**Example**

```
feat(auth): require 2FA for login

BREAKING CHANGE: login now requires TOTP; update tests and client flows.
```
