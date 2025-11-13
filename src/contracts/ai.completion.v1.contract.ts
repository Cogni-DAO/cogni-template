// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@contracts/ai.completion.v1.contract`
 * Purpose: External API contract for AI completion with DTOs that isolate internal types
 * Scope: Edge IO definition with schema validation. Does not contain business logic.
 * Invariants: Contract remains stable; breaking changes require new version
 * Side-effects: none
 * Notes: Hard cap at schema level, client timestamps ignored
 * Links: Used by HTTP routes for validation
 * @internal
 */

import { z } from "zod";

/** Message length limit - duplicated from core to avoid dependency */
const MAX_MESSAGE_CHARS = 4000;

// DTOs that don't leak core internals
export const MessageDtoSchema = z.object({
  /** No 'system' role allowed from client */
  role: z.enum(["user", "assistant"]),
  /** Hard cap enforced at schema level */
  content: z.string().max(MAX_MESSAGE_CHARS),
  /** Client timestamp ignored - server sets timestamps */
  timestamp: z.string().optional(),
});

export const aiCompletionOperation = {
  id: "ai.completion.v1",
  summary: "Chat completion via AI",
  description: "Send messages to AI and receive completion response",
  input: z.object({
    messages: z.array(MessageDtoSchema),
  }),
  output: z.object({
    message: MessageDtoSchema.omit({ timestamp: true }).extend({
      /** Always present in response */
      timestamp: z.string(),
    }),
  }),
} as const;
