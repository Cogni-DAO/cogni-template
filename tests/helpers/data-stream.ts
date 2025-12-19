// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/helpers/data-stream`
 * Purpose: Data Stream Protocol parsing utilities for testing assistant-stream endpoints.
 * Scope: Provides utilities to parse data-stream format in tests. Does not contain test assertions.
 * Invariants: Yields parsed events incrementally as they arrive; handles newline-delimited JSON
 * Side-effects: IO (reads from ReadableStream)
 * Notes: Use for stack tests that need to consume and validate assistant-stream responses.
 * Links: tests/stack/ai/chat-streaming.stack.test.ts, assistant-stream package
 * @public
 */

/**
 * Data Stream Protocol chunk types.
 * See: assistant-stream/src/core/serialization/data-stream/chunk-types.ts
 */
export const DataStreamChunkType = {
  TextDelta: "0",
  Data: "2",
  Error: "3",
  Annotation: "8",
  ToolCall: "9",
  ToolCallResult: "a",
  StartToolCall: "b",
  ToolCallArgsTextDelta: "c",
  FinishMessage: "d",
  FinishStep: "e",
  StartStep: "f",
  ReasoningDelta: "g",
  Source: "h",
} as const;

export type DataStreamChunkTypeValue =
  (typeof DataStreamChunkType)[keyof typeof DataStreamChunkType];

/**
 * Parsed Data Stream event structure
 */
export interface DataStreamEvent {
  /** Chunk type code (e.g., "0" for text delta) */
  type: string;
  /** Parsed JSON value */
  value: unknown;
}

/**
 * Asynchronously reads and parses Data Stream Protocol events from a Response body stream.
 *
 * Data Stream format:
 * - Each line is: `<type>:<json_value>`
 * - Lines are separated by newlines
 * - Type is a single character or short string code
 *
 * @param res - Response object with a readable body stream
 * @yields {DataStreamEvent} Parsed events as they arrive
 * @throws {Error} If response body is not readable or parsing fails
 *
 * @example
 * ```ts
 * const response = await fetch('/api/chat');
 * for await (const event of readDataStreamEvents(response)) {
 *   if (event.type === DataStreamChunkType.TextDelta) {
 *     console.log('Text:', event.value);
 *   }
 * }
 * ```
 */
export async function* readDataStreamEvents(
  res: Response
): AsyncIterable<DataStreamEvent> {
  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body reader");

  const decoder = new TextDecoder();
  let buf = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buf += decoder.decode(value, { stream: true });

      // Data Stream events are separated by newlines
      let idx = buf.indexOf("\n");
      while (idx !== -1) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);

        // Skip empty lines
        if (line.trim().length === 0) {
          idx = buf.indexOf("\n");
          continue;
        }

        // Parse type:value format
        const colonIdx = line.indexOf(":");
        if (colonIdx === -1) {
          throw new Error(`Invalid data stream line: ${line}`);
        }

        const type = line.slice(0, colonIdx);
        const jsonStr = line.slice(colonIdx + 1);

        let value: unknown;
        try {
          value = JSON.parse(jsonStr);
        } catch {
          throw new Error(`Invalid JSON in data stream: ${jsonStr}`);
        }

        yield { type, value };
        idx = buf.indexOf("\n");
      }
    }

    // Process any remaining content
    if (buf.trim().length > 0) {
      const colonIdx = buf.indexOf(":");
      if (colonIdx !== -1) {
        const type = buf.slice(0, colonIdx);
        const jsonStr = buf.slice(colonIdx + 1);
        try {
          const value = JSON.parse(jsonStr);
          yield { type, value };
        } catch {
          // Ignore incomplete final chunk
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Type guard for text delta events
 */
export function isTextDeltaEvent(
  event: DataStreamEvent
): event is DataStreamEvent & { value: string } {
  return event.type === DataStreamChunkType.TextDelta;
}

/**
 * Type guard for finish message events
 */
export function isFinishMessageEvent(event: DataStreamEvent): boolean {
  return event.type === DataStreamChunkType.FinishMessage;
}

/**
 * Type guard for error events
 */
export function isErrorEvent(
  event: DataStreamEvent
): event is DataStreamEvent & { value: string } {
  return event.type === DataStreamChunkType.Error;
}
