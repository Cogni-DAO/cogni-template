# Payments Frontend Design: USDC Payment Flow

**Status:** Implementation complete - MVP ready for manual validation
**Depends on:** Phase 1 Backend (complete)
**Replaces:** DePay widget (`src/components/vendor/depay/`)

---

## Implementation Checklist (Priority Order)

### 1. Prerequisites ✅

- [x] Add `alert` from shadcn: `pnpm dlx shadcn@latest add alert`
- [x] Add `progress` from shadcn: `pnpm dlx shadcn@latest add progress`
- [x] Create kit wrappers for shadcn components in `src/components/kit/feedback/`

### 2. Core Implementation ✅

- [x] Use `src/shared/web3/erc20-abi.ts` - generic ERC20 ABI for token operations
- [x] Create `src/shared/http/paymentsClient.ts` - typed API client (discriminated union returns)
- [x] Create `src/features/payments/utils/mapBackendStatus.ts` - ONE status mapping function
- [x] Create `src/features/payments/hooks/usePaymentFlow.ts` - orchestration hook
- [x] Create `src/components/kit/payments/UsdcPaymentFlow.tsx` - presentational component
- [x] Add CVA factories to `src/styles/ui/payments.ts`
- [x] Export from barrel: `src/components/index.ts`

### 3. Integration ✅

- [x] Update `CreditsPage.client.tsx` - replace DePayWidget
- [x] Update docblock (remove DePay references)

### 4. Cleanup ✅

- [x] Delete `src/components/vendor/depay/` directory
- [x] Remove `@depay/widgets` from package.json

### 5. Architecture Fixes ✅

- [x] Create `src/types/payments.ts` - extract PaymentFlowState, status enums, error codes
- [x] Move `src/shared/http/paymentsClient.ts` → `src/features/payments/api/paymentsClient.ts`
- [x] Update `.dependency-cruiser.cjs` to allow `features → contracts`
- [x] Update `mapBackendStatus.ts` to import from `/types` instead of `contracts`
- [x] Update `usePaymentFlow.ts` to import/export types from `/types`
- [x] Update `UsdcPaymentFlow.tsx` to import `PaymentFlowState` from `/types` (not hook)
- [x] Shorten doc headers in `usePaymentFlow.ts` and `mapBackendStatus.ts`

### 6. Functional Debugging ✅

- [x] Debug POST /api/v1/payments/intents 400 error
- [x] Inspect request body and response
- [x] Verify SIWE session exists
- [x] Check billing account resolution
- [x] Validate amountUsdCents calculation (dollars → cents)

**Note:** All flows verified passing via stack tests (28/28)

### 7. MVP Tests (Post-Fix)

- [ ] Happy path: READY → PENDING → DONE(SUCCESS)
- [ ] Wallet reject → DONE(ERROR) with message
- [ ] Backend REJECTED renders distinct error (e.g., SENDER_MISMATCH)
- [ ] Backend FAILED renders distinct error (e.g., TX_REVERTED)

### 8. Final Validation

- [x] `pnpm check` passes with 0 violations
- [ ] Manual test on Sepolia with real USDC
- [ ] Mobile viewport (360px) works
- [x] Update `docs/PAYMENTS_DESIGN.md` Phase 2 checklist

---

## Current Implementation Status

### ✅ Files Created

| File                                              | Status      | Notes                         |
| ------------------------------------------------- | ----------- | ----------------------------- |
| `src/shared/web3/erc20-abi.ts`                    | ✅ Complete | Generic ERC20 ABI             |
| `src/features/payments/api/paymentsClient.ts`     | ✅ Complete | Typed API client              |
| `src/features/payments/utils/mapBackendStatus.ts` | ✅ Complete | Status mapping from `/types`  |
| `src/features/payments/hooks/usePaymentFlow.ts`   | ✅ Complete | Payment flow orchestration    |
| `src/types/payments.ts`                           | ✅ Complete | Shared payment types          |
| `src/components/kit/feedback/Alert.tsx`           | ✅ Complete | Kit wrapper for shadcn        |
| `src/components/kit/feedback/Progress.tsx`        | ✅ Complete | Kit wrapper for shadcn        |
| `src/components/kit/payments/UsdcPaymentFlow.tsx` | ✅ Complete | Payment flow component        |
| `src/styles/ui/payments.ts`                       | ✅ Complete | CVA factories                 |
| `src/app/(app)/credits/CreditsPage.client.tsx`    | ✅ Updated  | DePay removed, new flow wired |

---

## Design Guardrails

### 1. Hex Architecture Boundaries

| Layer      | Location                   | Can Import                                     | Cannot Import        |
| ---------- | -------------------------- | ---------------------------------------------- | -------------------- |
| Types      | `/types/payments.ts`       | Nothing (bottom layer)                         | -                    |
| API Client | `features/payments/api/`   | `contracts`, `/types`                          | `ports`, `adapters`  |
| Hook       | `features/payments/hooks/` | wagmi, `/types`, `../api`                      | `contracts` directly |
| Component  | `components/kit/payments/` | `/types`, `@/styles/ui`, `@/components` kit    | `features/*`         |
| Page       | `app/(app)/credits/`       | `@/components`, `@/features/*/hooks`, `/types` | `adapters`, `ports`  |

**Forbidden:**

- `shared` importing from `contracts` (infrastructure cannot know about API surface)
- `components/kit` importing from `features` (kit must stay dumb)
- Any layer importing from `@/adapters` directly (port abstraction required)

### 2. API Client (Discriminated Union Returns)

**Location:** `src/features/payments/api/paymentsClient.ts` (NOT `shared/http` - arch violation)

Create typed client:

```typescript
import type {
  PaymentIntentInput,
  PaymentIntentOutput,
} from "@/contracts/payments.intent.v1.contract";
import type {
  PaymentSubmitInput,
  PaymentSubmitOutput,
} from "@/contracts/payments.submit.v1.contract";
import type { PaymentStatusOutput } from "@/contracts/payments.status.v1.contract";

type ApiSuccess<T> = { ok: true; data: T };
type ApiError = { ok: false; error: string; errorCode?: string };
type ApiResult<T> = ApiSuccess<T> | ApiError;

async function handleResponse<T>(res: Response): Promise<ApiResult<T>> {
  const body = await res.json().catch(() => ({ error: "Invalid response" }));

  if (!res.ok) {
    return {
      ok: false,
      error: body.error ?? body.errorMessage ?? "Request failed",
      errorCode: body.errorCode,
    };
  }

  return { ok: true, data: body as T };
}

export const paymentsClient = {
  createIntent: async (
    input: PaymentIntentInput
  ): Promise<ApiResult<PaymentIntentOutput>> => {
    const res = await fetch("/api/v1/payments/intents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    return handleResponse<PaymentIntentOutput>(res);
  },

  submitTxHash: async (
    attemptId: string,
    input: PaymentSubmitInput
  ): Promise<ApiResult<PaymentSubmitOutput>> => {
    const res = await fetch(`/api/v1/payments/attempts/${attemptId}/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    return handleResponse<PaymentSubmitOutput>(res);
  },

  getStatus: async (
    attemptId: string
  ): Promise<ApiResult<PaymentStatusOutput>> => {
    const res = await fetch(`/api/v1/payments/attempts/${attemptId}`);
    return handleResponse<PaymentStatusOutput>(res);
  },
};
```

**Why discriminated unions:** Hook can pattern-match on `ok` field to surface real server errors (errorCode/errorMessage) instead of generic "Request failed" strings.

**Note:** Currently at `src/shared/http/paymentsClient.ts` (wrong location - violates hex architecture). Must move to `src/features/payments/api/paymentsClient.ts` per Phase 2 of architecture fixes.

### 3. Status Mapping (Single Source of Truth)

**Location:** `src/features/payments/utils/mapBackendStatus.ts`

**IMPORTANT:** Must import `PaymentStatus` and `PaymentErrorCode` from `@//types/payments` (NOT from `@/contracts`).

Create:

```typescript
import type { PaymentStatusOutput } from "@/contracts/payments.status.v1.contract";

export type UiPhase = "READY" | "PENDING" | "DONE";
export type UiResult = "SUCCESS" | "ERROR" | null;

export interface MappedStatus {
  phase: UiPhase;
  result: UiResult;
  errorMessage: string | null;
}

/**
 * Maps backend client-visible status to UI phase and result.
 * This is the ONLY place backend status strings should be interpreted.
 *
 * VERIFIED: Status values match payments.status.v1.contract.ts exactly:
 * - PENDING_VERIFICATION (backend verifying)
 * - CONFIRMED (credits applied)
 * - FAILED (terminal error)
 */
export function mapBackendStatus(
  status: PaymentStatusOutput["status"],
  errorCode?: string
): MappedStatus {
  switch (status) {
    case "PENDING_VERIFICATION":
      return { phase: "PENDING", result: null, errorMessage: null };
    case "CONFIRMED":
      return { phase: "DONE", result: "SUCCESS", errorMessage: null };
    case "FAILED":
      return {
        phase: "DONE",
        result: "ERROR",
        errorMessage: getErrorMessage(errorCode),
      };
    default:
      // Should never hit - all statuses covered, but TypeScript needs it
      return { phase: "READY", result: null, errorMessage: null };
  }
}

function getErrorMessage(errorCode?: string): string {
  const messages: Record<string, string> = {
    SENDER_MISMATCH: "Transaction sender does not match your wallet",
    INVALID_TOKEN: "Wrong token used for payment",
    INVALID_RECIPIENT: "Payment sent to wrong address",
    INSUFFICIENT_AMOUNT: "Payment amount too low",
    TX_REVERTED: "Transaction reverted on-chain",
    RECEIPT_NOT_FOUND: "Transaction not found after 24 hours",
    INTENT_EXPIRED: "Payment intent expired",
  };
  return messages[errorCode ?? ""] ?? "Payment failed";
}
```

### 4. Chain-Agnostic Hook

The hook MUST NOT hardcode chain IDs. All on-chain params come from intent response:

```typescript
// In usePaymentFlow.ts - CORRECT
const intent = await paymentsClient.createIntent({ amountUsdCents });
// Use intent.chainId, intent.token, intent.to, intent.amountRaw

// WRONG - Do not do this
import { CHAIN_ID, USDC_TOKEN_ADDRESS } from "@/shared/web3/chain";
```

This ensures Phase 3 cutover to Base mainnet requires zero hook changes.

### 5. No Resume from Reload (MVP Scope)

Explicitly de-scoped for MVP:

- No localStorage persistence
- No "recent attempts" recovery
- Page reload during PENDING = user must start new payment

Future: Add "recent attempts" panel that queries backend for incomplete payments.

### 6. Full Flow Even with Stub

Even though `OnChainVerifier` always returns VERIFIED in MVP:

- Implement all PENDING substates (SIGNING → CONFIRMING → SUBMITTING → VERIFYING)
- Render error states for REJECTED and FAILED (for future)
- Don't special-case the stub in UI code

This keeps UI stable when Ponder goes live in Phase 3.

---

## Overview

Replace the DePay CDN widget with a native wagmi-based USDC transfer flow that uses our backend payment service for verification and settlement.

### Flow Summary

```
User selects amount → Create Intent (backend)
                   → Execute USDC transfer (wallet)
                   → Submit txHash (backend)
                   → Poll status until CONFIRMED/FAILED
                   → Refresh balance
```

### UI State Machine

```
READY ─────────────→ PENDING ─────────────→ DONE
(show button)        (wallet + chain)        (success/error)
     │                    │                       │
     └── on createIntent  └── on tx confirmed     └── terminal
         + wallet sign        or error
```

---

## Architecture

### File Structure (After Arch Fixes)

```
src/
├── shared/
│   ├── types/
│   │   └── payments.ts               # NEW: Type-only exports (bottom layer)
│   └── web3/
│       ├── chain.ts                  # EXISTS
│       └── erc20-abi.ts              # Generic ERC20 ABI (transfer, balanceOf, decimals)
├── features/payments/
│   ├── api/
│   │   └── paymentsClient.ts         # MOVED: From shared/http (can import contracts)
│   ├── hooks/
│   │   └── usePaymentFlow.ts         # NEW: Orchestration hook
│   └── utils/
│       └── mapBackendStatus.ts       # NEW: Status mapping
├── components/kit/
│   ├── feedback/
│   │   ├── Alert.tsx                 # NEW: Kit wrapper for shadcn
│   │   └── Progress.tsx              # NEW: Kit wrapper for shadcn
│   └── payments/
│       └── UsdcPaymentFlow.tsx       # NEW: Presentational component
├── styles/ui/
│   └── payments.ts                   # NEW: CVA factories
└── app/(app)/credits/
    └── CreditsPage.client.tsx        # MODIFIED: Replace DePayWidget
```

### Layer Responsibilities

| Layer     | File                     | Responsibility                                         |
| --------- | ------------------------ | ------------------------------------------------------ |
| Hook      | `usePaymentFlow.ts`      | State machine, wagmi calls, backend API calls, polling |
| Component | `UsdcPaymentFlow.tsx`    | Render 3 states, callbacks only, no business logic     |
| Page      | `CreditsPage.client.tsx` | Wire hook to component, handle balance refresh         |

---

## Hook Design: `usePaymentFlow`

### Interface

```typescript
// src/features/payments/hooks/usePaymentFlow.ts

export type PaymentFlowPhase = "READY" | "PENDING" | "DONE";

export interface PaymentFlowState {
  phase: PaymentFlowPhase;

  // READY phase
  isCreatingIntent: boolean;

  // PENDING phase
  walletStep: "SIGNING" | "CONFIRMING" | "SUBMITTING" | "VERIFYING" | null;
  txHash: string | null;
  confirmations: number;

  // DONE phase
  result: "SUCCESS" | "ERROR" | null;
  errorMessage: string | null;
  creditsAdded: number | null;
}

export interface UsePaymentFlowOptions {
  amountUsdCents: number;
  onSuccess?: (creditsAdded: number) => void;
  onError?: (message: string) => void;
}

export interface UsePaymentFlowReturn {
  state: PaymentFlowState;
  startPayment: () => Promise<void>;
  reset: () => void;
}

export function usePaymentFlow(
  options: UsePaymentFlowOptions
): UsePaymentFlowReturn;
```

### Internal State Machine

```typescript
// States managed internally via useReducer
type InternalState =
  | { phase: "READY" }
  | { phase: "CREATING_INTENT" }
  | {
      phase: "AWAITING_SIGNATURE";
      attemptId: string;
      transferParams: TransferParams;
    }
  | { phase: "AWAITING_CONFIRMATION"; attemptId: string; txHash: string }
  | { phase: "SUBMITTING_HASH"; attemptId: string; txHash: string }
  | { phase: "POLLING_VERIFICATION"; attemptId: string; txHash: string }
  | { phase: "SUCCESS"; creditsAdded: number }
  | { phase: "ERROR"; message: string };
```

### Wagmi Hooks Used

```typescript
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { useAccount } from "wagmi";
```

### Key Implementation Details

1. **No localStorage** - Backend is source of truth
2. **Single active payment** - Reset required before new payment
3. **Polling interval** - 3 seconds for status check (backend throttles to 10s)
4. **No reload recovery** - De-scoped for MVP
5. **AttemptId guard** - Prevents stale async operations from corrupting state after reset/cancel

---

## Component Design: `UsdcPaymentFlow`

### Architecture

```
UsdcPaymentFlow (composer - manages dialog state)
├─ PaymentButton (always visible)
│  └─ States: idle | loading | disabled
├─ PaymentFlowDialog (modal, controlled)
│  ├─ IN_FLIGHT: spinner + step text + tx link
│  └─ TERMINAL: success/error + Done/Try Again button
└─ PaymentStatusChip (conditional)
   └─ Visible: txHash exists + dialog closed + payment in-flight
```

### Interface

```typescript
// src/components/kit/payments/UsdcPaymentFlow.tsx

export interface UsdcPaymentFlowProps {
  /** Amount in USD cents */
  amountUsdCents: number;

  /** Current flow state from usePaymentFlow */
  state: PaymentFlowState;

  /** Trigger payment initiation */
  onStartPayment: () => void;

  /** Reset to initial state */
  onReset: () => void;

  /** Disable all interactions */
  disabled?: boolean;

  /** Layout className (flex/margin only) */
  className?: string;
}
```

### Dialog Close Behavior

Close behavior is phase-aware based on `txHash`:

| State            | txHash      | Close Action          | Input                       |
| ---------------- | ----------- | --------------------- | --------------------------- |
| Creating intent  | null        | Reset + close         | Editable                    |
| Wallet prompt    | null        | Reset + close         | Editable                    |
| On-chain pending | exists      | Close only, show chip | Locked                      |
| Terminal         | exists/null | Close only            | Locked (use Done/Try Again) |

### Render States (Dialog-Based)

#### PaymentButton (Always Visible)

```tsx
<PaymentButton
  amountUsdCents={amountUsdCents}
  isInFlight={state.isInFlight}
  onClick={() => {
    onStartPayment();
    setIsDialogOpen(true);
  }}
  disabled={disabled || state.result !== null}
/>
```

#### PaymentFlowDialog - IN_FLIGHT State

```tsx
<div className="flex flex-col items-center gap-4 py-6">
  <Loader2 className="text-primary h-8 w-8 animate-spin" />
  <p className="text-muted-foreground text-center text-sm">
    {getStepMessage(walletStep)}
  </p>
  {txHash && explorerUrl && (
    <a href={explorerUrl} target="_blank" rel="noopener noreferrer">
      View transaction <ExternalLink />
    </a>
  )}
</div>
```

#### PaymentFlowDialog - SUCCESS State

```tsx
<div className="flex flex-col items-center gap-6 py-8">
  <CheckCircle2 className="h-16 w-16 text-success" />
  <p className="font-semibold text-xl">
    {creditsAdded} credits added
  </p>
</div>
<Button onClick={() => { onReset(); onClose(); }} size="lg">
  Done
</Button>
```

#### PaymentFlowDialog - ERROR State

```tsx
<div className="flex flex-col items-center gap-6 py-8">
  <XCircle className="text-destructive h-16 w-16" />
  <p className="text-xl font-semibold">{errorMessage ?? "Payment failed"}</p>
</div>
```

#### PaymentStatusChip (When Dialog Closed During On-Chain)

```tsx
{
  showStatusChip && (
    <PaymentStatusChip
      txHash={state.txHash}
      explorerUrl={state.explorerUrl}
      onClick={() => setIsDialogOpen(true)}
    />
  );
}
```

### CVA Styling

```typescript
// Add to src/styles/ui/payments.ts

export const paymentFlowContainer = cva(
  "flex flex-col gap-[var(--spacing-md)]",
  {
    variants: {
      // Future: size variants if needed
    },
  }
);

export const paymentFlowStatus = cva(
  "rounded-lg border border-border bg-muted/50 p-[var(--spacing-md)] text-center",
  {}
);

export const paymentFlowStep = cva(
  "flex items-center gap-[var(--spacing-xs)]",
  {
    variants: {
      state: {
        pending: "text-muted-foreground",
        active: "text-primary font-medium",
        complete: "text-foreground",
      },
    },
  }
);
```

---

## shadcn Components to Add

### Required

| Component  | Purpose                      | Add Command                           |
| ---------- | ---------------------------- | ------------------------------------- |
| `alert`    | Success/error status display | `pnpm dlx shadcn@latest add alert`    |
| `progress` | Confirmation progress bar    | `pnpm dlx shadcn@latest add progress` |

### Usage Pattern

After adding, create kit wrappers:

```typescript
// src/components/kit/feedback/Alert.tsx
import {
  Alert as ShadcnAlert,
  AlertDescription,
} from "@/components/vendor/ui-primitives/shadcn/alert";
// Wrap with CVA, export from kit barrel
```

---

## ERC20 ABI

Payment flow uses the generic `ERC20_ABI` from `src/shared/web3/erc20-abi.ts` for token transfers. The token address (USDC) is provided by the backend payment intent, which sources it from repo-spec.yaml via `getPaymentConfig()`.

**Invariant:** Frontend never hardcodes token addresses or chain IDs - all payment parameters come from backend.

---

## Integration: CreditsPage.client.tsx

### Changes Required

```typescript
// Before
import { DePayWidget } from "@/components/vendor/depay";

// After
import { UsdcPaymentFlow } from "@/components";
import { usePaymentFlow } from "@/features/payments/hooks/usePaymentFlow";
```

### Updated Component

```typescript
export function CreditsPageClient({ widgetConfig }: CreditsPageClientProps): ReactElement {
  const [selectedAmount, setSelectedAmount] = useState<number>(PAYMENT_AMOUNTS[1]);
  const queryClient = useQueryClient();

  const summaryQuery = useQuery({
    queryKey: ["payments-summary"],
    queryFn: fetchSummary,
  });

  const paymentFlow = usePaymentFlow({
    amountUsdCents: selectedAmount * 100, // Convert dollars to cents
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["payments-summary"] });
    },
  });

  return (
    // ... existing balance/ledger UI ...

    {/* Replace DePayWidget with: */}
    <UsdcPaymentFlow
      amountUsdCents={selectedAmount * 100}
      state={paymentFlow.state}
      onStartPayment={paymentFlow.startPayment}
      onReset={paymentFlow.reset}
      disabled={summaryQuery.isLoading}
    />
  );
}
```

---

## Token Compliance

All styling MUST use semantic tokens per `UI_IMPLEMENTATION_GUIDE.md`:

| Element    | Token Usage                                          |
| ---------- | ---------------------------------------------------- |
| Spacing    | `gap-[var(--spacing-md)]`, `p-[var(--spacing-md)]`   |
| Colors     | `bg-muted`, `text-foreground`, `border-border`       |
| Typography | `paragraph({ size: "sm", tone: "subdued" })`         |
| Radius     | `rounded-[var(--radius)]` or `rounded-lg` (semantic) |

**Forbidden:**

- Raw colors: `bg-blue-500`, `text-green-600`
- Magic numbers: `p-[47px]`, `gap-3`
- Raw typography: `text-lg`, `text-2xl`

---

## Critical Files to Read Before Implementation

1. `src/contracts/payments.intent.v1.contract.ts` - Intent request/response types
2. `src/contracts/payments.submit.v1.contract.ts` - Submit request/response types
3. `src/contracts/payments.status.v1.contract.ts` - Status response types (VERIFIED status values)
4. `src/app/(app)/credits/CreditsPage.client.tsx` - Current integration point
5. `src/components/vendor/depay/DePayWidget.client.tsx` - Current widget to replace
6. `src/styles/ui/data.ts` - CVA pattern reference
7. `src/components/kit/inputs/Button.tsx` - Kit component pattern reference

---

## References

- [PAYMENTS_DESIGN.md](PAYMENTS_DESIGN.md) - Backend spec and state machine
- [UI_IMPLEMENTATION_GUIDE.md](UI_IMPLEMENTATION_GUIDE.md) - Styling rules
- [UI_CLEANUP_PLAN.md](UI_CLEANUP_PLAN.md) - Component consolidation plan
- [wagmi docs](https://wagmi.sh) - React hooks for Ethereum
- [USDC on Sepolia](https://sepolia.etherscan.io/token/0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238)
