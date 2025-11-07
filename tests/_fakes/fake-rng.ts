/**
 * SPDX-License-Identifier: MIT
 * SPDX-FileCopyrightText: 2024 Cogni-DAO
 */

/**
 * Fake RNG implementation for deterministic unit tests.
 *
 * Provides predictable random values for testing logic
 * that depends on randomness without actual randomness.
 */
export class FakeRng {
  private sequence: string[];
  private index = 0;

  constructor(
    sequence: string[] = ["test-uuid-1", "test-uuid-2", "test-uuid-3"]
  ) {
    this.sequence = sequence;
  }

  uuid(): string {
    if (this.sequence.length === 0) {
      return "default-uuid";
    }
    const index = this.index % this.sequence.length;
    const value = this.sequence[index];
    this.index += 1;
    return value ?? "fallback-uuid";
  }

  setSequence(sequence: string[]): void {
    this.sequence = sequence;
    this.index = 0;
  }

  reset(): void {
    this.index = 0;
  }
}
