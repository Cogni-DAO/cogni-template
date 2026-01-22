// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/scheduler-worker/tests/activities.test`
 * Purpose: Unit tests for scheduler-worker activities.
 * Scope: Tests activity creation and basic behavior with mocked deps.
 * Note: Full integration testing done via stack tests.
 * @internal
 */

import { describe, expect, it, vi } from "vitest";

// Mock @temporalio/activity before importing activities
vi.mock("@temporalio/activity", () => ({
  ApplicationFailure: {
    nonRetryable: (message: string, type?: string, details?: unknown) => {
      const error = new Error(message);
      (error as { type?: string }).type = type;
      (error as { details?: unknown }).details = details;
      return error;
    },
  },
  activityInfo: () => ({
    workflowExecution: {
      workflowId: "test-workflow-id",
      runId: "test-temporal-run-id",
    },
  }),
}));

import { createActivities } from "../src/activities/index.js";
import {
  createMockApiSuccessResponse,
  createMockGrant,
  FIXED_IDS,
} from "./fixtures.js";

// Mock logger
const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: () => mockLogger,
} as unknown as Parameters<typeof createActivities>[0]["logger"];

describe("createActivities", () => {
  it("returns all expected activity functions", () => {
    const mockDb = {} as Parameters<typeof createActivities>[0]["db"];
    const mockGrantAdapter = {
      validateGrantForGraph: vi.fn(),
    } as unknown as Parameters<typeof createActivities>[0]["grantAdapter"];
    const mockRunAdapter = {
      createRun: vi.fn(),
      markRunStarted: vi.fn(),
      markRunCompleted: vi.fn(),
    } as unknown as Parameters<typeof createActivities>[0]["runAdapter"];

    const activities = createActivities({
      db: mockDb,
      grantAdapter: mockGrantAdapter,
      runAdapter: mockRunAdapter,
      config: {
        appBaseUrl: "http://localhost:3000",
        schedulerApiToken: "test-token-min-32-characters-long",
      },
      logger: mockLogger,
    });

    expect(activities).toHaveProperty("validateGrantActivity");
    expect(activities).toHaveProperty("createScheduleRunActivity");
    expect(activities).toHaveProperty("executeGraphActivity");
    expect(activities).toHaveProperty("updateScheduleRunActivity");

    expect(typeof activities.validateGrantActivity).toBe("function");
    expect(typeof activities.createScheduleRunActivity).toBe("function");
    expect(typeof activities.executeGraphActivity).toBe("function");
    expect(typeof activities.updateScheduleRunActivity).toBe("function");
  });
});

describe("validateGrantActivity", () => {
  it("calls grantAdapter.validateGrantForGraph with correct args", async () => {
    const mockGrantAdapter = {
      validateGrantForGraph: vi.fn().mockResolvedValue(createMockGrant()),
    } as unknown as Parameters<typeof createActivities>[0]["grantAdapter"];

    const activities = createActivities({
      db: {} as Parameters<typeof createActivities>[0]["db"],
      grantAdapter: mockGrantAdapter,
      runAdapter: {} as Parameters<typeof createActivities>[0]["runAdapter"],
      config: {
        appBaseUrl: "http://localhost:3000",
        schedulerApiToken: "test-token-min-32-characters-long",
      },
      logger: mockLogger,
    });

    await activities.validateGrantActivity({
      grantId: FIXED_IDS.grantId,
      graphId: FIXED_IDS.graphId,
    });

    expect(mockGrantAdapter.validateGrantForGraph).toHaveBeenCalledWith(
      FIXED_IDS.grantId,
      FIXED_IDS.graphId
    );
  });

  it("throws when grant validation fails", async () => {
    const mockGrantAdapter = {
      validateGrantForGraph: vi
        .fn()
        .mockRejectedValue(new Error("Grant expired")),
    } as unknown as Parameters<typeof createActivities>[0]["grantAdapter"];

    const activities = createActivities({
      db: {} as Parameters<typeof createActivities>[0]["db"],
      grantAdapter: mockGrantAdapter,
      runAdapter: {} as Parameters<typeof createActivities>[0]["runAdapter"],
      config: {
        appBaseUrl: "http://localhost:3000",
        schedulerApiToken: "test-token-min-32-characters-long",
      },
      logger: mockLogger,
    });

    await expect(
      activities.validateGrantActivity({
        grantId: FIXED_IDS.grantId,
        graphId: FIXED_IDS.graphId,
      })
    ).rejects.toThrow("Grant expired");
  });
});

describe("createScheduleRunActivity", () => {
  it("calls runAdapter.createRun with correct args", async () => {
    const mockRunAdapter = {
      createRun: vi.fn().mockResolvedValue(undefined),
      markRunStarted: vi.fn(),
      markRunCompleted: vi.fn(),
    } as unknown as Parameters<typeof createActivities>[0]["runAdapter"];

    const activities = createActivities({
      db: {} as Parameters<typeof createActivities>[0]["db"],
      grantAdapter: {} as Parameters<
        typeof createActivities
      >[0]["grantAdapter"],
      runAdapter: mockRunAdapter,
      config: {
        appBaseUrl: "http://localhost:3000",
        schedulerApiToken: "test-token-min-32-characters-long",
      },
      logger: mockLogger,
    });

    const scheduledFor = "2025-01-15T10:00:00.000Z";

    await activities.createScheduleRunActivity({
      scheduleId: FIXED_IDS.scheduleId,
      runId: FIXED_IDS.runId,
      scheduledFor,
    });

    expect(mockRunAdapter.createRun).toHaveBeenCalledWith({
      scheduleId: FIXED_IDS.scheduleId,
      runId: FIXED_IDS.runId,
      scheduledFor: new Date(scheduledFor),
    });
  });
});

describe("updateScheduleRunActivity", () => {
  it("calls markRunStarted for running status", async () => {
    const mockRunAdapter = {
      createRun: vi.fn(),
      markRunStarted: vi.fn().mockResolvedValue(undefined),
      markRunCompleted: vi.fn(),
    } as unknown as Parameters<typeof createActivities>[0]["runAdapter"];

    const activities = createActivities({
      db: {} as Parameters<typeof createActivities>[0]["db"],
      grantAdapter: {} as Parameters<
        typeof createActivities
      >[0]["grantAdapter"],
      runAdapter: mockRunAdapter,
      config: {
        appBaseUrl: "http://localhost:3000",
        schedulerApiToken: "test-token-min-32-characters-long",
      },
      logger: mockLogger,
    });

    await activities.updateScheduleRunActivity({
      runId: FIXED_IDS.runId,
      status: "running",
      traceId: "trace-123",
    });

    expect(mockRunAdapter.markRunStarted).toHaveBeenCalledWith(
      FIXED_IDS.runId,
      "trace-123"
    );
  });

  it("calls markRunCompleted for success status", async () => {
    const mockRunAdapter = {
      createRun: vi.fn(),
      markRunStarted: vi.fn(),
      markRunCompleted: vi.fn().mockResolvedValue(undefined),
    } as unknown as Parameters<typeof createActivities>[0]["runAdapter"];

    const activities = createActivities({
      db: {} as Parameters<typeof createActivities>[0]["db"],
      grantAdapter: {} as Parameters<
        typeof createActivities
      >[0]["grantAdapter"],
      runAdapter: mockRunAdapter,
      config: {
        appBaseUrl: "http://localhost:3000",
        schedulerApiToken: "test-token-min-32-characters-long",
      },
      logger: mockLogger,
    });

    await activities.updateScheduleRunActivity({
      runId: FIXED_IDS.runId,
      status: "success",
    });

    expect(mockRunAdapter.markRunCompleted).toHaveBeenCalledWith(
      FIXED_IDS.runId,
      "success",
      undefined
    );
  });

  it("calls markRunCompleted for error status with message", async () => {
    const mockRunAdapter = {
      createRun: vi.fn(),
      markRunStarted: vi.fn(),
      markRunCompleted: vi.fn().mockResolvedValue(undefined),
    } as unknown as Parameters<typeof createActivities>[0]["runAdapter"];

    const activities = createActivities({
      db: {} as Parameters<typeof createActivities>[0]["db"],
      grantAdapter: {} as Parameters<
        typeof createActivities
      >[0]["grantAdapter"],
      runAdapter: mockRunAdapter,
      config: {
        appBaseUrl: "http://localhost:3000",
        schedulerApiToken: "test-token-min-32-characters-long",
      },
      logger: mockLogger,
    });

    await activities.updateScheduleRunActivity({
      runId: FIXED_IDS.runId,
      status: "error",
      errorMessage: "Something went wrong",
    });

    expect(mockRunAdapter.markRunCompleted).toHaveBeenCalledWith(
      FIXED_IDS.runId,
      "error",
      "Something went wrong"
    );
  });
});

describe("executeGraphActivity", () => {
  it("calls internal API with correct headers and body", async () => {
    const mockResponse = createMockApiSuccessResponse();

    // Mock global fetch
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });
    vi.stubGlobal("fetch", mockFetch);

    const activities = createActivities({
      db: {} as Parameters<typeof createActivities>[0]["db"],
      grantAdapter: {} as Parameters<
        typeof createActivities
      >[0]["grantAdapter"],
      runAdapter: {} as Parameters<typeof createActivities>[0]["runAdapter"],
      config: {
        appBaseUrl: "http://localhost:3000",
        schedulerApiToken: "test-token-min-32-characters-long",
      },
      logger: mockLogger,
    });

    const result = await activities.executeGraphActivity({
      scheduleId: FIXED_IDS.scheduleId,
      graphId: FIXED_IDS.graphId,
      executionGrantId: FIXED_IDS.grantId,
      input: { messages: [], model: "openrouter/auto" },
      scheduledFor: "2025-01-15T10:00:00.000Z",
      runId: FIXED_IDS.runId,
    });

    expect(mockFetch).toHaveBeenCalledWith(
      `http://localhost:3000/api/internal/graphs/${FIXED_IDS.graphId}/runs`,
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer test-token-min-32-characters-long",
          "Idempotency-Key": `${FIXED_IDS.scheduleId}:2025-01-15T10:00:00.000Z`,
        },
        body: JSON.stringify({
          executionGrantId: FIXED_IDS.grantId,
          input: { messages: [], model: "openrouter/auto" },
          runId: FIXED_IDS.runId,
        }),
      })
    );

    expect(result).toEqual(mockResponse);

    vi.unstubAllGlobals();
  });

  it("throws on HTTP error", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve("Unauthorized"),
    });
    vi.stubGlobal("fetch", mockFetch);

    const activities = createActivities({
      db: {} as Parameters<typeof createActivities>[0]["db"],
      grantAdapter: {} as Parameters<
        typeof createActivities
      >[0]["grantAdapter"],
      runAdapter: {} as Parameters<typeof createActivities>[0]["runAdapter"],
      config: {
        appBaseUrl: "http://localhost:3000",
        schedulerApiToken: "test-token-min-32-characters-long",
      },
      logger: mockLogger,
    });

    await expect(
      activities.executeGraphActivity({
        scheduleId: FIXED_IDS.scheduleId,
        graphId: FIXED_IDS.graphId,
        executionGrantId: FIXED_IDS.grantId,
        input: {},
        scheduledFor: "2025-01-15T10:00:00.000Z",
        runId: FIXED_IDS.runId,
      })
    ).rejects.toThrow(/Internal API client error: 401/);

    vi.unstubAllGlobals();
  });
});
