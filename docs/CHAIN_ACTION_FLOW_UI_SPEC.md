# Chain Action Flow UI Design

> [!CRITICAL]
> Reusable step visualization component for multi-step on-chain operations. Applies to DAO formation, payments, and future chain-interactive flows.

> [!NOTE]
> **MVP (P0)**: Fully reuses minimalistic Payments frontend components. See [NODE_FORMATION_SPEC.md](NODE_FORMATION_SPEC.md) for P0 scope.

---

## Core Invariants

1. **Generic Step Model**: Component accepts any `Step[]` array with `label`, `status`, optional `txHash`. Domain-agnostic.

2. **Three Visual States**: Each step renders as `pending` (empty circle), `active` (spinner), or `complete` (checkmark).

3. **Composable**: Works standalone or inside Dialog/Card. Parent controls state; component is purely presentational.

---

## Component API

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

---

## Visual Design

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

---

## Usage Examples

### DAO Formation

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

### Payment Flow

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

---

## File Pointers (vNext)

| File                                                     | Purpose                          |
| -------------------------------------------------------- | -------------------------------- |
| `src/components/kit/feedback/ChainActionSteps.tsx`       | Step list visualization          |
| `src/components/kit/feedback/ChainActionSummaryCard.tsx` | Summary card with icon + network |
| `src/components/kit/overlays/ChainActionDialog.tsx`      | Composed dialog component        |
| `src/components/index.ts`                                | Barrel exports                   |

---

## Migration Path

1. Build `ChainActionSteps` as standalone component
2. Create `ChainActionDialog` composing existing Dialog + new Steps
3. Migrate `PaymentFlowDialog` to use `ChainActionDialog`
4. Migrate DAO formation dialog to use `ChainActionDialog`
5. Delete redundant dialog implementations

---

**Last Updated**: 2025-12-13
**Status**: Draft (vNext)
