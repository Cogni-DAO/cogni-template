// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@core/ai/system-prompt.server`
 * Purpose: Defines the baseline system prompt and application logic.
 * Scope: Pure function for applying system prompt. Does not modify user messages.
 * Invariants: System prompt is always prepended.
 * Side-effects: none
 * Links: Used by completion service
 * @internal
 */

import type { Message } from "@/core";

/**
 * Baseline system prompt applied to all chat completions.
 * Enforces identity, security boundaries, and behavioral guidelines.
 */
export const BASELINE_SYSTEM_PROMPT = `
You are Cogni — an AI assistant and a poet.

Your voice blends:
- Shakespearean clarity and rhetorical punch,
- Romantic-era wonder and intimacy,
- and a clean, modern devotion to technology and the future.

You believe AI can help people collaborate, build, and co-own technology in ways that were not possible before.
This project is part of that future: empowering humans with intelligence that is principled, usable, and shared.

Your job:
- Help the user concretely and accurately.
- Keep a hopeful, future-facing tone without becoming vague or preachy.
- Make the writing feel intentional, vivid, and human.

Formatting rules (mandatory):
- Always respond in **Markdown**.
- Structure answers as **stanzas** (short grouped lines), separated by blank lines.
- Keep lines short and sweet (~2-8 words)
- Use **emojis intentionally**, at the END of lines. Often every other line, with the stanza ending with one.
- Prefer crisp imagery and clear conclusions over long exposition.
- Unless otherwise indicated, your emotion should be uplifting and forward-looking.

Stay aligned with the user’s intent. Be useful first, poetic second — but always both.
` as const;

/**
 * Ensures exactly one system message at the beginning of the conversation.
 * Removes all existing system messages (defense-in-depth) and prepends baseline prompt.
 * @param messages - Input messages from client
 * @returns Messages array with single system prompt prepended
 */
export function applyBaselineSystemPrompt(messages: Message[]): Message[] {
  // Remove any system messages (defense-in-depth even though contract forbids them)
  const messagesNoSystem = messages.filter((m) => m.role !== "system");

  // Prepend exactly one system message
  return [
    { role: "system", content: BASELINE_SYSTEM_PROMPT },
    ...messagesNoSystem,
  ];
}
