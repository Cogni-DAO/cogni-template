// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@features/ai/public.server`
 * Purpose: Server-only exports for AI feature.
 * Scope: Re-exports server-only services that depend on Node.js modules (prom-client, etc). Does not implement logic.
 * Invariants:
 *   - NEVER import this file from client components or "use client" files
 *   - Only import from .server.ts files or route handlers with runtime: "nodejs"
 * Side-effects: none
 * Notes: Split from public.ts to prevent prom-client from being bundled in client code.
 * Links: Part of hexagonal architecture boundary enforcement
 * @public
 */

// Chat graph runner (for facade to build resolver)
export { createChatRunner } from "./runners/chat.runner";
// Activity validation (for app facade)
export { validateActivityRange } from "./services/activity";
// AI runtime (P1: single AI entrypoint for streaming)
export type {
  AiRuntime,
  AiRuntimeDeps,
  AiRuntimeInput,
  AiRuntimeResult,
} from "./services/ai_runtime";
export { createAiRuntime } from "./services/ai_runtime";
// Non-streaming completion (for app facade)
export { execute, executeStream } from "./services/completion";
// Message mappers (for app facade DTO conversion)
export {
  fromCoreMessage,
  type MessageDto,
  toCoreMessages,
} from "./services/mappers";
export type { EmitAiEvent, ToolExecOptions, ToolRunner } from "./tool-runner";
// Tool runner (for bootstrap wiring)
export { createToolRunner } from "./tool-runner";
