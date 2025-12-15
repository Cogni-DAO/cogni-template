# Observability Finish Pass (Generic, Post-PR)

Goal: add **minimal, high-signal** logging/metrics for the changes in this branch. **No refactors** and **no observability redesign**.

## 0) Scope + budget (non-negotiable)

- Touch only: `src/app/**` (route/controller), `src/features/**` (use-case/service), `src/adapters/**` (external IO).
- **Max 3 logs/request** (4 only if streaming).
- **Event names must come from the event registry** (`<PUT THE REAL PATH HERE>`). No inline strings.

## 1) Decide what to instrument (pick one)

- Endpoint behavior changed → add **route COMPLETE log** (+ rely on existing `http_*` metrics).
- Business logic changed → add **feature COMPLETE log** (only if route can’t capture the key outcome fields).
- External dependency changed → add **adapter ERROR log** (errors only).
- Pure refactor → usually add nothing.

## 2) Required logs (minimum set)

- Route/controller: `feature.<name>.complete`
  - Fields: `reqId`, `routeId`, `status`, `durationMs`, `outcome: success|error`, plus **counts only**.
- Adapter (only on failure): `adapter.<dep>.error`
  - Fields: `dep`, `reasonCode`, `status?`, `durationMs`, `reqId?`.
- When outcome=error, you must include errorCode (enum from the event registry) identifying the failure class; counts alone are not sufficient. Do not log raw error messages.

## 3) Metrics rule

- Add a metric only if you will **alert/graph** it.
- Default: do **not** add feature metrics if existing `http_*` already covers the endpoint.
- Allowed labels only: `route`, `method`, `statusBucket`, `env`, `provider`, `model_class`, `error_code`.
- Forbidden labels: `reqId`, `userId`, wallet, API key, raw path/query, user agent, modelId.

## 4) Privacy + payload safety

Never log: secrets, headers, tokens, full URLs, request/response bodies, prompts/content.
Only log: enums, booleans, counts, durations, coarse status buckets.

## 5) Deliverables (in PR description)

- Events added/used (name + fields)
- Metrics added (name + labels) or “none”
- Files changed
