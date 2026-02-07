// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/contract/ai.chat.v1.contract`
 * Purpose: Validates ai.chat.v1 contract schema for tool message support.
 * Scope: Tests Zod schema compliance for assistant-ui message format including tool-call and tool-result parts. Does not test route handler or LLM adapter behavior.
 * Invariants: Schema must correctly validate/reject message structures per role constraints.
 * Side-effects: none
 * Notes: Regression tests for multi-turn tool conversations.
 * Links: @/contracts/ai.chat.v1.contract
 * @internal
 */

import { describe, expect, it } from "vitest";
import { AssistantUiInputSchema } from "@/contracts/ai.chat.v1.contract";

describe("ai.chat.v1 contract validation", () => {
  describe("tool message format", () => {
    it("accepts second request replay with tool-call + tool-result messages", () => {
      // Simulates the exact payload that was failing: user message, assistant with tool-call, tool result, follow-up user message
      const payload = {
        messages: [
          // Original user message
          {
            role: "user",
            content: [{ type: "text", text: "What time is it?" }],
          },
          // Assistant message with tool call
          {
            role: "assistant",
            content: [
              {
                type: "tool-call",
                toolCallId: "call_abc123",
                toolName: "get_current_time",
                args: { timezone: "UTC" },
              },
            ],
          },
          // Tool result
          {
            role: "tool",
            content: [
              {
                type: "tool-result",
                toolCallId: "call_abc123",
                result: { time: "2026-01-04T06:12:00Z" },
              },
            ],
          },
          // Second user message (the one that was failing)
          {
            role: "user",
            content: [{ type: "text", text: "Thanks! And what day is it?" }],
          },
        ],
        model: "gpt-4",
        graphName: "chat",
      };

      const result = AssistantUiInputSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it("accepts assistant message with text and tool-call parts", () => {
      const payload = {
        messages: [
          {
            role: "assistant",
            content: [
              { type: "text", text: "Let me check the time for you." },
              {
                type: "tool-call",
                toolCallId: "call_xyz",
                toolName: "get_time",
                args: {},
              },
            ],
          },
        ],
        model: "gpt-4",
        graphName: "chat",
      };

      const result = AssistantUiInputSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it("accepts system message with string content", () => {
      const payload = {
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: [{ type: "text", text: "Hi" }] },
        ],
        model: "gpt-4",
        graphName: "chat",
      };

      const result = AssistantUiInputSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });
  });

  describe("cross-field validation", () => {
    it("rejects tool-call part on user message", () => {
      const payload = {
        messages: [
          {
            role: "user",
            content: [
              {
                type: "tool-call",
                toolCallId: "call_spoofed",
                toolName: "get_time",
                args: {},
              },
            ],
          },
        ],
        model: "gpt-4",
      };

      const result = AssistantUiInputSchema.safeParse(payload);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain(
          "user messages can only contain text parts"
        );
      }
    });

    it("rejects tool-result part on assistant message", () => {
      const payload = {
        messages: [
          {
            role: "assistant",
            content: [
              {
                type: "tool-result",
                toolCallId: "call_spoofed",
                result: { data: "spoofed" },
              },
            ],
          },
        ],
        model: "gpt-4",
      };

      const result = AssistantUiInputSchema.safeParse(payload);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain(
          "assistant messages cannot contain tool-result parts"
        );
      }
    });

    it("rejects role:tool with string content", () => {
      const payload = {
        messages: [{ role: "tool", content: "This should be an array" }],
        model: "gpt-4",
      };

      const result = AssistantUiInputSchema.safeParse(payload);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain(
          "tool messages must have array content"
        );
      }
    });

    it("rejects role:system with array content", () => {
      const payload = {
        messages: [
          {
            role: "system",
            content: [{ type: "text", text: "Should be string" }],
          },
        ],
        model: "gpt-4",
      };

      const result = AssistantUiInputSchema.safeParse(payload);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain(
          "system messages must have string content"
        );
      }
    });

    it("rejects tool message with multiple tool-result parts", () => {
      const payload = {
        messages: [
          {
            role: "tool",
            content: [
              { type: "tool-result", toolCallId: "call_1", result: "one" },
              { type: "tool-result", toolCallId: "call_2", result: "two" },
            ],
          },
        ],
        model: "gpt-4",
      };

      const result = AssistantUiInputSchema.safeParse(payload);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain(
          "tool messages must contain exactly 1 tool-result part"
        );
      }
    });

    it("rejects tool message with zero tool-result parts", () => {
      const payload = {
        messages: [
          {
            role: "tool",
            content: [],
          },
        ],
        model: "gpt-4",
      };

      const result = AssistantUiInputSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });
  });

  describe("size limits", () => {
    it("rejects toolCallId exceeding 128 chars", () => {
      const payload = {
        messages: [
          {
            role: "assistant",
            content: [
              {
                type: "tool-call",
                toolCallId: "x".repeat(129),
                toolName: "test",
                args: {},
              },
            ],
          },
        ],
        model: "gpt-4",
      };

      const result = AssistantUiInputSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it("rejects empty toolCallId", () => {
      const payload = {
        messages: [
          {
            role: "assistant",
            content: [
              {
                type: "tool-call",
                toolCallId: "",
                toolName: "test",
                args: {},
              },
            ],
          },
        ],
        model: "gpt-4",
      };

      const result = AssistantUiInputSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it("rejects NaN in args (non-finite number)", () => {
      // Note: NaN/Infinity can't be represented in JSON, but this tests the schema's finite() constraint
      // In practice, JSON.parse won't produce NaN, but the schema should reject if bypassed
      const payload = {
        messages: [
          {
            role: "assistant",
            content: [
              {
                type: "tool-call",
                toolCallId: "call_1",
                toolName: "test",
                args: { value: Number.NaN },
              },
            ],
          },
        ],
        model: "gpt-4",
      };

      const result = AssistantUiInputSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it("rejects tool args exceeding 8KB when serialized", () => {
      const largeArgs = { data: "x".repeat(9000) };
      const payload = {
        messages: [
          {
            role: "assistant",
            content: [
              {
                type: "tool-call",
                toolCallId: "call_1",
                toolName: "test",
                args: largeArgs,
              },
            ],
          },
        ],
        model: "gpt-4",
      };

      const result = AssistantUiInputSchema.safeParse(payload);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("8192");
      }
    });

    it("rejects tool result exceeding 32KB when serialized", () => {
      const largeResult = { data: "x".repeat(33000) };
      const payload = {
        messages: [
          {
            role: "tool",
            content: [
              {
                type: "tool-result",
                toolCallId: "call_1",
                result: largeResult,
              },
            ],
          },
        ],
        model: "gpt-4",
      };

      const result = AssistantUiInputSchema.safeParse(payload);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("32768");
      }
    });
  });
});
