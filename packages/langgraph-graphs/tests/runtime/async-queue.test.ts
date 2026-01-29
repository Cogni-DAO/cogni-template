// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/langgraph-graphs/tests/runtime/async-queue.test`
 * Purpose: Unit tests for AsyncQueue streaming primitive.
 * Scope: Tests sync push and async iteration behavior. Does not test integration with LangGraph.
 * Invariants:
 *   - push() is synchronous
 *   - Iteration yields items in order
 *   - close() signals end of stream
 * Side-effects: none
 * Links: src/runtime/async-queue.ts
 * @internal
 */

import { describe, expect, it } from "vitest";
import { AsyncQueue } from "../../src/runtime/core/async-queue";

describe("AsyncQueue", () => {
  it("should yield pushed items in order", async () => {
    const queue = new AsyncQueue<number>();

    queue.push(1);
    queue.push(2);
    queue.push(3);
    queue.close();

    const items: number[] = [];
    for await (const item of queue) {
      items.push(item);
    }

    expect(items).toEqual([1, 2, 3]);
  });

  it("should wait for items when queue is empty", async () => {
    const queue = new AsyncQueue<string>();

    // Start consuming in background
    const consumePromise = (async () => {
      const items: string[] = [];
      for await (const item of queue) {
        items.push(item);
      }
      return items;
    })();

    // Push after a delay
    await new Promise((r) => setTimeout(r, 10));
    queue.push("a");
    queue.push("b");
    queue.close();

    const items = await consumePromise;
    expect(items).toEqual(["a", "b"]);
  });

  it("should signal done when closed", async () => {
    const queue = new AsyncQueue<number>();
    queue.close();

    const result = await queue.next();
    expect(result.done).toBe(true);
  });

  it("should ignore pushes after close", async () => {
    const queue = new AsyncQueue<number>();

    queue.push(1);
    queue.close();
    queue.push(2); // Should be ignored

    const items: number[] = [];
    for await (const item of queue) {
      items.push(item);
    }

    expect(items).toEqual([1]);
  });

  it("should report closed state correctly", () => {
    const queue = new AsyncQueue<number>();
    expect(queue.isClosed()).toBe(false);
    queue.close();
    expect(queue.isClosed()).toBe(true);
  });
});
