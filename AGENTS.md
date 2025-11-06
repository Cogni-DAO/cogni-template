# AGENTS.md — Cogni-Template MetaPrompt

This repository defines the **Cogni-Template**, a fully web3-enclosed, open-source starter for Cogni-based companies and DAOs.

---

## Mission

Provide a reproducible, open foundation for autonomous AI-powered organizations:

- Every service deployable through open-source infrastructure.
- Every payment, credit, and interaction handled via crypto wallets.
- Every decision recorded and enforceable by DAO control files inside `.cogni/`.

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

## Architectural Overview

- **Frontend:** Next.js (App Router, TypeScript, Tailwind, shadcn/ui components).
- **Web3 Layer:** wagmi + RainbowKit + viem for wallet auth and transaction flow.
- **AI Layer:** LiteLLM proxy → OpenRouter crypto API → LangGraph workflows → Langfuse analytics.
- **Backend API:** Next.js route handlers for health, AI, and web3 verification.
- **Storage/State:** Postgres (for LiteLLM account + API key mapping) hosted by Vultr
- **DAO Integration:** `.cogni/` directory defines `dao.json`, `repo-spec.yaml`, and permission schema for DAO wallet + git operations.
- **Infra:** OpenTofu/Terraform modules + Dockerfiles for Akash deployment and local parity.
- **Observability:** Pino → Loki transport; Langfuse for AI run tracing.
- **CI/CD:** GitHub Actions or Jenkinsfile templates covering lint → test → build → deploy.

---

## Strict Rules

- **Styling:** Tailwind preset + shadcn/ui only. No inline styles, no arbitrary values.
- **Linting:** ESLint (typescript, boundaries, tailwind, import rules) + Prettier required.
- **Git Commits:** Conventional Commits enforced via commitlint. Format: `type(scope): subject` ≤72 chars.

### Tailwind ESLint

- Using `@poupe/eslint-plugin-tailwindcss` due to pnpm resolver issues with the official beta.
- To switch back:
  1. `pnpm add -D eslint-plugin-tailwindcss@latest`
  2. In `eslint.config.mjs`, swap plugin import and key:
     - enable `officialTailwind`, disable `communityTailwind`
  3. Remove `@poupe/eslint-plugin-tailwindcss` if stable
- **Type Safety:** No `any`. Full TypeScript coverage.
- **File System Boundaries:** `features/` modules isolated; no cross-feature imports.
- **No External Secrets:** All env vars defined via `.env.ts` schema; no hardcoded keys.
- **OSS-First Dependencies:** next.js, wagmi, viem, liteLLM, langgraph, langfuse, pino, loki, zod, tailwind, shadcn/ui.
- **Tests:** vitest + playwright only.

---

## Expected Behavior

- [ ] Users connect wallets → obtain API key → consume AI credits.
- [ ] DAO treasury funds OpenRouter account and Akash deployment via crypto.
- [ ] LiteLLM proxy meters usage, updates token balance, and reports to Langfuse.
- [ ] All actions observable through Langfuse dashboards and Loki logs.
- [ ] CI/CD ensures zero drift between local and deployed builds.
- [ ] Any new Cogni project clones this template and extends only the `features/` domain.

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

# Testing (not yet implemented)
pnpm test
```

---

**Goal:** this repo proves a fully self-hosted, crypto-funded AI + Web3 company template can exist—minimal, verifiable, and owned by its DAO.

CRITICAL: as you are assembling each file, you do NOT write custom code. You must find and copy working impementations from OSS for each file, or our sister repositories at https://github.com/Cogni-DAO

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
