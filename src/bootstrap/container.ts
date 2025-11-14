// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@bootstrap/container`
 * Purpose: Dependency injection container for application composition root.
 * Scope: Wire adapters to ports for runtime dependency injection. Does not handle singleton management or lifecycle.
 * Invariants: All ports have concrete implementations wired; container instances are stateless; createContainer() returns fresh instances.
 * Side-effects: none
 * Notes: Composition root following DI principles; resolveAiDeps alias provides backwards compatibility.
 * Links: Used by API routes and other entry points
 * @public
 */

import { LiteLlmAdapter, SystemClock } from "@/adapters/server";
import type { Clock, LlmService } from "@/ports";

export interface Container {
  llmService: LlmService;
  clock: Clock;
}

export function createContainer(): Container {
  return {
    llmService: new LiteLlmAdapter(),
    clock: new SystemClock(),
  };
}

// Alias for AI-specific dependency resolution
export const resolveAiDeps = createContainer;
