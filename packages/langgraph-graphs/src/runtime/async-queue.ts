// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/langgraph-graphs/runtime/async-queue`
 * Purpose: Simple async queue for streaming events from sync producers.
 * Scope: Enables invoke() + queue pattern per LANGGRAPH_AI.md (NOT streamEvents).
 * Invariants:
 *   - push() is synchronous (per NO_AWAIT_IN_TOKEN_PATH)
 *   - Implements AsyncIterable for consumer
 *   - close() signals end of stream
 * Side-effects: none
 * Links: LANGGRAPH_AI.md (invoke + AsyncQueue pattern)
 * @public
 */

/**
 * Simple async queue for streaming.
 *
 * Usage:
 * ```typescript
 * const queue = new AsyncQueue<Event>();
 *
 * // Producer (sync push)
 * queue.push({ type: "text_delta", delta: "hello" });
 * queue.close();
 *
 * // Consumer (async iteration)
 * for await (const event of queue) {
 *   console.log(event);
 * }
 * ```
 */
export class AsyncQueue<T> implements AsyncIterable<T> {
  private queue: T[] = [];
  private closed = false;
  private resolveWaiter: ((value: IteratorResult<T>) => void) | null = null;

  /**
   * Push an item to the queue. Synchronous per NO_AWAIT_IN_TOKEN_PATH.
   */
  push(item: T): void {
    if (this.closed) {
      return; // Silently ignore pushes after close
    }

    if (this.resolveWaiter) {
      // Consumer is waiting - resolve immediately
      const resolve = this.resolveWaiter;
      this.resolveWaiter = null;
      resolve({ value: item, done: false });
    } else {
      // Queue for later consumption
      this.queue.push(item);
    }
  }

  /**
   * Close the queue, signaling end of stream.
   */
  close(): void {
    this.closed = true;

    if (this.resolveWaiter) {
      // Consumer is waiting - signal done
      const resolve = this.resolveWaiter;
      this.resolveWaiter = null;
      resolve({ value: undefined as T, done: true });
    }
  }

  /**
   * Check if queue is closed.
   */
  isClosed(): boolean {
    return this.closed;
  }

  /**
   * Implement AsyncIterator protocol.
   */
  async next(): Promise<IteratorResult<T>> {
    // If there are queued items, return immediately
    if (this.queue.length > 0) {
      // Length check guarantees shift() returns a value
      const value = this.queue.shift() as T;
      return { value, done: false };
    }

    // If closed and queue empty, we're done
    if (this.closed) {
      return { value: undefined as T, done: true };
    }

    // Wait for next push or close
    return new Promise((resolve) => {
      this.resolveWaiter = resolve;
    });
  }

  /**
   * Implement AsyncIterable protocol.
   */
  [Symbol.asyncIterator](): AsyncIterator<T> {
    return this;
  }
}
