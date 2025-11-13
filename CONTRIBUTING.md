# Contributing

Cogni is a unique open project: every pull request passes through **automated CI** and **AI-assisted review gates**.  
If your code passes all checks, it will be merged automatically.  
If it fails **only** the Cogni-Git-Review AI gate, a link will appear allowing you to **submit a DAO proposal** for human + token-holder review.  
Use that path sparingly — voting is reserved for meaningful exceptions or governance-level changes.

---

## Prerequisites

**First time setup:**

```bash
src/bootstrap/bootstrap  # installs Node, pnpm, OpenTofu, Docker + all project dependencies
```

**Manual setup (if bootstrap fails):**

- Node 20
- pnpm 9
- OpenTofu (for infrastructure deployment)
- Docker (for containerization)
- Install dependencies:
  ```bash
  pnpm i
  ```

## Workflow

1. Fork and branch from `main` with a descriptive branch name.

2. Run local checks before committing:

   ```bash
   pnpm check
   pnpm test   # if available
   ```

3. Use **Conventional Commits**

   Examples:
   - `feat: add lint rule`
   - `fix: null pointer in task scheduler`

4. Open a Pull Request against `main`.
5. All required CI and AI gates must pass.

## Code Style

- Prettier and ESLint are authoritative — do not hand-tune formatting.
- Follow directory-specific conventions defined in each `AGENTS.md`.

## Issues

- Search existing issues before opening a new one.
- Bug reports should include:
  - Reproduction steps
  - Expected vs. actual behavior
  - Environment details (OS, Node version, etc.)

## Governance & Exceptions

- Normal contributions merge automatically after passing gates.
- If an AI review fails and you believe it should pass, use the proposal link to request a DAO vote.
- DAO proposals should reference the PR number and briefly explain why the exception benefits the project.

## Security

Do not disclose security vulnerabilities here.  
See `SECURITY.md` for private reporting instructions.

Thank you for helping grow the Cogni ecosystem responsibly.
