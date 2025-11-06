# AGENTS.md — Cogni-Template MetaPrompt

This repository defines the **Cogni-Template**, a fully web3-enclosed, open-source starter for Cogni-based companies and DAOs.

---

## Mission

Provide a reproducible, open source foundation for autonomous AI-powered organizations:

- Every service deployable through open-source infrastructure.
- Every payment, credit, and interaction handled via crypto wallets.
- Strict architecture and style rules, empowering syntropy via AI code contributions globally

---

## Core Principles

1. **Web3 Enclosure** — all resources authenticated by connected wallets.
2. **Crypto-only Accounting** — infrastructure, LLM usage, and deployments funded by DAO-controlled wallets.
3. **Reproducible Infra** — Terraform/OpenTofu deploys to Akash; same config builds locally via Docker.
4. **Open-Source Stack Only** — no proprietary SaaS dependencies.
5. **Strict Code Discipline** — lint, type, and style enforcement identical across all Cogni repos.
6. **Proof-of-Concept Scope** — implement minimal working integrations only; no product logic.
7. **Documentation** - Every subdirectory has an AGENTS.md file, following the model of AGENTS_template.md

---

## Pointers

- [Architecture](docs/ARCHITECTURE.md) - System design and structure
- [Implementation Plan](docs/IMPLEMENTATION_PLAN.md) - Current development roadmap
- [Repo Specification](.cogni/repo-spec.yaml) - DAO governance rules

## Strict Rules

- **Styling:** Tailwind preset + shadcn/ui only. No inline styles, no arbitrary values.
- **Linting:** ESLint (typescript, boundaries, tailwind, import rules) + Prettier required.
- **Git Commits:** Conventional Commits enforced via commitlint. Format: `type(scope): subject` ≤72 chars.
- **Type Safety:** No `any`. Full TypeScript coverage.
- **File System Boundaries:** `features/` modules isolated; no cross-feature imports.
- **No External Secrets:** All env vars defined via `.env.ts` schema; no hardcoded keys.
- **OSS-First Dependencies:** Core stack only (see docs/STYLE.md for details).
- **Tests:** vitest + playwright only.

---

## Do Not Add

- Product-specific logic.
- External payment providers.
- Closed-source SDKs.
- Inline styling or arbitrary Tailwind values.
- CommonJS or untyped packages.

---

## Usage

```bash
# Development server
pnpm dev

# Build for production
pnpm build

# Quality assurance (typecheck + lint + format check)
pnpm check

# Auto-fix linting and formatting issues
pnpm lint:fix

pnpm format

# Testing (not yet implemented)
pnpm test
```

---

# Workflow Guiding Principles:

- _Spec First:_ Always begin with clear task specs—not just code—before work starts.
- _Compact Progress:_ After each step, distill state and next actions. Only keep essentials in context.
- _Prune Aggressively:_ Remove old/noisy or irrelevant details. Regularly re-compact files and logs for clarity.
- _Delegate with Subagents:_ Use focused subagents and only retain concise outputs from them.
- _Keep Context Lean:_ Don’t exceed 40% context window; summarize and reset often.
- _Structured Planning:_ List every file, change, and test in your plan before implementation.
- _Review Early:_ Validate research and plan before code. Prioritize catching errors early.
- _Continuously Update:_ Mark tasks complete, keep progress visible, and re-compact context as you go.
- _No Bad Info:_ Incorrect or noisy info must be purged—better to have less but accurate context.

Follow these to ensure reliable, aligned, and efficient agent workflows.
