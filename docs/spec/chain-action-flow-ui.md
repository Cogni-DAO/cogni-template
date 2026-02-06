---
id: chain-action-flow-ui-spec
type: spec
title: Chain Action Flow UI Design
status: active
spec_state: draft
trust: draft
summary: Reusable step visualization components for multi-step on-chain operations (DAO formation, payments, etc.).
read_when: Building or modifying multi-step on-chain transaction UIs.
owner: derekg1729
created: 2026-02-06
verified: 2026-02-06
tags: [web3]
---

# Chain Action Flow UI Design

## Context

Multi-step on-chain operations (DAO formation, payments, future chain-interactive flows) need a reusable step visualization component. MVP (P0) fully reuses minimalistic Payments frontend components. See [NODE_FORMATION_SPEC.md](../NODE_FORMATION_SPEC.md) for P0 scope.

## Goal

Provide domain-agnostic, composable step visualization components that any on-chain flow can use — accepting a `Step[]` array and rendering pending/active/complete/error states.

## Non-Goals

- Domain-specific step logic inside the component (parent controls state)
- Custom animations beyond spinner/checkmark/error icons
- Server-side step orchestration (this is purely presentational)

## Core Invariants

1. **GENERIC_STEP_MODEL**: Component accepts any `Step[]` array with `label`, `status`, optional `txHash`. Domain-agnostic.

2. **THREE_VISUAL_STATES**: Each step renders as `pending` (empty circle), `active` (spinner), or `complete` (checkmark). Plus `error` (X icon).

3. **COMPOSABLE_PRESENTATIONAL**: Works standalone or inside Dialog/Card. Parent controls state; component is purely presentational.

## Schema

### `ChainActionSteps`

```typescript
interface Step {
  id: string;
  label: string;
  activeLabel?: string; // e.g., "Signing..." vs "Sign transaction"
  status: "pending" | "active" | "complete" | "error";
  txHash?: string;
  explorerUrl?: string;
}

interface ChainActionStepsProps {
  steps: Step[];
  className?: string;
}
```

### `ChainActionSummaryCard`

```typescript
interface ChainActionSummaryCardProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode; // e.g., token symbol avatar
  networkBadge?: string; // e.g., "Ethereum Sepolia"
  className?: string;
}
```

### `ChainActionDialog`

Composed component combining summary card + steps + action buttons.

```typescript
interface ChainActionDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  summary?: ChainActionSummaryCardProps;
  steps: Step[];
  result: "SUCCESS" | "ERROR" | null;
  errorMessage?: string;
  successMessage?: string;
  primaryAction?: { label: string; onClick: () => void; disabled?: boolean };
  secondaryAction?: { label: string; onClick: () => void };
}
```

## Design

### Visual Design

```
┌─────────────────────────────────────────────────┐
│  [Title]                                        │
│  [Description]                                  │
├─────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────────┐  │
│  │  [Icon]  Token Name                       │  │
│  │          Network Badge                    │  │
│  └───────────────────────────────────────────┘  │
├─────────────────────────────────────────────────┤
│  ✓  Pin data on IPFS                            │
│  ✓  Prepare transaction                         │
│  ○  Sign transaction              [Wallet 🔗]   │
│  ○  Confirm transaction                         │
│  ○  Index onchain data                          │
├─────────────────────────────────────────────────┤
│  [ Primary Action ]  [ Cancel ]                 │
└─────────────────────────────────────────────────┘
```

**Step Icons:**

- `pending`: Empty circle (muted)
- `active`: Spinner (primary color)
- `complete`: Checkmark (success color)
- `error`: X icon (destructive color)

### Usage Examples

#### DAO Formation

```typescript
const formationSteps: Step[] = [
  { id: "preflight", label: "Check network", status: "complete" },
  {
    id: "create-dao",
    label: "Create DAO",
    activeLabel: "Creating DAO...",
    status: "active",
    txHash,
  },
  { id: "deploy-signal", label: "Deploy signal contract", status: "pending" },
  { id: "verify", label: "Verify deployment", status: "pending" },
];
```

#### Payment Flow

```typescript
const paymentSteps: Step[] = [
  { id: "intent", label: "Prepare payment", status: "complete" },
  {
    id: "sign",
    label: "Sign transaction",
    activeLabel: "Signing...",
    status: "active",
  },
  { id: "confirm", label: "Confirm on-chain", status: "pending" },
  { id: "verify", label: "Verify payment", status: "pending" },
];
```

### File Pointers

| File                                                     | Purpose                          |
| -------------------------------------------------------- | -------------------------------- |
| `src/components/kit/feedback/ChainActionSteps.tsx`       | Step list visualization          |
| `src/components/kit/feedback/ChainActionSummaryCard.tsx` | Summary card with icon + network |
| `src/components/kit/overlays/ChainActionDialog.tsx`      | Composed dialog component        |
| `src/components/index.ts`                                | Barrel exports                   |

## Acceptance Checks

**Manual:**

1. Render `ChainActionSteps` with a mix of pending/active/complete/error steps — verify correct icons
2. Verify `ChainActionDialog` composes summary + steps + action buttons
3. Verify parent can control step state without component re-mounting

## Rollout / Migration

1. Build `ChainActionSteps` as standalone component
2. Create `ChainActionDialog` composing existing Dialog + new Steps
3. Migrate `PaymentFlowDialog` to use `ChainActionDialog`
4. Migrate DAO formation dialog to use `ChainActionDialog`
5. Delete redundant dialog implementations

## Open Questions

_(none)_

## Related

- [Node Formation](../NODE_FORMATION_SPEC.md)
