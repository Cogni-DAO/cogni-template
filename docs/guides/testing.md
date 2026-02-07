---
id: testing-guide
type: guide
title: Testing Strategy
status: draft
trust: draft
summary: How to write tests with environment-based adapter swapping (APP_ENV=test pattern) and CI integration.
read_when: Adding a new adapter that needs fake/test implementation, or understanding the test adapter pattern.
owner: derekg1729
created: 2026-02-06
verified: 2026-02-07
tags: [testing, dev]
---

# Testing Strategy

**For developer setup and daily testing workflows, see [Developer Setup](./developer-setup.md).**

**For stack testing modes and commands, see [Environments Spec](../spec/environments.md).**

**For system integration test design (mock-LLM, adapter overrides), see [SYSTEM_TEST_ARCHITECTURE.md](../SYSTEM_TEST_ARCHITECTURE.md).**

## When to Use This

You are implementing an adapter that calls external services (APIs, databases, etc.) and need to provide a fake implementation for deterministic testing.

## Preconditions

- [ ] Adapter follows the port/adapter pattern (implements a port interface)
- [ ] DI container wiring exists in `src/bootstrap/container.ts`

## Steps

### Stack Testing Commands

- `pnpm dev:stack:test` + `pnpm test:stack:dev` - Host app with test adapters
- `pnpm docker:test:stack` + `pnpm test:stack:docker` - Containerized app with test adapters
- `pnpm docker:stack` + `pnpm e2e` - Production deployment for black box e2e testing

### Environment-Based Test Adapters

When implementing adapters that hit external dependencies (APIs, services, etc.), you must provide both real and fake implementations to enable testing without external calls.

**Exception: LLM** — The LLM adapter (`LiteLlmAdapter`) is always wired. In test stacks, LiteLLM uses `litellm.test.config.yaml` which routes all models to `mock-openai-api` — a lightweight, deterministic, OpenAI-compatible mock with no model weights. See [SYSTEM_TEST_ARCHITECTURE.md](../SYSTEM_TEST_ARCHITECTURE.md).

### APP_ENV=test Pattern

**Purpose:** Enable deterministic testing by swapping real adapters with fake ones based on environment configuration.

**Setup:**

- `APP_ENV=test` triggers fake adapter usage in the DI container (for EVM, metrics, etc.)
- `NODE_ENV=test` controls Node.js runtime behavior
- CI sets both `NODE_ENV=test` and `APP_ENV=test`
- Production deployments reject `APP_ENV=test` (hard guard in env validation)

**Implementation Requirements:**

1. **Real Adapter** (`src/adapters/server/*/`)
   - Implements port interface
   - Makes actual external calls
   - Used in dev/staging/production

2. **Fake Adapter** (`src/adapters/test/*/fake-*.adapter.ts`)
   - Implements same port interface
   - Returns deterministic responses
   - No external dependencies
   - No configuration options (keeps CI predictable)

3. **DI Container Wiring** (`src/bootstrap/container.ts`)
   - Single source of truth for adapter selection
   - Uses `serverEnv.isTestMode` to choose implementation

   ```typescript
   const evmOnchainClient = env.isTestMode
     ? getTestEvmOnchainClient()
     : new ViemEvmOnchainClient();
   ```

### Example: EVM Onchain Client

**Real:** `src/adapters/server/onchain/viem-evm-onchain-client.adapter.ts` → calls EVM RPC
**Fake:** `src/adapters/test/onchain/fake-evm-onchain-client.adapter.ts` → returns deterministic values
**Test:** Stack tests configure fakes via `getTestEvmOnchainClient()` singleton

### CI Integration

The `stack-test` workflow job:

- Sets `APP_ENV=test` (triggers fake adapters for EVM, metrics, etc.)
- Sets `LITELLM_CONFIG=litellm.test.config.yaml` (routes LLM to mock-openai-api)
- Starts app stack with Docker (including `mock-llm` container)
- Runs `pnpm test:stack:docker` against deterministic responses

This ensures CI never makes external API calls while still testing the full HTTP request/response flow through real LiteLLM.

## Verification

```bash
pnpm test           # Run unit/integration tests
pnpm test:ci        # Run tests with coverage statistics
pnpm check          # Full lint + type + format validation
```

## Troubleshooting

### Problem: Tests pass locally but fail in CI

**Solution:** Ensure your adapter is wired in `src/bootstrap/container.ts` with the `serverEnv.isTestMode` check. CI sets `APP_ENV=test` which triggers fake adapter selection. For LLM, ensure `LITELLM_CONFIG=litellm.test.config.yaml` is set.

### Problem: Fake adapter not being used

**Solution:** Verify `APP_ENV=test` is set in your test environment. Check that `src/bootstrap/container.ts` selects the fake implementation when `serverEnv.isTestMode` is true.

## Related

- [Developer Setup](./developer-setup.md) — first-time setup and daily dev workflow
- [Environments Spec](../spec/environments.md) — deployment modes and stack configurations
- [Feature Development Guide](./feature-development.md) — end-to-end feature workflow including testing
