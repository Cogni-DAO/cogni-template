/**
 * SPDX-License-Identifier: MIT
 * SPDX-FileCopyrightText: 2024 Cogni-DAO
 */

/**
 * Fake clock implementation for deterministic unit tests.
 *
 * Provides controllable time for testing time-sensitive logic
 * without actual time dependencies.
 */
export class FakeClock {
  private currentTime: Date;

  constructor(initialTime: string | Date = "2024-01-01T00:00:00.000Z") {
    this.currentTime = new Date(initialTime);
  }

  now(): Date {
    return new Date(this.currentTime);
  }

  advance(milliseconds: number): void {
    this.currentTime = new Date(this.currentTime.getTime() + milliseconds);
  }

  setTime(time: string | Date): void {
    this.currentTime = new Date(time);
  }

  reset(): void {
    this.currentTime = new Date("2024-01-01T00:00:00.000Z");
  }
}
