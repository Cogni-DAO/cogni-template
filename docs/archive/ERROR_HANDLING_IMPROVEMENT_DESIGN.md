# Error Handling Improvement Design: Model Unavailability & LLM Failures

**Date:** 2025-12-04
**Context:** `grok-4.1-fast` model removed from OpenRouter, causing 404s. Users saw generic "API error: 503" with no actionable guidance.

---

## Current Problems

### 1. Error Information Loss (Context Discarded)

**Flow:**

```
LiteLLM 404 → Adapter → Route → Client
"No endpoints found for x-ai/grok-4.1-fast:free"
         ↓
   "LiteLLM API error: 404 Not Found"
         ↓
   "AI service temporarily unavailable"
         ↓
   "API error: 503"
```

**Lost:**

- Which model failed (`grok-4.1-fast`)
- Why it failed (404 = model doesn't exist vs 503 = provider down)
- What models are available as fallback

### 2. Generic Error Codes

**Current:** All LiteLLM errors → 503 "AI service temporarily unavailable"

**Problems:**

- `404 Not Found` (model removed) → 503 (implies retry)
- `429 Rate Limit` → 503 (doesn't explain why)
- `401 Auth Error` → 503 (hides auth problem)
- `504 Timeout` → 503 (different from 408)

**Impact:** Users don't know if they should:

- Wait and retry
- Select a different model
- Check their account
- Report a bug

### 3. Poor Observability

**Current logging** (`route.ts:122`):

```typescript
logRequestWarn(ctx.log, error, "LLM_SERVICE_UNAVAILABLE");
```

**Problems:**

- Generic error code (can't grep for "model not found")
- No structured fields (model name, status code, provider)
- Can't distinguish: provider down vs model gone vs rate limit

**Example log:**

```json
{
  "level": 40,
  "errorCode": "LLM_SERVICE_UNAVAILABLE",
  "err": {
    "message": "LiteLLM API error: 404 Not Found"
  }
}
```

**Missing:**

- `model: "grok-4.1-fast"`
- `provider: "OpenRouter"`
- `statusCode: 404`
- `errorType: "MODEL_NOT_FOUND"`

### 4. No Fallback Strategy

**Current:** When model fails, user is stuck.

**Better UX:**

- Suggest available models
- Auto-retry with default model (with user consent)
- Show which models are healthy

### 5. User Confusion

**Current message:** "API error: 503"

**User questions:**

- Is this a bug in the app?
- Should I refresh the page?
- Will this work in 5 minutes?
- Should I file a bug report?

---

## Proposed Solution

### Phase 1: Structured Error Types (Adapter → Route)

#### A. Typed Error Classes

**File:** `src/adapters/server/ai/errors.ts` (NEW)

```typescript
export class LlmAdapterError extends Error {
  constructor(
    public readonly type: LlmErrorType,
    public readonly model: string,
    public readonly provider: string,
    public readonly statusCode: number,
    public readonly providerMessage: string,
    message?: string
  ) {
    super(message ?? providerMessage);
    this.name = "LlmAdapterError";
  }
}

export type LlmErrorType =
  | "MODEL_NOT_FOUND" // 404: model doesn't exist
  | "MODEL_UNAVAILABLE" // 503: provider down, model offline
  | "RATE_LIMIT_EXCEEDED" // 429: quota exhausted
  | "AUTH_ERROR" // 401/403: invalid key
  | "TIMEOUT" // 504: provider timeout
  | "INVALID_REQUEST" // 400: malformed request
  | "PROVIDER_ERROR" // 5xx: upstream provider issue
  | "UNKNOWN_ERROR"; // catch-all

export function classifyLiteLlmError(
  statusCode: number,
  responseBody: unknown,
  model: string
): LlmAdapterError {
  const provider = extractProvider(model); // e.g. "OpenRouter" from "openrouter/..."
  const providerMessage = extractMessage(responseBody);

  if (statusCode === 404) {
    // Check if message says "No endpoints found" → model gone
    if (providerMessage.includes("No endpoints found")) {
      return new LlmAdapterError(
        "MODEL_NOT_FOUND",
        model,
        provider,
        404,
        providerMessage,
        `Model ${model} no longer exists on ${provider}`
      );
    }
    return new LlmAdapterError(
      "INVALID_REQUEST",
      model,
      provider,
      404,
      providerMessage
    );
  }

  if (statusCode === 429) {
    return new LlmAdapterError(
      "RATE_LIMIT_EXCEEDED",
      model,
      provider,
      429,
      providerMessage,
      `Rate limit exceeded for ${model}`
    );
  }

  if (statusCode === 401 || statusCode === 403) {
    return new LlmAdapterError(
      "AUTH_ERROR",
      model,
      provider,
      statusCode,
      providerMessage,
      "Authentication failed with LLM provider"
    );
  }

  if (statusCode === 503 || statusCode === 502) {
    return new LlmAdapterError(
      "MODEL_UNAVAILABLE",
      model,
      provider,
      statusCode,
      providerMessage,
      `${provider} is temporarily unavailable`
    );
  }

  if (statusCode === 504) {
    return new LlmAdapterError(
      "TIMEOUT",
      model,
      provider,
      504,
      providerMessage,
      `Request timeout for ${model}`
    );
  }

  return new LlmAdapterError(
    "UNKNOWN_ERROR",
    model,
    provider,
    statusCode,
    providerMessage
  );
}
```

#### B. Update Adapter

**File:** `src/adapters/server/ai/litellm.adapter.ts`

**Before:**

```typescript
if (!response.ok) {
  throw new Error(
    `LiteLLM API error: ${response.status} ${response.statusText}`
  );
}
```

**After:**

```typescript
if (!response.ok) {
  // Read response body for provider error details
  const errorBody = await response.json().catch(() => ({}));

  throw classifyLiteLlmError(
    response.status,
    errorBody,
    model // Already have this in scope
  );
}
```

### Phase 2: Structured Logging (Route)

#### A. Update Route Error Handler

**File:** `src/app/api/v1/ai/chat/route.ts`

**Before:**

```typescript
if (error.message.includes("LiteLLM")) {
  logRequestWarn(ctx.log, error, "LLM_SERVICE_UNAVAILABLE");
  return NextResponse.json(
    { error: "AI service temporarily unavailable" },
    { status: 503 }
  );
}
```

**After:**

```typescript
if (error instanceof LlmAdapterError) {
  // Structured logging with all context
  ctx.log.warn(
    {
      errorType: error.type,
      model: error.model,
      provider: error.provider,
      statusCode: error.statusCode,
      providerMessage: error.providerMessage,
    },
    `LLM error: ${error.type}`
  );

  // Map to user-facing response
  return mapLlmErrorToResponse(error, ctx);
}
```

#### B. User-Facing Error Mapping

```typescript
function mapLlmErrorToResponse(
  error: LlmAdapterError,
  ctx: RequestContext
): NextResponse {
  switch (error.type) {
    case "MODEL_NOT_FOUND":
      return NextResponse.json(
        {
          error: "Model unavailable",
          details: `The model ${error.model} is no longer available`,
          suggestion: "Please select a different model from the menu",
          fallbackAction: "SELECT_DIFFERENT_MODEL",
        },
        { status: 404 }
      );

    case "MODEL_UNAVAILABLE":
      return NextResponse.json(
        {
          error: "Service temporarily unavailable",
          details: `${error.provider} is experiencing issues`,
          suggestion: "Please try again in a few minutes",
          fallbackAction: "RETRY_LATER",
        },
        { status: 503 }
      );

    case "RATE_LIMIT_EXCEEDED":
      return NextResponse.json(
        {
          error: "Rate limit exceeded",
          details: "Too many requests to this model",
          suggestion: "Please wait 60 seconds or try a different model",
          fallbackAction: "WAIT_OR_SWITCH_MODEL",
        },
        { status: 429 }
      );

    case "AUTH_ERROR":
      return NextResponse.json(
        {
          error: "Authentication error",
          details: "Unable to authenticate with AI provider",
          suggestion: "Please contact support",
          fallbackAction: "CONTACT_SUPPORT",
        },
        { status: 500 } // Don't expose auth details to user
      );

    case "TIMEOUT":
      return NextResponse.json(
        {
          error: "Request timeout",
          details: "The AI provider took too long to respond",
          suggestion: "Please try again",
          fallbackAction: "RETRY",
        },
        { status: 408 }
      );

    default:
      return NextResponse.json(
        {
          error: "AI service error",
          details: "An unexpected error occurred",
          suggestion: "Please try again or select a different model",
          fallbackAction: "RETRY_OR_SWITCH_MODEL",
        },
        { status: 503 }
      );
  }
}
```

### Phase 3: Better User Experience (Client)

#### A. Parse Structured Errors

**File:** `src/features/ai/chat/providers/ChatRuntimeProvider.client.tsx`

**Before:**

```typescript
if (!response.ok) {
  throw new Error(`API error: ${response.status}`);
}
```

**After:**

```typescript
if (!response.ok) {
  // Parse structured error response
  const errorData = await response.json().catch(() => ({}));

  // Create user-friendly error message
  const errorMessage =
    errorData.details ||
    `Error ${response.status}: ${errorData.error || "Unknown error"}`;

  const suggestionMessage = errorData.suggestion
    ? `\n\n${errorData.suggestion}`
    : "";

  throw new Error(errorMessage + suggestionMessage);
}
```

#### B. Add Error Toast/Banner

**Example UI (assistant-ui integration):**

```typescript
// When error occurs, show a banner above chat
<ErrorBanner>
  <ErrorIcon />
  <div>
    <strong>Model Unavailable</strong>
    <p>The model grok-4.1-fast is no longer available.</p>
    <Button onClick={openModelPicker}>
      Select Different Model
    </Button>
  </div>
</ErrorBanner>
```

---

## Example: Before vs After

### Before (Current)

**User sends message with `grok-4.1-fast`**

**Logs:**

```json
{
  "level": 40,
  "errorCode": "LLM_SERVICE_UNAVAILABLE",
  "err": { "message": "LiteLLM API error: 404 Not Found" }
}
```

**User sees:**

```
API error: 503
```

**User reaction:** 😕 "Is the app broken? Should I refresh?"

---

### After (Proposed)

**User sends message with `grok-4.1-fast`**

**Logs:**

```json
{
  "level": 40,
  "errorType": "MODEL_NOT_FOUND",
  "model": "openrouter/x-ai/grok-4.1-fast:free",
  "provider": "OpenRouter",
  "statusCode": 404,
  "providerMessage": "No endpoints found for x-ai/grok-4.1-fast:free.",
  "msg": "LLM error: MODEL_NOT_FOUND"
}
```

**User sees:**

```
⚠️ Model Unavailable

The model grok-4.1-fast is no longer available.

Please select a different model from the menu.

[Select Model] [Dismiss]
```

**User reaction:** ✅ "Oh, I need to pick a different model. That's clear!"

---

## Greppable Logs (For Debugging)

### Query: "How many model not found errors today?"

```bash
# Current (can't distinguish):
grep "LLM_SERVICE_UNAVAILABLE" logs.json | wc -l
# → Shows ALL LLM errors (down, rate limit, not found, timeout)

# Proposed (precise):
jq 'select(.errorType == "MODEL_NOT_FOUND")' logs.json | wc -l
# → Shows only model-not-found errors
```

### Query: "Which models are failing?"

```bash
# Current: Manual parsing of error messages
grep "LiteLLM API error" logs.json | ???

# Proposed:
jq -r 'select(.errorType != null) | .model' logs.json | sort | uniq -c
# Output:
#   47 openrouter/x-ai/grok-4.1-fast:free
#    3 openrouter/anthropic/claude-opus-4.5
```

### Query: "Is this OpenRouter's fault or ours?"

```bash
# Current: Can't tell from logs

# Proposed:
jq -r 'select(.errorType == "MODEL_NOT_FOUND") | .provider' logs.json | sort | uniq -c
# Output:
#   47 OpenRouter  ← Their issue
#    0 LiteLLM     ← Our issue
```

---

## Implementation Plan

### Phase 1: Foundation (2 hours)

- [ ] Create `src/adapters/server/ai/errors.ts`
- [ ] Implement `classifyLiteLlmError()`
- [ ] Update `litellm.adapter.ts` to throw structured errors
- [ ] Write unit tests for error classification

### Phase 2: Route & Logging (1 hour)

- [ ] Update `route.ts` error handler to catch `LlmAdapterError`
- [ ] Implement `mapLlmErrorToResponse()`
- [ ] Add structured logging with all error fields
- [ ] Test with curl to verify JSON response structure

### Phase 3: Client UX (2 hours)

- [ ] Update `ChatRuntimeProvider` to parse structured errors
- [ ] Add error banner component (if not exists)
- [ ] Show actionable suggestions based on `fallbackAction`
- [ ] Add "Select Model" button when `MODEL_NOT_FOUND`
- [ ] Test in browser with mock errors

### Phase 4: Monitoring (1 hour)

- [ ] Add Grafana dashboard panel for `errorType` distribution
- [ ] Add alert for high `MODEL_NOT_FOUND` rate (model sunset detection)
- [ ] Document log query examples in `docs/OBSERVABILITY.md`

---

## Acceptance Criteria

### Logging

- [ ] Each LLM error has `errorType`, `model`, `provider`, `statusCode` fields
- [ ] Can query "how many MODEL_NOT_FOUND today" with single jq filter
- [ ] Can identify failing models without parsing error messages

### User Experience

- [ ] Users see specific error reason ("Model unavailable" not "503")
- [ ] Users see actionable suggestion ("Select different model")
- [ ] Users can take action directly (button to open model picker)
- [ ] Error messages never expose internal details (auth keys, stack traces)

### Developer Experience

- [ ] Can grep logs for specific error types
- [ ] Can identify provider issues vs app bugs from logs
- [ ] Error classes are testable with mocks
- [ ] New error types easy to add (extend enum)

---

## Future Enhancements

### Automatic Fallback (Post-MVP)

When `MODEL_NOT_FOUND`, auto-retry with default model:

```typescript
if (error.type === "MODEL_NOT_FOUND") {
  const defaultModel = await getDefaultModelId();
  ctx.log.info(
    { failedModel: error.model, fallbackModel: defaultModel },
    "Auto-falling back to default model"
  );
  return retryWithModel(defaultModel);
}
```

### Model Health Dashboard (Post-MVP)

Real-time view of which models are healthy/unhealthy:

```
✅ gemini-2.5-flash     (100% success rate)
⚠️  claude-opus-4.5      (89% success, 11% rate limit)
❌ grok-4.1-fast        (0% success - model removed)
```

### Proactive Model Sunset Detection (Post-MVP)

Alert when model starts failing consistently:

```
If MODEL_NOT_FOUND for same model > 10 times in 5 minutes:
  → Send Slack alert: "Model grok-4.1-fast appears to be sunset"
  → Update LiteLLM metadata.cogni.default_preferred tag
  → Update client default via catalog
```

---

## Cost-Benefit Analysis

### Cost

- **Dev time:** ~6 hours
- **Code changes:** 3 files (errors.ts, adapter, route)
- **Testing:** 2 hours
- **Total:** 1 developer-day

### Benefit

- **Reduced support tickets:** Users can self-service model changes
- **Faster debugging:** grep for error type instead of parsing messages
- **Better uptime:** Proactive detection of model issues
- **User trust:** Professional error messages, not generic 503s

### ROI

First model sunset (like grok-4.1-fast):

- **Before:** 10 users file "app broken" tickets → 2 hours support time
- **After:** 0 tickets, users pick different model themselves → 0 hours

**Break-even:** First model sunset event.

---

**Priority:** HIGH (blocks user confidence, wastes support time)
**Complexity:** LOW (well-defined, no new dependencies)
**Risk:** LOW (backward compatible, incremental rollout)
