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
```sql
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

### Stage 3: Core Domain Layer

_Status: Next - implement minimal account domain_

[ ] Create minimal account domain: `src/core/accounts/`
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

[ ] Add unit tests: `tests/unit/core/accounts/` - Account domain behavior tests - Credit validation edge cases (zero balance, negative amounts)

**Design Principles:**

- Keep domain types clean (use `number`, not Drizzle `Decimal`)
- Minimal surface area focused on credit validation
- Follow existing `core/` patterns (`public.ts` exports, not `index.ts`)

### Stage 4: Ports Layer

_Status: Next - define atomic service contracts_

[ ] Define AccountService interface: `src/ports/accounts.port.ts`
```typescript
export interface AccountService {
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

[ ] Add to ports index: `src/ports/index.ts`
[ ] Create port contract tests: `tests/ports/accounts.port.contract.ts` - Reusable test harness for any AccountService implementation - Validates atomic operations and error conditions

**Key Design**: Single `debitForUsage` operation prevents race conditions from separate check/deduct calls.

### Stage 5: Database Adapter

_Status: Next - implement AccountService with ledger-based operations_

[ ] Implement database adapter: `src/adapters/server/accounts/drizzle.adapter.ts`
```typescript
export class DrizzleAccountService implements AccountService {
async debitForUsage({ accountId, cost, requestId, metadata }) {
await this.db.transaction(async (tx) => {
// Insert ledger entry (source of truth)
await tx.insert(creditLedger).values({
accountId,
delta: -cost,
reason: "ai_usage",
reference: requestId,
metadata
});

          // Update computed balance
          await tx
            .update(accounts)
            .set({ balanceCredits: sql`balance_credits - ${cost}` })
            .where(eq(accounts.id, accountId));

          // Verify sufficient balance after update
          const account = await tx.query.accounts.findFirst({
            where: eq(accounts.id, accountId)
          });

          if (!account || toNumber(account.balanceCredits) < 0) {
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

[ ] Create adapter exports: `src/adapters/server/accounts/index.ts`
[ ] Update server adapter index: `src/adapters/server/index.ts`
[ ] Integration tests: `tests/integration/adapters/accounts/` - Test against real database using existing infrastructure - Verify transaction rollbacks and error scenarios
[ ] Run port contract tests against database adapter

**Key Design**: Ledger-based accounting with computed balance for token-ready architecture.

### Stage 6: Feature Integration

_Status: Next - integrate credits with AI completion flow_

[ ] Add pricing helper: `src/core/billing/pricing.ts`
`typescript
    export function calculateCost(usage: { totalTokens: number }): number {
      // Simple token-to-credit conversion for MVP
      return usage.totalTokens * 0.001; // 1k tokens = 1 credit
    }
    `
[ ] Update completion service: `src/features/ai/services/completion.ts`
```typescript
export async function execute(
messages: Message[],
llmService: LlmService,
accountService: AccountService, // injected
clock: Clock,
caller: LlmCaller
): Promise<Message> {
// Apply domain rules and call LLM (existing logic)
const result = await llmService.completion({ messages, caller });

      // Calculate cost and debit credits atomically
      const cost = calculateCost(result.usage || { totalTokens: 0 });
      const requestId = generateRequestId(); // simple UUID

      await accountService.debitForUsage({
        accountId: caller.accountId,
        cost,
        requestId,
        metadata: { model: result.providerMeta?.model, usage: result.usage }
      });

      // Return response with timestamp
      return { ...result.message, timestamp: clock.now() };
    }
    ```

[ ] Update bootstrap container: `src/bootstrap/container.ts`  
 - Wire AccountService adapter to port - Provide dependency injection for completion service
[ ] Add error handling for credit scenarios in API route
[ ] Integration tests: Credit flow end-to-end

**Critical Flow:**

1. API receives request with Bearer token
2. Extract accountId from token → create LlmCaller
3. CompletionService calls LLM via LlmService
4. Calculate actual usage cost from LLM response
5. Deduct credits atomically via AccountService (with full audit trail)
6. Return response (accept token waste on insufficient credits for MVP)

### Stage 7: API Enhancement

_Status: Future - expose credit operations via API_

[ ] Create balance inquiry endpoint: `src/app/api/v1/accounts/balance/route.ts`
[ ] Create credit management endpoints: `src/app/api/v1/accounts/credits/route.ts` - Top-up credits (manual management) - Credit history from ledger
[ ] Add credit info to completion response headers
[ ] API contract tests for new endpoints

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

## Current State Summary

**Completed Stages 1-2:**

- LiteLLM virtual key authentication system working
- Token-ready database schema with ledger design
- Full integration test coverage (9 tests passing)
- Development workflow and migration scripts

**Next Steps:** Complete the unchecked `[ ]` items in Stage 3 (Core Domain Layer), then proceed through Stages 4-6 for the MVP credit system.

The foundation is designed for seamless token transition: Postgres becomes the real-time balance cache, tokens become the funding source.
