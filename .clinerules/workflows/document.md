It's time to update documentation for this branch — both `*/AGENTS.md` files and top-of-file headers. Start by reading [ARCHITECTURE.md](docs/ARCHITECTURE.md) and [STYLE.md](docs/STYLE.md)

---

## 1. Review Changed Files

- List all staged (or branch) changes and group them by directory. Compare current branch against origin `staging` branch.
- For each changed or new file, update the **top-of-file TSDoc header** if its behavior, inputs/outputs, or side-effects changed.
- Use templates: `docs/templates/header_source_template.ts` (source), `header_test_template.ts` (tests), `header_e2e_template.ts` (e2e).
- If only internal refactors or formatting changed, no documentation update is needed.
- Output a short TODO list per affected directory, then apply minimal edits.

---

## 2. Update Directory Docs

- Every subdirectory NEEDS to have a `AGENTS.md` file. Create one from template if missing.
- Update a directory’s `AGENTS.md` **only if**:
  - Public exports, routes, env keys, ports, or boundaries changed
  - Ownership/status/date changed
  - The directory was created or removed
- Do **not** add new sections. Keep ≤150 lines and edit existing ones only.
- Describe **interfaces and public surface** here — not per-file behavior.

---

## 3. Writing Rules

- Use **present tense** only. Never write “new,” “updated,” “final,” or “production ready.”
- Simplify and shorten docs. Remove dead or duplicated lines.
- Keep behavior details inside file headers, not `AGENTS.md`.
- For new directories, seed from `docs/templates/agents_subdir_template.md`.

---

## 4. Validate and Finish

- Cross-check: `index.ts` exports, routes, env schema, and ports vs. `AGENTS.md`.
- Ensure contract tests match listed ports.
- Run validation:
  ```bash
  pnpm check:docs
  ```
