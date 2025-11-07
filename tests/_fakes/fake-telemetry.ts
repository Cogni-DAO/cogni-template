/**
 * SPDX-License-Identifier: MIT
 * SPDX-FileCopyrightText: 2024 Cogni-DAO
 */

/**
 * Fake telemetry implementation for unit tests.
 *
 * Captures telemetry calls for verification without
 * external service dependencies.
 */
export class FakeTelemetry {
  private events: { type: string; data: unknown; timestamp: Date }[] = [];
  private traces: { name: string; data: unknown; timestamp: Date }[] = [];

  event(type: string, data: unknown): void {
    this.events.push({ type, data, timestamp: new Date() });
  }

  trace(name: string, data: unknown): void {
    this.traces.push({ name, data, timestamp: new Date() });
  }

  getEvents(): { type: string; data: unknown; timestamp: Date }[] {
    return [...this.events];
  }

  getTraces(): { name: string; data: unknown; timestamp: Date }[] {
    return [...this.traces];
  }

  getEventCount(): number {
    return this.events.length;
  }

  getTraceCount(): number {
    return this.traces.length;
  }

  reset(): void {
    this.events = [];
    this.traces = [];
  }
}
