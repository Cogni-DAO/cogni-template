# components · AGENTS.md

> Scope: this directory only. Keep ≤150 lines.

## Metadata

- **Owners:** @cogni-dao/core
- **Last reviewed:** 2025-12-13
- **Status:** stable

## Purpose

UI components for DAO formation feature. Presentational components that mirror PaymentFlowDialog pattern.

## Pointers

- [FormationFlowDialog.tsx](./FormationFlowDialog.tsx): Main dialog component
- [PaymentFlowDialog.tsx](../../payments/hooks/usePaymentFlow.ts): Reference pattern

## Boundaries

```json
{
  "layer": "features",
  "may_import": ["components", "shared", "types"],
  "must_not_import": ["core", "ports", "adapters", "app", "bootstrap"]
}
```

## Public Surface

- **Exports:**
  - `FormationFlowDialog` - Modal for formation progress/results
- **Props:** `FormationFlowDialogProps` interface
- **Files considered API:** `FormationFlowDialog.tsx`

## Responsibilities

- This directory **does**: Render formation flow states, display errors with debug details
- This directory **does not**: Contain state management, transaction logic, or API calls

## Usage

```typescript
import { FormationFlowDialog } from "@/features/setup/components/FormationFlowDialog";
```

## Standards

- Components are pure presentational
- Use `toUiError` for error normalization
- Mirror PaymentFlowDialog layout patterns
- Use kit components only (Dialog, Button, etc.)

## Dependencies

- **Internal:** `@/components/kit`, `@/shared/errors`, `@/shared/web3/chain`
- **External:** lucide-react, wagmi

## Change Protocol

- Update when component props change
- Keep in sync with `formation.reducer.ts` phase types
- Bump parent **Last reviewed** date

## Notes

- FormationFlowDialog mirrors PaymentFlowDialog pattern
- Error display uses `toUiError` for EIP-1193 code normalization
