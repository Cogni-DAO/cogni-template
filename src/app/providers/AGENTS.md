# app/providers · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derek @core-dev
- **Last reviewed:** 2025-11-21
- **Status:** draft

## Purpose

Client-side provider composition for the web UI shell. Configures React context providers (wagmi, RainbowKit, React Query) that wrap the Next.js App Router tree.

## Pointers

- [Root AGENTS.md](../../../AGENTS.md)
- [Architecture](../../../docs/ARCHITECTURE.md)
- [App AGENTS.md](../AGENTS.md)

## Boundaries

```json
{
  "layer": "app",
  "may_import": ["shared"],
  "must_not_import": ["core", "ports", "adapters", "features"]
}
```

## Public Surface

- **Exports:**
  - `AppProviders` - Main composition component (imports all sub-providers)
  - `QueryProvider` - React Query client provider
  - `WalletProvider` - wagmi + RainbowKit provider (creates config internally via dynamic import)
- **Routes (if any):** none
- **CLI (if any):** none
- **Env/Config keys:** Reads `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`, `NEXT_PUBLIC_CHAIN_ID`
- **Files considered API:** app-providers.client.tsx, wallet.client.tsx

## Ports (optional)

- **Uses ports:** none
- **Implements ports:** none
- **Contracts:** none

## Responsibilities

- This directory **does**: compose client-side React providers; configure wagmi chains and connectors; provide global context for wallet connections
- This directory **does not**: contain business logic; implement ports; make API calls; touch core domain

## Usage

```typescript
// In app/layout.tsx
import { AppProviders } from "./providers/app-providers.client";

<AppProviders>
  <YourApp />
</AppProviders>;
```

## Standards

- All provider components are client components ('use client')
- Provider order matters: QueryProvider → WalletProvider
- wagmi config uses Ethereum Sepolia (11155111) as primary chain per Aragon constraint
- Base Sepolia (84532) available as additional testnet
- Structure ready for mainnet expansion (Base, Optimism, etc.)

## Dependencies

- **Internal:** @shared/env (client env only)
- **External:** wagmi, viem, @rainbow-me/rainbowkit, @tanstack/react-query

## Change Protocol

- Update this file when **public surface** changes (new providers, new exports)
- Bump **Last reviewed** date
- Ensure new providers maintain architectural boundaries (no core/ports/adapters imports)

## Notes

- This subdomain is part of the /app delivery layer
- Equivalent role to /bootstrap (server runtime) and /mcp (MCP runtime)
- Providers only configure client-side infrastructure, no domain logic
- wagmi v2 API (compatible with RainbowKit 2.2.9)
- WalletProvider uses dynamic import for connectors to avoid SSR IndexedDB errors (WalletConnect not SSR-safe)
