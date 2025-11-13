// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@bootstrap/container`
 * Purpose: Dependency injection container for application composition
 * Scope: Wire adapters to ports for runtime dependency injection
 * Invariants: All ports have concrete implementations wired
 * Side-effects: Creates adapter instances
 * Notes: Composition root following DI principles
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
