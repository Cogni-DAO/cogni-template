# Observability Guide (Clean Hex App) — <100 lines

## Goal

Identify the current feature and files changed. Add _predictable, minimal, structured_ logging that helps debug production without polluting business logic.

## Cardinal Rules

- **Logs are contracts:** fixed event names + fixed fields. No ad-hoc strings.
- **Few events, high signal:** 2–6 logs per request/operation max.
- **No sensitive payloads:** never log prompts, full request bodies, secrets, or PII beyond stable IDs.
- **Low-cardinality fields only:** IDs (reqId/userId), enums, booleans, counts, durations. Avoid raw model ids in metrics labels; OK in logs.
- **Every operation has a terminal outcome:** success OR failure (never silent).

## Where logging is allowed (by layer)

1. **app/** (routes/controllers)
   - Owns: request lifecycle logs (received/response_started/complete/stream_closed).
   - Logs include: routeId, reqId, auth/userId, status, handlerMs, streamMs, payload _shape_ (counts only).
   - Must NOT: implement business decisions; must NOT log request bodies.

2. **features/** (services/use-cases)
   - Owns: domain/feature events (operation_started, operation_completed, invariant warnings).
   - Logs include: operation name, reason codes, resolved decisions, durationMs, counts.
   - Must NOT: log raw provider payloads; must NOT depend on web framework.

3. **adapters/** (IO boundaries: DB, HTTP providers, file)
   - Owns: dependency call events (provider_request, provider_result, provider_error).
   - Logs include: dependency name, endpoint/key identifiers (sanitized), retry count, durationMs, status, finishReason.
   - Must NOT: log full request/response bodies; must NOT log streamed chunks.

4. **ports/** (interfaces)
   - No logging. Ports define behavior; implementations log.

5. **contracts/** (input/output schemas)
   - No logging. Validation errors are logged at app/ boundary with reason codes.

6. **shared/observability/**
   - Single logger setup + helpers (emit(), logRequestWarn()) + context types (reqId, routeId).

## Required event shape (standard fields)

All logs MUST include: `event`, `reqId`, `routeId` (or operationId), `service`.
Add as relevant: `userId`, `billingAccountId`, `stream`, `status`, `durationMs`, `count*`, `reason`.

## Standard event names (use exactly)

- App HTTP: `*.received`, `*.response_started`, `*.complete`, `*.stream_closed`
- Feature: `feature.*.started`, `feature.*.completed`
- Adapter: `adapter.*.request`, `adapter.*.result`, `adapter.*.error`
- Invariants: `inv_*` (warn), always actionable and rare

## Streaming (SSE/WebSocket) rules

- Split durations:
  - `handlerMs`: until Response returned (response_started)
  - `streamMs`: until stream closed (stream_closed)
- Always emit exactly one terminal outcome:
  - success event (e.g., `feature.*.completed`) OR timeout/lost (`*.finalization_lost`)
- Client abort:
  - handle `cancel()`; log `*.client_aborted` once; abort upstream work.

## Error logging rules

- Map errors to reason codes (stable strings), not free-form messages.
- Log once per failure at the boundary that decides the response.
- Include: `{ code, status, dependency/provider (if any), durationMs }`

## What to never do

- Per-chunk/per-token logging
- Logging secrets, prompts, headers, or full payloads
- Logging in ports/ or contracts/
- Throwing client-visible errors for internal finalization/telemetry timeouts

## Checklist for adding logging to a new feature

- [ ] Define event names + required fields (write them down before coding)
- [ ] Add app lifecycle logs (received/complete or response_started/stream_closed)
- [ ] Add one feature completed log with duration + outcome fields
- [ ] Add adapter request/result/error logs (sanitized, bounded)
- [ ] Add 0–2 invariant warns for “should never happen” cases
