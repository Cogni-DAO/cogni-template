# Testing Strategy

## Environment-Based Test Adapters

When implementing adapters that hit external dependencies (APIs, services, etc.), you must provide both real and fake implementations to enable testing without external calls.

### APP_ENV=test Pattern

**Purpose:** Enable deterministic testing by swapping real adapters with fake ones based on environment configuration.

**Setup:**

- `APP_ENV=test` triggers fake adapter usage in the DI container
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
   const llmService = serverEnv.isTestMode
     ? new FakeLlmAdapter()
     : new LiteLlmAdapter();
   ```

4. **API Tests** (`tests/api/*/`)
   - Must assert fake behavior in CI
   - Verify deterministic responses from fake adapters
   ```typescript
   expect(responseData.message).toHaveProperty("content", "[FAKE_COMPLETION]");
   ```

### Example: LLM Service

**Real:** `src/adapters/server/ai/litellm.adapter.ts` → calls LiteLLM/OpenRouter  
**Fake:** `src/adapters/test/ai/fake-llm.adapter.ts` → returns `"[FAKE_COMPLETION]"`  
**Test:** `tests/api/v1/ai/completion.spec.ts` → asserts fake content

### CI Integration

The `test-api` workflow job:

- Sets `APP_ENV=test` (triggers fake adapters)
- Does NOT provide external API keys (forces fake usage)
- Starts app stack with Docker
- Runs `pnpm test:api` against fake responses

This ensures CI never makes external API calls while still testing the full HTTP request/response flow.
