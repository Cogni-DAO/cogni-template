---
id: payments-setup-guide
type: guide
title: Payments Setup — USDC Credit Top-Up
status: draft
trust: draft
summary: How to configure and test the USDC payment flow for credit top-ups.
read_when: Setting up payments, configuring chain/token, or debugging the payment flow.
owner: derekg1729
created: 2026-02-07
verified:
tags: [billing, web3, payments]
---

# Payments Setup — USDC Credit Top-Up

> Source: docs/PAYMENTS_DESIGN.md

## When to Use This

You need to configure or test the USDC-based credit top-up payment system. This covers the chain configuration, payment flow endpoints, and unit conversion.

## Preconditions

- [ ] `.cogni/repo-spec.yaml` configured with `cogni_dao.chain_id` and `payments_in.credits_topup.receiving_address`
- [ ] `src/shared/web3/chain.ts` constants match repo-spec (`CHAIN_ID`, `USDC_TOKEN_ADDRESS`, `MIN_CONFIRMATIONS`)
- [ ] Database migrations applied (`pnpm db:migrate`)
- [ ] Wallet connected via RainbowKit to a supported chain (Sepolia for testing, Base mainnet for production)

## Steps

### 1. Configure Chain and Payment Parameters

**`.cogni/repo-spec.yaml`** (governance-managed):

- `cogni_dao.chain_id` — Chain ID as string (e.g., `"11155111"` for Sepolia, `"8453"` for Base)
- `payments_in.credits_topup.receiving_address` — DAO wallet receiving address
- `payments_in.credits_topup.allowed_chains` — Chain names (e.g., `["Sepolia"]`)
- `payments_in.credits_topup.allowed_tokens` — Token names (e.g., `["USDC"]`)

**`src/shared/web3/chain.ts`** (hardcoded constants):

- `CHAIN_ID` — Must match `cogni_dao.chain_id` from repo-spec
- `USDC_TOKEN_ADDRESS` — Token contract address for configured chain
- `MIN_CONFIRMATIONS` — Required block confirmations
- `VERIFY_THROTTLE_SECONDS` — GET polling throttle (default 10s)

### 2. Understand the Payment Flow

1. **Create intent**: `POST /api/v1/payments/intents` with `{ amountUsdCents }` (100–1,000,000)
2. **Execute on-chain**: User sends USDC via wallet to DAO receiving address
3. **Submit txHash**: `POST /api/v1/payments/attempts/:id/submit` with `{ txHash }`
4. **Poll status**: `GET /api/v1/payments/attempts/:id` until `CREDITED` or terminal state

### 3. Understand Unit Conversions

| Unit               | Description                 | Example                                      |
| ------------------ | --------------------------- | -------------------------------------------- |
| `amount_raw`       | USDC raw units (6 decimals) | 1 USDC = 1,000,000 raw                       |
| `amount_usd_cents` | USD cents                   | 1 USD = 100 cents                            |
| `credits`          | Internal accounting         | 1 cent = 10 credits (per `CREDITS_PER_CENT`) |

**Conversion**: 1 USDC = 100 cents = 1,000 credits

**Raw calculation**: `amountRaw = BigInt(amountUsdCents) * 10_000n` (never use floats)

### 4. Run Tests

```bash
pnpm test src/features/payments
```

The 9 critical test scenarios cover: sender mismatch, wrong token/recipient/amount, missing receipt, PENDING timeout, insufficient confirmations, duplicate submit, same txHash different attempt, atomic settle, ownership.

## Verification

1. Create an intent and verify the response includes `chainId`, `token`, `to`, `amountRaw`, and `expiresAt`
2. Verify `from_address` is checksummed via `getAddress()` and matches the session wallet
3. Confirm credits are applied exactly once (check `credit_ledger` for the `"${chainId}:${txHash}"` reference)

## Troubleshooting

### Problem: Intent creation returns 400

**Solution:** Check that `amountUsdCents` is between 100 and 1,000,000. Amounts outside this range are rejected.

### Problem: Payment stuck in PENDING_UNVERIFIED

**Solution:** The system auto-fails attempts after 24h from submission. For legitimate transactions, verify the txHash is correct and on the right chain. Check RPC connectivity.

### Problem: 409 on submit

**Solution:** The same txHash is already bound to a different attempt. Each txHash can only be used once (enforced by partial unique index).

## Related

- [Payments Design Spec](../spec/payments-design.md)
- [Billing Evolution Spec](../spec/billing-evolution.md)
- [Payments & Billing Initiative](../../work/initiatives/ini.payments-enhancements.md)
