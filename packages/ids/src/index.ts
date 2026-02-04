// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/ids`
 * Purpose: Branded ID types for compile-time RLS enforcement across the monorepo.
 * Scope: Type definitions, boundary constructors, and constants only. Zero runtime deps beyond type-fest.
 * Invariants:
 * - toUserId() is the single entry point for creating a UserId (validated UUID v4)
 * - toActorId() is the single entry point for creating an ActorId (validated UUID v4)
 * - userActor() converts UserId → ActorId without re-parsing
 * - SYSTEM_ACTOR is the only system ActorId constant (deterministic UUID for audit trails)
 * - Only edge code (HTTP handlers, env parsing, test fixtures) should call toUserId/toActorId
 * - No `as UserId` / `as ActorId` casts outside test fixtures — enforced by PR review
 * Side-effects: none
 * Links: docs/DATABASE_RLS_SPEC.md
 * @public
 */

import type { Tagged } from "type-fest";

/** UUID v4 format regex — single source of truth for ID validation. */
export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Branded user identity — validated UUID v4. Used by user-facing ports. */
export type UserId = Tagged<string, "UserId">;

/** Branded actor identity — validated UUID v4. Used by worker-facing ports and withTenantScope. */
export type ActorId = Tagged<string, "ActorId">;

/** Validate and brand a raw string as UserId. Boundary constructor — call at edges only. */
export function toUserId(raw: string): UserId {
  if (!UUID_RE.test(raw)) {
    throw new Error(`Invalid UserId (expected UUID v4): ${raw}`);
  }
  return raw as UserId;
}

/** Validate and brand a raw string as ActorId. Boundary constructor — call at edges only. */
export function toActorId(raw: string): ActorId {
  if (!UUID_RE.test(raw)) {
    throw new Error(`Invalid ActorId (expected UUID v4): ${raw}`);
  }
  return raw as ActorId;
}

/** Convert a UserId to an ActorId without re-parsing (already validated). */
export function userActor(userId: UserId): ActorId {
  return userId as unknown as ActorId;
}

/**
 * System actor constant for worker/service operations (scheduler, settlement).
 * Deterministic UUID so SET LOCAL is valid and audit logs are traceable.
 */
export const SYSTEM_ACTOR: ActorId =
  "00000000-0000-4000-a000-000000000000" as ActorId;
