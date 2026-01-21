// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@adapters/server/temporal/schedule-control`
 * Purpose: Temporal implementation of ScheduleControlPort.
 * Scope: Implements schedule lifecycle via Temporal client. Does not handle workflow execution logic.
 * Invariants:
 *   - Per CRUD_IS_TEMPORAL_AUTHORITY: Only CRUD endpoints use this adapter
 *   - Per WORKER_NEVER_CONTROLS_SCHEDULES: Worker must not depend on this
 *   - Per OVERLAP_SKIP_DEFAULT: Schedules use overlap=SKIP
 *   - Per CATCHUP_WINDOW_ZERO: No backfill (catchupWindow=0)
 * Side-effects: IO (Temporal RPC calls)
 * Links: docs/SCHEDULER_SPEC.md, docs/TEMPORAL_PATTERNS.md, ScheduleControlPort
 * @public
 */

import {
  type CreateScheduleParams,
  ScheduleControlConflictError,
  ScheduleControlNotFoundError,
  type ScheduleControlPort,
  ScheduleControlUnavailableError,
  type ScheduleDescription,
} from "@cogni/scheduler-core";
import {
  Client,
  Connection,
  type ConnectionOptions,
  ScheduleAlreadyRunning,
  ScheduleOverlapPolicy,
  ScheduleNotFoundError as TemporalScheduleNotFoundError,
} from "@temporalio/client";

/**
 * Configuration for TemporalScheduleControlAdapter.
 */
export interface TemporalScheduleControlConfig {
  /** Temporal server address (e.g., "localhost:7233" or "temporal:7233") */
  address: string;
  /** Temporal namespace (e.g., "cogni-test", "cogni-production") */
  namespace: string;
  /** Task queue for scheduled workflows */
  taskQueue: string;
}

/** Workflow type name for scheduled graph execution (defined in scheduler-temporal-worker) */
const SCHEDULED_RUN_WORKFLOW_TYPE = "GovernanceScheduledRunWorkflow";

/**
 * Temporal implementation of ScheduleControlPort.
 * Per TEMPORAL_PATTERNS.md: overlap=SKIP, catchupWindow=0 hardcoded.
 */
export class TemporalScheduleControlAdapter implements ScheduleControlPort {
  private client: Client | null = null;
  private connection: Connection | null = null;

  constructor(private readonly config: TemporalScheduleControlConfig) {}

  private async getClient(): Promise<Client> {
    if (this.client) {
      return this.client;
    }

    try {
      const connectionOptions: ConnectionOptions = {
        address: this.config.address,
      };

      this.connection = await Connection.connect(connectionOptions);
      this.client = new Client({
        connection: this.connection,
        namespace: this.config.namespace,
      });

      return this.client;
    } catch (error) {
      throw new ScheduleControlUnavailableError(
        "connect",
        error instanceof Error ? error : undefined
      );
    }
  }

  async createSchedule(params: CreateScheduleParams): Promise<void> {
    const client = await this.getClient();

    try {
      const handle = client.schedule.getHandle(params.scheduleId);

      // Check if schedule already exists
      try {
        await handle.describe();
        // If describe succeeds, schedule exists - throw conflict
        throw new ScheduleControlConflictError(params.scheduleId);
      } catch (error) {
        if (error instanceof ScheduleControlConflictError) {
          throw error;
        }
        // Schedule doesn't exist - proceed with creation
        if (!(error instanceof TemporalScheduleNotFoundError)) {
          throw error;
        }
      }

      await client.schedule.create({
        scheduleId: params.scheduleId,
        spec: {
          cronExpressions: [params.cron],
          timezone: params.timezone,
        },
        action: {
          type: "startWorkflow",
          workflowType: SCHEDULED_RUN_WORKFLOW_TYPE,
          // Per WORKFLOW_ID_INCLUDES_TIMESTAMP: workflowId includes schedule time
          // Temporal appends timestamp automatically for scheduled workflows
          workflowId: params.scheduleId,
          args: [
            {
              scheduleId: params.scheduleId,
              graphId: params.graphId,
              executionGrantId: params.executionGrantId,
              input: params.input,
            },
          ],
          taskQueue: this.config.taskQueue,
        },
        policies: {
          // Per OVERLAP_SKIP_DEFAULT: Only one workflow instance per schedule at a time
          overlap: ScheduleOverlapPolicy.SKIP,
          // Per CATCHUP_WINDOW_ZERO: No backfill in P0
          catchupWindow: "0s",
        },
      });
    } catch (error) {
      if (error instanceof ScheduleControlConflictError) {
        throw error;
      }
      if (error instanceof ScheduleAlreadyRunning) {
        throw new ScheduleControlConflictError(params.scheduleId);
      }
      throw new ScheduleControlUnavailableError(
        "createSchedule",
        error instanceof Error ? error : undefined
      );
    }
  }

  async pauseSchedule(scheduleId: string): Promise<void> {
    const client = await this.getClient();

    try {
      const handle = client.schedule.getHandle(scheduleId);
      await handle.pause();
    } catch (error) {
      if (error instanceof TemporalScheduleNotFoundError) {
        throw new ScheduleControlNotFoundError(scheduleId);
      }
      throw new ScheduleControlUnavailableError(
        "pauseSchedule",
        error instanceof Error ? error : undefined
      );
    }
  }

  async resumeSchedule(scheduleId: string): Promise<void> {
    const client = await this.getClient();

    try {
      const handle = client.schedule.getHandle(scheduleId);
      await handle.unpause();
    } catch (error) {
      if (error instanceof TemporalScheduleNotFoundError) {
        throw new ScheduleControlNotFoundError(scheduleId);
      }
      throw new ScheduleControlUnavailableError(
        "resumeSchedule",
        error instanceof Error ? error : undefined
      );
    }
  }

  async deleteSchedule(scheduleId: string): Promise<void> {
    const client = await this.getClient();

    try {
      const handle = client.schedule.getHandle(scheduleId);
      await handle.delete();
    } catch (error) {
      // Idempotent: not found is success
      if (error instanceof TemporalScheduleNotFoundError) {
        return;
      }
      throw new ScheduleControlUnavailableError(
        "deleteSchedule",
        error instanceof Error ? error : undefined
      );
    }
  }

  async describeSchedule(
    scheduleId: string
  ): Promise<ScheduleDescription | null> {
    const client = await this.getClient();

    try {
      const handle = client.schedule.getHandle(scheduleId);
      const description = await handle.describe();

      const nextActionTimes = description.info.nextActionTimes;
      const recentActions = description.info.recentActions;

      const nextTime = nextActionTimes[0];
      const lastAction = recentActions[recentActions.length - 1];

      return {
        scheduleId,
        nextRunAtIso: nextTime ? nextTime.toISOString() : null,
        lastRunAtIso: lastAction ? lastAction.scheduledAt.toISOString() : null,
        isPaused: description.state.paused,
      };
    } catch (error) {
      if (error instanceof TemporalScheduleNotFoundError) {
        return null;
      }
      throw new ScheduleControlUnavailableError(
        "describeSchedule",
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Close the Temporal connection.
   * Should be called on graceful shutdown.
   */
  async close(): Promise<void> {
    if (this.connection) {
      await this.connection.close();
      this.connection = null;
      this.client = null;
    }
  }
}
