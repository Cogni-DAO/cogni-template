// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/langgraph-graphs/runtime/message-converters`
 * Purpose: Convert between app Message format and LangChain BaseMessage format.
 * Scope: Pure converters, handles all message roles. Does not modify message content.
 * Invariants:
 *   - Bidirectional conversion preserves all fields
 *   - Tool calls properly mapped between formats
 *   - Compatible with src/core/chat/model.ts Message type
 * Side-effects: none
 * Links: LANGGRAPH_AI.md
 * @public
 */

import {
  AIMessage,
  type BaseMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from "@langchain/core/messages";

/**
 * Tool call embedded in assistant message.
 * Compatible with src/core/chat/model.ts MessageToolCall.
 */
export interface MessageToolCall {
  readonly id: string;
  readonly name: string;
  readonly arguments: string;
}

/**
 * Message type compatible with app domain.
 * Matches src/core/chat/model.ts Message interface.
 */
export interface Message {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  timestamp?: string;
  toolCalls?: MessageToolCall[];
  toolCallId?: string;
}

/**
 * Convert app Message to LangChain BaseMessage.
 *
 * @param msg - App message format
 * @returns LangChain BaseMessage
 */
export function toBaseMessage(msg: Message): BaseMessage {
  switch (msg.role) {
    case "user":
      return new HumanMessage({ content: msg.content });

    case "system":
      return new SystemMessage({ content: msg.content });

    case "assistant": {
      // Convert tool calls to LangChain format
      const toolCalls = msg.toolCalls?.map((tc) => ({
        id: tc.id,
        name: tc.name,
        args: JSON.parse(tc.arguments) as Record<string, unknown>,
        type: "tool_call" as const,
      }));

      return new AIMessage({
        content: msg.content,
        tool_calls: toolCalls,
      });
    }

    case "tool":
      if (!msg.toolCallId) {
        throw new Error("Tool message requires toolCallId");
      }
      return new ToolMessage({
        content: msg.content,
        tool_call_id: msg.toolCallId,
      });

    default: {
      const _exhaustive: never = msg.role;
      throw new Error(`Unknown message role: ${_exhaustive}`);
    }
  }
}

/**
 * Convert LangChain BaseMessage to app Message.
 *
 * @param msg - LangChain BaseMessage
 * @returns App message format
 */
export function fromBaseMessage(msg: BaseMessage): Message {
  const msgType = msg._getType();

  switch (msgType) {
    case "human":
      return {
        role: "user",
        content: typeof msg.content === "string" ? msg.content : "",
      };

    case "system":
      return {
        role: "system",
        content: typeof msg.content === "string" ? msg.content : "",
      };

    case "ai": {
      const aiMsg = msg as AIMessage;
      const content = typeof aiMsg.content === "string" ? aiMsg.content : "";

      // Convert tool calls from LangChain format
      const toolCalls = aiMsg.tool_calls?.map((tc) => ({
        id: tc.id ?? "",
        name: tc.name,
        arguments: JSON.stringify(tc.args),
      }));

      return {
        role: "assistant",
        content,
        ...(toolCalls && toolCalls.length > 0 ? { toolCalls } : {}),
      };
    }

    case "tool": {
      const toolMsg = msg as ToolMessage;
      return {
        role: "tool",
        content: typeof toolMsg.content === "string" ? toolMsg.content : "",
        toolCallId: toolMsg.tool_call_id,
      };
    }

    default:
      // Fallback for unknown types
      return {
        role: "assistant",
        content: typeof msg.content === "string" ? msg.content : "",
      };
  }
}
