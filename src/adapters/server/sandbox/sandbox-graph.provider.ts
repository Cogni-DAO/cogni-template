// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@adapters/server/sandbox/sandbox-graph.provider`
 * Purpose: GraphProvider implementation that executes agents in sandboxed containers.
 * Scope: Routes sandbox:* graphIds through SandboxRunnerAdapter. Does not implement agent logic.
 * Invariants:
 *   - Per SANDBOXED_AGENTS.md P0.75: Agent runs in sandbox via graph execution pipeline
 *   - Per UNIFIED_GRAPH_EXECUTOR: Registered in AggregatingGraphExecutor like any provider
 *   - Per SECRETS_HOST_ONLY: Only messages + model passed to sandbox, never credentials
 *   - Per BILLING_INDEPENDENT_OF_CLIENT: usage_report emitted for RunEventRelay billing
 * Side-effects: IO (creates tmp workspace, runs Docker containers via SandboxRunnerPort)
 * Links: docs/SANDBOXED_AGENTS.md, graph-provider.ts, sandbox-runner.adapter.ts
 * @internal
 */

import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { AiEvent, UsageFact } from "@cogni/ai-core";
import type { Logger } from "pino";

import type {
  AiExecutionErrorCode,
  GraphFinal,
  GraphRunRequest,
  GraphRunResult,
  SandboxProgramContract,
  SandboxRunnerPort,
  SandboxRunResult,
} from "@/ports";
import { makeLogger } from "@/shared/observability";

import type { GraphProvider } from "../ai/graph-provider";

/** Provider ID for sandbox agent execution */
export const SANDBOX_PROVIDER_ID = "sandbox" as const;

/** Sandbox agent definition */
interface SandboxAgentEntry {
  readonly name: string;
  readonly description: string;
  /** Command to execute in the sandbox container */
  readonly argv: readonly string[];
}

/**
 * Registry of known sandbox agents.
 * P0.75: single "agent" entry that runs the minimal LLM agent script.
 * P1+: could be loaded from config or discovered from images.
 */
const SANDBOX_AGENTS: Record<string, SandboxAgentEntry> = {
  agent: {
    name: "Sandbox Agent",
    description:
      "LLM agent running in isolated container (network=none, LLM via proxy)",
    argv: ["node", "/agent/run.mjs"],
  },
};

/**
 * GraphProvider that executes agents in sandboxed Docker containers.
 *
 * Per SANDBOXED_AGENTS.md P0.75: integrates sandbox execution into the
 * standard chat pipeline so users can select "sandbox:agent" in the UI.
 *
 * Flow:
 * 1. Write messages to workspace as JSON
 * 2. Run agent in sandbox via SandboxRunnerPort.runOnce()
 * 3. Agent reads messages, calls LLM via OPENAI_API_BASE, prints response
 * 4. Collect stdout → emit as text_delta AiEvents
 * 5. Emit usage_report for billing
 * 6. Return GraphFinal
 */
export class SandboxGraphProvider implements GraphProvider {
  readonly providerId = SANDBOX_PROVIDER_ID;
  private readonly log: Logger;

  constructor(private readonly runner: SandboxRunnerPort) {
    this.log = makeLogger({ component: "SandboxGraphProvider" });
    this.log.debug(
      { agents: Object.keys(SANDBOX_AGENTS) },
      "SandboxGraphProvider initialized"
    );
  }

  canHandle(graphId: string): boolean {
    if (!graphId.startsWith(`${this.providerId}:`)) return false;
    const agentName = graphId.slice(this.providerId.length + 1);
    return agentName in SANDBOX_AGENTS;
  }

  runGraph(req: GraphRunRequest): GraphRunResult {
    const { runId, ingressRequestId, graphId } = req;

    const agentName = graphId.slice(this.providerId.length + 1);
    const agent = SANDBOX_AGENTS[agentName];
    if (!agent) {
      this.log.error({ runId, graphId, agentName }, "Unknown sandbox agent");
      return this.createErrorResult(runId, ingressRequestId, "not_found");
    }

    this.log.debug(
      { runId, agentName, messageCount: req.messages.length, model: req.model },
      "SandboxGraphProvider.runGraph starting"
    );

    return this.createExecution(req, agent);
  }

  /**
   * Create the async stream + final promise for a sandbox execution.
   * Pattern matches LangGraphInProcProvider: runGraph returns synchronously,
   * execution happens when the stream is consumed.
   */
  private createExecution(
    req: GraphRunRequest,
    agent: SandboxAgentEntry
  ): GraphRunResult {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    const state = {
      resolve: null as null | ((value: GraphFinal) => void),
    };
    const final = new Promise<GraphFinal>((resolve) => {
      state.resolve = resolve;
    });

    const stream = (async function* (): AsyncIterable<AiEvent> {
      const { runId, ingressRequestId, messages, model, caller, graphId } = req;
      const attempt = 0; // P0_ATTEMPT_FREEZE

      // Create isolated workspace with messages file
      const workspaceDir = mkdtempSync(join(tmpdir(), `sandbox-${runId}-`));
      const cogniDir = join(workspaceDir, ".cogni");
      mkdirSync(cogniDir, { recursive: true });

      // Symlink-safe write: verify resolved path stays inside workspace
      // Prevents symlink escape if workspace is somehow tampered before write
      const realWorkspace = realpathSync(workspaceDir);
      const realCogniDir = realpathSync(cogniDir);
      if (!realCogniDir.startsWith(realWorkspace)) {
        throw new Error(
          `Symlink escape detected: ${realCogniDir} outside ${realWorkspace}`
        );
      }

      // Write messages for agent to read (per P0.75 I/O protocol)
      const messagesPath = join(realCogniDir, "messages.json");
      writeFileSync(messagesPath, JSON.stringify(messages, null, 2));

      self.log.debug(
        { runId, workspaceDir: realWorkspace },
        "Workspace prepared"
      );

      try {
        // Run agent in sandbox with LLM proxy enabled
        const result = await self.runner.runOnce({
          runId,
          workspacePath: realWorkspace,
          argv: [...agent.argv],
          limits: {
            maxRuntimeSec: 120,
            maxMemoryMb: 512,
          },
          llmProxy: {
            enabled: true,
            attempt,
            billingAccountId: caller.billingAccountId,
            env: { COGNI_MODEL: model },
          },
        });

        // Parse SandboxProgramContract envelope from stdout.
        // Same shape for run.mjs and OpenClaw --json — provider logic is agent-agnostic.
        const envelope = self.parseEnvelope(runId, result);

        if (!result.ok || envelope.meta.error) {
          const errInfo = envelope.meta.error;
          self.log.error(
            {
              runId,
              exitCode: result.exitCode,
              errorCode: result.errorCode ?? errInfo?.code,
              errorMessage: errInfo?.message,
              stderr: result.stderr.slice(0, 500),
            },
            "Sandbox agent failed"
          );
          yield { type: "error", error: "internal" as AiExecutionErrorCode };
          yield { type: "done" };
          if (state.resolve) {
            state.resolve({
              ok: false,
              runId,
              requestId: ingressRequestId,
              error: "internal",
            });
          }
          return;
        }

        const content = envelope.payloads[0]?.text ?? "";
        const litellmCallId = envelope.meta?.litellmCallId;

        // Emit response as text_delta
        if (content) {
          yield { type: "text_delta", delta: content };
        }

        // Emit usage_report for billing (ONLY if litellmCallId present)
        // P0.75: usageUnitId is REQUIRED for billing-authoritative sandbox executor.
        // Missing call-id = billing incomplete = fail run.
        if (!litellmCallId) {
          self.log.error(
            { runId, model },
            "CRITICAL: Sandbox agent did not emit litellmCallId - billing incomplete, failing run"
          );
          // Throw to fail run (prevents silent under-billing)
          throw new Error(
            "Billing failed: sandbox agent missing litellmCallId (x-litellm-call-id header)"
          );
        }

        const usageFact: UsageFact = {
          runId,
          attempt,
          source: "litellm",
          executorType: "sandbox",
          billingAccountId: caller.billingAccountId,
          virtualKeyId: caller.virtualKeyId,
          graphId,
          model,
          usageUnitId: litellmCallId, // Required, no fallback
        };
        yield { type: "usage_report", fact: usageFact };

        // Emit assistant_final for history persistence
        yield { type: "assistant_final", content: content || "" };
        yield { type: "done" };

        if (state.resolve) {
          state.resolve({
            ok: true,
            runId,
            requestId: ingressRequestId,
            finishReason: "stop",
            ...(content ? { content } : {}),
          });
        }
      } catch (err) {
        self.log.error({ runId, error: err }, "Sandbox execution threw");
        yield { type: "error", error: "internal" as AiExecutionErrorCode };
        yield { type: "done" };
        if (state.resolve) {
          state.resolve({
            ok: false,
            runId,
            requestId: ingressRequestId,
            error: "internal",
          });
        }
      } finally {
        // Cleanup workspace (proxy audit log already collected by runner)
        try {
          rmSync(realWorkspace, { recursive: true, force: true });
        } catch {
          // Best-effort cleanup
        }
      }
    })();

    return { stream, final };
  }

  /**
   * Parse SandboxProgramContract JSON from stdout.
   * Tolerant: if stdout isn't valid JSON, returns an error envelope
   * so the caller handles it uniformly.
   */
  private parseEnvelope(
    runId: string,
    result: SandboxRunResult
  ): SandboxProgramContract {
    const raw = result.stdout.trim();
    try {
      return JSON.parse(raw) as SandboxProgramContract;
    } catch {
      this.log.warn(
        { runId, stdoutLen: raw.length, stdoutHead: raw.slice(0, 200) },
        "Sandbox stdout is not valid SandboxProgramContract JSON"
      );
      return {
        payloads: [],
        meta: {
          durationMs: 0,
          error: { code: "parse_error", message: "stdout is not valid JSON" },
        },
      };
    }
  }

  /**
   * Create error result for invalid requests (same pattern as LangGraphInProcProvider).
   */
  private createErrorResult(
    runId: string,
    requestId: string,
    code: AiExecutionErrorCode = "internal"
  ): GraphRunResult {
    const errorStream = (async function* () {
      yield { type: "error" as const, error: code };
      yield { type: "done" as const };
    })();

    return {
      stream: errorStream,
      final: Promise.resolve({
        ok: false as const,
        runId,
        requestId,
        error: code,
      }),
    };
  }
}
