# Contributing

Cogni is a unique open project: every pull request passes through **automated CI** and **AI-assisted review gates**.  
If your code passes all checks, it will be merged automatically.  
If it fails **only** the Cogni-Git-Review AI gate, a link will appear allowing you to **submit a DAO proposal** for human + token-holder review.  
Use that path sparingly — voting is reserved for meaningful exceptions or governance-level changes.

---

## Prerequisites

**First time setup:**

```bash
platform/bootstrap/bootstrap  # installs Node, pnpm, OpenTofu, Docker + all project dependencies
```

## Workflow

1. **Fork** the repo (default branch is `staging` — that's correct).

2. **Clone and set upstream:**

   ```bash
   git clone git@github.com:<your-username>/cogni-template.git
   cd cogni-template
   git remote add upstream git@github.com:Cogni-DAO/cogni-template.git
   ```

3. **Always branch from staging using Conventional Commit types:**

   ```bash
   git checkout staging
   git reset --hard upstream/staging
   git checkout -b feat/ai-preview-health-checks
   # or: fix/litellm-config-bug, chore/ci-playwright-cache, docs/update-readme, etc.
   ```

4. **Run local checks before committing:**

   ```bash
   pnpm check
   ```

5. **Use Conventional Commits:** `feat:`, `fix:`, `docs:`, `chore:`

6. **Open PRs to staging only:**
   - Push: `git push origin feat/xyz`
   - Open PR: `your-fork:feat/xyz → Cogni-DAO/cogni-template:staging`
   - PRs to `main` are blocked by design

7. All CI and AI gates must pass for auto-merge.

**Branch naming convention:**

- Use Conventional Commit types: `feat/`, `fix/`, `chore/`, `docs/`, `refactor/`
- Examples: `feat/ai-preview-health-checks`, `fix/litellm-config-bug`, `chore/ci-playwright-cache`

**See [CI/CD Pipeline Flow](docs/CI-CD.md) for branch model details.**

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
