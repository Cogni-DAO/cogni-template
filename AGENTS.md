# AGENTS.md — Cogni-Template MetaPrompt

> Scope: repository-wide orientation for all agents. Keep ≤150 lines. Subdirs inherit from this.

## Mission

Provide a reproducible, open-source foundation for autonomous AI-powered organizations:

- All infra deployable via open tooling (Docker + OpenTofu + Akash)
- All accounting and payments via DAO-controlled crypto wallets
- Strict reproducibility and code discipline across all Cogni repos

## Workflow Guiding Principles

- **Spec first:** Write the plan before code. Confirm the plan with the user.
- **Compact progress:** Summarize after each step.
- **Prune aggressively:** Delete noise, keep signal.
- **Delegate cleanly:** Use subagents with narrow scopes.
- **Validate early:** Run `pnpm check` before proposing commits.
- **Update docs:** Reflect any surface changes in AGENTS.md.

## Agent Behavior

- Follow this root file as primary instruction; subdir AGENTS.md may extend but not override core principles.
- Never modify outside assigned directories.
- Keep context lean (<40% window); summarize often.
- Purge incorrect info instead of propagating it.

## Environment

- **Framework:** Next.js (TypeScript, App Router)
- **Infra:** Docker + OpenTofu → Spheron (managed Akash)
- **Toolchain:** pnpm, ESLint, Prettier, Vitest, Playwright, SonarQube
- **CI entrypoint:** `pnpm check`

## Pointers

- [Architecture](docs/ARCHITECTURE.md)
- [Implementation Plan](docs/IMPLEMENTATION_PLAN.md)
- [Feature Development Guide](docs/FEATURE_DEVELOPMENT_GUIDE.md)
- [UI Implementation Guide](docs/UI_IMPLEMENTATION_GUIDE.md)
- [Repo Specification](.cogni/repo-spec.yaml)
- [Subdir AGENTS.md Policy](docs/templates/agents_subdir_template.md)
- [Style & Lint Rules](docs/STYLE.md)

## Usage

```bash
pnpm dev            # start dev server
pnpm dev:stack      # start dev server + infrastructure (main dev workflow)
pnpm docker:stack   # start full production simulation locally (https://localhost - browser will warn about cert)
pnpm build          # build for production
pnpm check          # lint + type + format validation
pnpm test           # run unit/integration tests (no server required)
pnpm test:ci        # run tests with coverage for CI/CD
pnpm test:int        # Integration tests (testcontainers, no server)
pnpm test:stack      # Stack tests (requires server + DB)
pnpm format         # prettier format fixes
pnpm check:docs     # lint AGENTS.md documentation
pnpm e2e            # end-to-end tests
```
