// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/scheduler-worker-service/redact`
 * Purpose: Redaction paths for sensitive data in logs.
 * Scope: Define paths to redact from log output. Does not implement redaction logic.
 * Invariants: Only redact known secret-bearing keys (not generic "url").
 * Side-effects: none
 * Notes: Duplicated from src/shared/observability/server/redact.ts until @cogni/logging package exists.
 * Links: Imported by logger module; defines sensitive path patterns.
 * @internal
 */

export const REDACT_PATHS = [
  // Auth & secrets
  "password",
  "token",
  "access_token",
  "refresh_token",
  "secret",
  "apiKey",
  "api_key",
  "AUTH_SECRET",
  // Scheduler-worker specific secrets
  "schedulerApiToken",
  "config.schedulerApiToken",
  // HTTP headers
  "req.headers.authorization",
  "req.headers.cookie",
  "res.headers.set-cookie",
  "headers.authorization",
  "headers.cookie",
  // Wallet/crypto
  "privateKey",
  "mnemonic",
  "seed",
];
