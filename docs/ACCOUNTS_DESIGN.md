# Accounts & Credits System Design

**Core Mission**: Crypto-metered AI infrastructure loop where DAO multi-sig → pays for GPU + OpenRouter/LiteLLM → users interact (chat/API) → users pay back in crypto → DAO multi-sig.

Implements internal credit accounting on top of existing LiteLLM virtual key authentication, maintaining the `LlmCaller { accountId, apiKey }` interface without breaking changes. Designed for future token integration.

## System Overview

### Current State (Working)

- LiteLLM virtual key authentication extracts `Authorization: Bearer <key>`
- Creates `LlmCaller { accountId, apiKey }` for feature services
- LLM calls routed through hexagonal architecture (see [ARCHITECTURE.md](ARCHITECTURE.md))
- LiteLLM tracks usage externally, no internal accounting

### Target State (Being Built)

- Internal credit balance tracking per account with full audit trail
- Post-request atomic credit deduction based on actual LLM usage
- Token-ready database schema with ledger-based accounting
- Foundation for on-chain crypto billing integration

**Critical Constraint**: No changes to existing auth flow or `LlmCaller` interface.

## MVP Barebones Workflow

**Control Plane (admin-only):**

1. Admin calls `POST /admin/accounts/register-litellm-key`
2. Admin calls `POST /admin/accounts/:accountId/credits/topup`

**Data Plane (public):**  
3. Client calls `POST /api/v1/ai/completion` with registered key

**Invariant:** Data-plane endpoints never create accounts or keys. Accounts + keys are created only through explicit, privileged control-plane workflows.

## Implementation Stages

### Stage 1: LiteLLM Integration Foundation

_Status: Complete - working LLM virtual key system_

[x] LiteLLM virtual key authentication working
[x] `src/app/api/v1/ai/completion/route.ts` extracts Bearer token → `LlmCaller`
[x] `src/ports/llm.port.ts` defines `LlmCaller` interface
[x] `src/features/ai/services/completion.ts` orchestrates LLM calls
[x] `src/adapters/server/ai/litellm.adapter.ts` implements LLM service
[x] Integration tests for AI completion flow

### Stage 2: Token-Ready Database Infrastructure

_Status: Complete - database foundation with full test coverage_

[x] Add database dependencies (`drizzle-orm`, `postgres`) to `package.json`
[x] Create `drizzle.config.ts` for migration management
[x] Design accounts table schema in `src/shared/db/schema.ts`:

````sql
accounts (
id TEXT PRIMARY KEY, -- maps to LlmCaller.accountId
display_name TEXT, -- optional human-readable name
primary_wallet_address TEXT, -- future on-chain hook
last_onchain_sync_block BIGINT, -- future sync tracking
balance_credits DECIMAL(10,2) NOT NULL DEFAULT '0.00' -- computed from ledger
)

    credit_ledger (
      id UUID PRIMARY KEY,
      account_id TEXT REFERENCES accounts(id),
      delta DECIMAL(10,2) NOT NULL,  -- +/- credits (source of truth)
      reason TEXT NOT NULL,          -- "ai_usage" | "topup_manual" | "onchain_deposit"
      reference TEXT,                -- LLM request ID, tx hash, etc
      metadata JSONB,                -- usage details, tx info
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
    ```

[x] Create database connection at `src/adapters/server/db/client.ts`
[x] Generate initial migration: `0000_demonic_bucky.sql`
[x] Implement integration tests: `tests/integration/db/drizzle.client.int.test.ts` (9 tests passing)
[x] Configure database scripts: `db:generate`, `db:migrate`, `db:setup`

**Key Files:**

- `src/shared/db/schema.ts` - Account and credit ledger tables
- `src/adapters/server/db/client.ts` - Drizzle connection
- `drizzle.config.ts` - Migration configuration

### Stage 2.5: Control Plane - Account Registration

_Status: Complete - stable account ID derivation and admin routes implemented_

[x] Create stable accountId derivation helper: `src/shared/util/accountId.ts`

```typescript
import { createHash } from "crypto";

/**
 * Derives a collision-safe account ID from API key
 * Uses SHA256 hash to ensure stability and prevent collisions
 */
export function deriveAccountIdFromApiKey(apiKey: string): string {
  return "key:" + createHash("sha256").update(apiKey).digest("hex").slice(0, 32);
}
```

[x] Update auth boundary in `src/app/api/v1/ai/completion/route.ts`:

```typescript
// Current caller construction (already implemented):
const caller = {
  accountId: deriveAccountIdFromApiKey(apiKey),
  apiKey,
};

// TODO: Validate account exists, reject unknown keys
const account = await accountService.getAccountByApiKey(apiKey);
if (!account) {
  return NextResponse.json({ error: "Unknown API key" }, { status: 403 });
}
```

**New Admin Routes (MVP):**

[x] `POST /admin/accounts/register-litellm-key`
  - Explicitly creates/binds accounts to LiteLLM virtual keys
  - Only way accounts are created in the system
  - Admin auth required

[x] `POST /admin/accounts/:accountId/credits/topup`
  - Manually adds credits via ledger
  - Required for testing before wallet integration
  - Admin auth required

**Updated Completion Route:**
[x] `/api/v1/ai/completion` validates existing accounts only
[x] Returns 403 for unknown API keys (never creates accounts)
[x] Pure data plane - no account creation side-effects

### Stage 3: Core Domain Layer

_Status: Complete - clean domain implementation with test coverage_

[x] Create minimal account domain: `src/core/accounts/`
```typescript
// model.ts - clean domain types (no infrastructure)
export interface Account {
id: string;
balanceCredits: number; // domain uses number, adapter handles Decimal conversion
}

    export function ensureHasCredits(account: Account, cost: number) {
      if (account.balanceCredits < cost) {
        throw new InsufficientCreditsError(account.id, cost, account.balanceCredits);
      }
    }

    // errors.ts - domain errors
    export class InsufficientCreditsError extends Error {
      constructor(
        public accountId: string,
        public requiredCost: number,
        public availableBalance: number
      ) {
        super(`Account ${accountId} has insufficient credits: need ${requiredCost}, have ${availableBalance}`);
      }
    }

    // public.ts - exports (follows core/ convention)
    export * from "./model.ts";
    export * from "./errors.ts";
    ```

[x] Add unit tests: `tests/unit/core/accounts/model.test.ts` - Account domain behavior tests (12 tests) - Credit validation edge cases (zero balance, negative amounts)

**Design Principles:**

- Keep domain types clean (use `number`, not Drizzle `Decimal`)
- Minimal surface area focused on credit validation
- Follow existing `core/` patterns (`public.ts` exports, not `index.ts`)
- Account IDs derived from stable, collision-safe hash (see Stage 2.5)

### Stage 4: Ports Layer

_Status: Complete - comprehensive service interface defined_

[x] Define AccountService interface: `src/ports/accounts.port.ts`
```typescript
export interface AccountService {
  // Explicit account creation (admin endpoints only)
  createAccountForApiKey(params: {
    apiKey: string;
    displayName?: string;
  }): Promise<{ accountId: string; balanceCredits: number }>;

  // Account validation (completion route)
  getAccountByApiKey(apiKey: string): Promise<{ accountId: string; balanceCredits: number } | null>;

  // Cached balance read - returns accounts.balance_credits (not recomputed from ledger)
  getBalance(accountId: string): Promise<number>;

  // Single atomic operation - prevents race conditions
  debitForUsage(params: {
    accountId: string;
    cost: number;
    requestId: string; // for audit trail
    metadata?: Record<string, unknown>; // usage details
  }): Promise<void>;

  // For funding/testing flows
  creditAccount(params: {
    accountId: string;
    amount: number;
    reason: string;
    reference?: string;
  }): Promise<void>;
}
```

[x] Add to ports index: `src/ports/index.ts`
[x] Create port contract tests: `tests/ports/accounts.port.contract.ts` - Reusable test harness for any AccountService implementation - Validates atomic operations and error conditions

**Key Decisions**:
- `createAccountForApiKey()` for explicit provisioning (admin routes only)
- `getAccountByApiKey()` for validation (completion route) - returns null for unknown keys
- Single `debitForUsage` operation prevents race conditions from separate check/deduct calls
- `getBalance()` returns cached `accounts.balance_credits`, not recomputed from ledger

### Stage 5: Database Adapter

_Status: Complete - adapters implemented with full transaction support and error handling_

[x] Implement database adapter: `src/adapters/server/accounts/drizzle.adapter.ts`
```typescript
/**
 * CRITICAL TRANSACTION SEMANTICS:
 * - All credit operations MUST be wrapped in a single db.transaction()
 * - InsufficientCreditsError MUST NOT be caught within the transaction
 * - On error, the transaction rolls back: no ledger entry, no balance change
 * - This prevents persisting negative balances or incomplete ledger entries
 */
export class DrizzleAccountService implements AccountService {
  async createAccountForApiKey({ apiKey, displayName }: {
    apiKey: string;
    displayName?: string;
  }): Promise<{ accountId: string; balanceCredits: number }> {
    const accountId = deriveAccountIdFromApiKey(apiKey);

    await this.db.transaction(async (tx) => {
      // Only create if doesn't exist (idempotent)
      const existing = await tx.query.accounts.findFirst({
        where: eq(accounts.id, accountId)
      });

      if (!existing) {
        await tx.insert(accounts).values({
          id: accountId,
          balanceCredits: "0.00",
          displayName: displayName || null
        });
      }
    });

    return { accountId, balanceCredits: 0 };
  }

  async getAccountByApiKey(apiKey: string): Promise<{ accountId: string; balanceCredits: number } | null> {
    const accountId = deriveAccountIdFromApiKey(apiKey);

    const account = await this.db.query.accounts.findFirst({
      where: eq(accounts.id, accountId)
    });

    if (!account) return null;

    return {
      accountId: account.id,
      balanceCredits: toNumber(account.balanceCredits)
    };
  }

  async debitForUsage({ accountId, cost, requestId, metadata }) {
    await this.db.transaction(async (tx) => {
      // Insert ledger entry (source of truth)
      await tx.insert(creditLedger).values({
        accountId,
        delta: fromNumber(-cost),
        reason: "ai_usage",
        reference: requestId,
        metadata
      });

      // Update computed balance
      await tx
        .update(accounts)
        .set({ balanceCredits: sql`balance_credits - ${fromNumber(cost)}` })
        .where(eq(accounts.id, accountId));

      // Verify sufficient balance after update
      const account = await tx.query.accounts.findFirst({
        where: eq(accounts.id, accountId)
      });

      if (!account || toNumber(account.balanceCredits) < 0) {
        // This throw causes transaction rollback - no persistence of negative balance
        throw new InsufficientCreditsError(accountId, cost,
          account ? toNumber(account.balanceCredits) + cost : 0);
      }
    });
  }
}

// Helper functions hide Drizzle decimal conversions
function toNumber(decimal: string): number { /* ... */ }
function fromNumber(num: number): string { /* ... */ }
```

[x] Create test adapter: `src/adapters/test/accounts/fake-account.adapter.ts` (removed - replaced with mock fixtures)
[x] Update server adapter index: `src/adapters/server/index.ts`
[x] Integration tests: `tests/integration/api/admin/accounts.int.test.ts`
    - Test against real database using existing infrastructure
    - **Transaction rollback tests**: Simulate insufficient balance, assert no ledger row inserted and balance unchanged
    - **Concurrent debit tests**: Multiple simultaneous debits from near-zero balance, verify one fails and balance ≥ 0
    - **Account provisioning tests**: First call for new API key creates account with zero balance
[x] Run port contract tests against database adapter

**Key Design**: Ledger-based accounting with computed balance and explicit transaction semantics for token-ready architecture.

### Stage 6: Feature Integration

_Status: Complete - pricing helpers, credit deduction, and AI integration implemented_

[x] Add pricing helper: `src/core/billing/pricing.ts`

```typescript
const DEFAULT_MODEL = "gpt-3.5-turbo"; // fallback for missing model info

export function calculateCost(params: {
  modelId: string;
  totalTokens: number;
}): number {
  // MVP: single flat rate regardless of model (future-proof interface)
  return params.totalTokens * 0.001; // 1k tokens = 1 credit

  // Future: model-specific pricing
  // const modelPricing = { "gpt-4": 0.002, "gpt-3.5-turbo": 0.001 };
  // return params.totalTokens * (modelPricing[params.modelId] || 0.001);
}
```
[x] Update completion service: `src/features/ai/services/completion.ts`
```typescript
export async function execute(
  messages: Message[],
  llmService: LlmService,
  accountService: AccountService, // injected
  clock: Clock,
  caller: LlmCaller
): Promise<Message> {
  // Apply domain rules (existing logic)
  // ... existing message validation ...

  // Generate stable requestId before LLM call for consistent tracking
  const requestId = generateRequestId(); // UUID for correlation

  // Call LLM with requestId for traceability
  const result = await llmService.completion({
    messages: trimmedMessages,
    caller,
    requestId // pass through for LiteLLM/Langfuse correlation
  });

  // Calculate cost with model-aware pricing
  const cost = calculateCost({
    modelId: result.providerMeta?.model ?? DEFAULT_MODEL,
    totalTokens: result.usage?.totalTokens ?? 0,
  });

  // Debit credits atomically with full audit trail
  await accountService.debitForUsage({
    accountId: caller.accountId,
    cost,
    requestId, // same ID used for LLM call
    metadata: {
      model: result.providerMeta?.model,
      usage: result.usage,
      llmRequestId: result.providerMeta?.requestId // if LiteLLM provides one
    }
  });

  // Return response with timestamp
  return { ...result.message, timestamp: clock.now() };
}
```

[x] Update LlmService port: `src/ports/llm.port.ts`
    - Add optional `requestId?: string` parameter to completion method
    - Update litellm.adapter.ts to propagate requestId to LiteLLM/Langfuse
[x] Update bootstrap container: `src/bootstrap/container.ts`
    - Wire AccountService adapter to port
    - Provide dependency injection for completion service
[x] Add error handling for credit scenarios in API route
[x] Integration tests: Credit flow end-to-end

**Critical Flow:**

1. API receives request with Bearer token
2. Derive stable accountId from apiKey using SHA256 hash → create LlmCaller
3. Ensure account exists (create with zero balance if needed)
4. Generate requestId for correlation across systems
5. CompletionService calls LLM via LlmService with requestId
6. Calculate model-aware cost from LLM response
7. Deduct credits atomically via AccountService (with full audit trail)
8. Return response (accept token waste on insufficient credits for MVP)

### Stage 7: MVP Admin Endpoints

_Status: Complete - all MVP admin endpoints implemented and tested_

**Control Plane (admin-only):**

[x] `POST /admin/accounts/register-litellm-key`
  - Uses `AccountService.createAccountForApiKey()`
  - Admin auth required
  - Only way to create accounts

[x] `POST /admin/accounts/:accountId/credits/topup`
  - Uses `AccountService.creditAccount()`
  - Admin auth required
  - Manual credit funding for testing

**Data Plane (updated):**

[x] Update `POST /api/v1/ai/completion`
  - Add account validation: `AccountService.getAccountByApiKey()`
  - Return 403 for unknown keys (no auto-creation)
  - Existing credit debit logic unchanged

**That's it for MVP.** These 3 endpoints enable the complete workflow.

### Stage 8: Token Integration Hooks

_Status: Future - connect to blockchain payments_

[ ] Design wallet payment detection system - Monitor USDC/token transfers to DAO contract - Write `credit_ledger` entries with `reason="onchain_deposit"`
[ ] Implement on-chain payment monitoring
 - Block watcher service - Automatic credit top-up workflows
[ ] Build payment reconciliation and audit systems
[ ] Connect to DAO multi-sig wallet for payment collection

**Token Migration Path:**

1. **MVP**: Manual credit funding via Postgres ledger
2. **Token Phase**: On-chain deposits fund same ledger (`reason="onchain_deposit"`)
3. **App Logic**: Unchanged - still reads balance and writes usage to ledger

## Key Architectural Decisions

### 1. Interface Stability

The existing `LlmCaller { accountId, apiKey }` interface remains unchanged. Credit logic works internally without affecting the authentication boundary.

### 2. Token-Ready Database Design

- `credit_ledger` as source of truth for all balance changes
- `accounts.balance_credits` is computed/cached from ledger entries
- Wallet columns ready for future on-chain integration
- Metadata fields support both usage details and transaction references

### 3. Atomic Operations

- Single `debitForUsage` operation prevents race conditions
- Database transactions ensure consistency between ledger and balance
- Accept token waste on insufficient credits for MVP simplicity

### 4. Clean Domain Boundaries

- Core domain uses `number` for credits (clean types)
- Adapter handles Drizzle Decimal conversions (infrastructure concern)
- No leakage of database types through ports

### 5. Ledger-Based Accounting

- All credit changes flow through `credit_ledger` table
- Enables full audit trail and future token reconciliation
- Supports both off-chain (manual) and on-chain (token) funding sources

### 6. Internal vs External Cost Accounting

- **Internal credits** are our product pricing (fixed rate per token for MVP)
- **LiteLLM spend** is actual upstream provider cost we pay
- These intentionally diverge by design - credits are user-facing pricing, not cost accounting
- LiteLLM's spend tracking remains canonical record of upstream provider costs
- Future reconciliation can compare internal revenue vs external costs

### 7. Stable Account ID Derivation

- Account IDs derived using `SHA256(apiKey).slice(0,32)` for collision safety
- Deterministic mapping ensures same API key always gets same account
- Cryptographically safe against collisions (2^128 space)
- Prefixed with "key:" for human readability: `key:a1b2c3d4...`

## Current State Summary

**Completed Stages 1-2:**

- LiteLLM virtual key authentication system working
- Token-ready database schema with ledger design
- Full integration test coverage (9 tests passing)
- Development workflow and migration scripts

**Next Steps:** Complete the unchecked `[ ]` items in Stage 3 (Core Domain Layer), then proceed through Stages 4-6 for the MVP credit system.

The foundation is designed for seamless token transition: Postgres becomes the real-time balance cache, tokens become the funding source.
````
