# app/providers · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derek @core-dev
- **Last reviewed:** 2025-11-26
- **Status:** draft

## Purpose

Client-side provider composition for the web UI shell. Configures React context providers (NextAuth SessionProvider, wagmi, RainbowKit, React Query) that wrap the Next.js App Router tree.

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
  - `AuthProvider` - NextAuth SessionProvider wrapper for auth context
  - `QueryProvider` - React Query client provider
  - `WalletProvider` - wagmi + RainbowKit provider (creates config dynamically in useEffect)
  - `createAppLightTheme` - RainbowKit light theme matching design system (--muted colors)
  - `createAppDarkTheme` - RainbowKit dark theme matching design system (--accent colors)
  - `buildWagmiConfigOptions` - Pure helper for wagmi config (testable without React)
  - `WagmiConnector`, `WagmiConnectorsLib`, `WagmiConfigOptions` - Wagmi type aliases
- **Routes (if any):** none
- **CLI (if any):** none
- **Env/Config keys:** Reads `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`
- **Files considered API:** app-providers.client.tsx, wallet.client.tsx, wagmi-config-builder.ts, rainbowkit-theme.ts

## Ports (optional)

- **Uses ports:** none
- **Implements ports:** none
- **Contracts:** none

## Responsibilities

- This directory **does**: compose client-side React providers; configure wagmi chains and connectors; provide global context for wallet connections and auth sessions; export pure config builder helpers
- This directory **does not**: contain business logic; implement ports; make direct API calls; touch core domain

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
- Provider order matters: AuthProvider → QueryProvider → WalletProvider
- wagmi config uses Base mainnet (8453) from shared web3 chain configuration
- Chain configuration hardcoded to Base; not selectable via env

## Dependencies

- **Internal:** @shared/env (client env only)
- **External:** next-auth/react, wagmi, viem, @rainbow-me/rainbowkit, @tanstack/react-query

## Change Protocol

- Update this file when **public surface** changes (new providers, new exports)
- Bump **Last reviewed** date
- Ensure new providers maintain architectural boundaries (no core/ports/adapters imports)

## Notes

- This subdomain is part of the /app delivery layer
- Equivalent role to /bootstrap (server runtime) and /mcp (MCP runtime)
- Providers only configure client-side infrastructure, no domain logic
- wagmi v2 API (compatible with RainbowKit 2.2.9)
- wagmi config created in WalletProvider useEffect (dynamic import) to prevent indexedDB SSR errors
- wagmi-config-builder.ts extracted for testability: generic helper tested with simple types, production uses WagmiConnector
- RainbowKit theme functions use design system tokens: light mode uses --muted for subtle button appearance, dark mode uses --accent for proper contrast
