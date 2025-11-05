# /src — Application Source Code

## Purpose
This directory contains the complete Next.js application source code for the Cogni-Template, implementing a fully web3-enclosed, crypto-funded AI + Web3 company template.

## Key Directories
- `app/` — Next.js App Router (layouts, pages, API routes)
- `components/` — Shared UI components and design system primitives  
- `features/` — Domain-specific vertical slices with strict boundaries
- `lib/` — Core framework-agnostic business logic and integrations
- `styles/` — Global design system and Tailwind configuration
- `types/` — Global TypeScript type definitions
- `assets/` — Static icons and images imported in code

## Responsibilities
- **Frontend UI**: Next.js App Router with TypeScript, Tailwind, shadcn/ui components
- **Web3 Integration**: Wallet authentication via wagmi + RainbowKit + viem
- **AI Orchestration**: LiteLLM proxy → OpenRouter → LangGraph workflows → Langfuse analytics
- **API Layer**: Next.js route handlers for health checks, AI endpoints, web3 verification
- **Data Layer**: Type-safe database operations with Postgres via Drizzle/Prisma
- **Environment Management**: Zod-validated environment variables with client/server separation

## Architecture Rules
- **Feature Boundaries**: No cross-feature imports (enforced by ESLint boundaries)
- **Type Safety**: No `any` types, full TypeScript coverage with strict configuration
- **OSS-Only**: All dependencies must be open source
- **Web3 Enclosure**: All resources authenticated by connected wallets
- **Crypto Accounting**: Infrastructure and usage funded by DAO-controlled wallets

## Standards
- **Linting**: ESLint with typescript, boundaries, tailwind, import rules
- **Formatting**: Prettier with consistent configuration
- **Styling**: Tailwind preset + shadcn/ui components, no arbitrary values
- **Testing**: vitest for unit/integration, Playwright for E2E
- **Documentation**: Every subdirectory has AGENTS.md following this template

## Dependencies
**Internal**: Each subdirectory imports only from `lib/` or its own scope
**External**: wagmi, viem, RainbowKit, LiteLLM, LangGraph, Langfuse, zod, pino, drizzle

## Notes
- Copy working implementations from OSS repos or https://github.com/Cogni-DAO
- Never write custom code when proven patterns exist
- All API integrations must be crypto-funded (no traditional payment providers)