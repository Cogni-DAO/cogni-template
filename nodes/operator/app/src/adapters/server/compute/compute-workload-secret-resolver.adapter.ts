// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

import { ComputeLifecycleError } from "@/ports/compute-workload-lifecycle.port";
import type { ComputeWorkloadSecretResolverPort } from "@/ports/compute-workload-secret-resolver.port";
import type { OperatorSecretsPlanePort } from "@/ports/operator-secrets-plane.port";

/** Explicit v0 exposure policy. Unknown and custody/fleet keys fail closed. */
export const EXTERNAL_WORKLOAD_SECRET_KEYS = new Set([
  "AUTH_SECRET",
  "DATABASE_URL",
  "DATABASE_SERVICE_URL",
  "DOLTGRES_URL",
  "CONNECTIONS_ENCRYPTION_KEY",
  "SCHEDULER_API_TOKEN",
  "BILLING_INGEST_TOKEN",
  "INTERNAL_OPS_TOKEN",
  "METRICS_TOKEN",
  "LANGFUSE_PUBLIC_KEY",
  "LANGFUSE_SECRET_KEY",
  "LANGFUSE_BASE_URL",
  "GH_OAUTH_CLIENT_ID",
  "GH_OAUTH_CLIENT_SECRET",
  "DISCORD_OAUTH_CLIENT_ID",
  "DISCORD_OAUTH_CLIENT_SECRET",
  "GOOGLE_OAUTH_CLIENT_ID",
  "GOOGLE_OAUTH_CLIENT_SECRET",
  "POSTHOG_API_KEY",
  "POSTHOG_HOST",
  "TAVILY_API_KEY",
  "EVM_RPC_URL",
  "LITELLM_VIRTUAL_KEY",
]);

export const NEVER_EXTERNAL_WORKLOAD_SECRET_KEYS = new Set([
  "LITELLM_MASTER_KEY",
  "OPENROUTER_API_KEY",
  "GH_REVIEW_APP_ID",
  "GH_REVIEW_APP_PRIVATE_KEY_BASE64",
  "GH_WEBHOOK_SECRET",
  "IDENTITY_ATTESTATION_PRIVATE_KEY",
  "PRIVY_APP_ID",
  "PRIVY_APP_SECRET",
  "PRIVY_AUTH_PRIVATE_KEY",
  "DOLTHUB_OWNER",
  "DOLTHUB_CREDENTIALS",
  "DOLTHUB_TOKEN",
  "DISCORD_BOT_TOKEN",
  "APP_DB_PASSWORD",
  "APP_DB_SERVICE_PASSWORD",
  "DOLTGRES_PASSWORD",
]);

export const EXTERNAL_WORKLOAD_LLM_BUDGET_USD = 25;
export const EXTERNAL_WORKLOAD_LLM_BUDGET_DURATION = "30d";

interface VirtualKeyMinter {
  mint(input: {
    nodeId: string;
    serviceName: string;
    sourceSha: string;
  }): Promise<string>;
}

export class ComputeWorkloadSecretResolverAdapter
  implements ComputeWorkloadSecretResolverPort
{
  constructor(
    private readonly secrets: Pick<OperatorSecretsPlanePort, "readNodeSecrets">,
    private readonly virtualKeyMinter?: VirtualKeyMinter
  ) {}

  async resolve(input: {
    nodeId: string;
    nodeSlug: string;
    environment: string;
    serviceName: string;
    sourceSha: string;
    refs: readonly { key: string }[];
  }): Promise<Readonly<Record<string, string>>> {
    const keys = [...new Set(input.refs.map((ref) => ref.key))];
    if (
      keys.some(
        (key) =>
          NEVER_EXTERNAL_WORKLOAD_SECRET_KEYS.has(key) ||
          !EXTERNAL_WORKLOAD_SECRET_KEYS.has(key)
      )
    ) {
      throw new ComputeLifecycleError(
        "terminal",
        "SecretPolicyRejected",
        false
      );
    }
    const ordinary = keys.filter((key) => key !== "LITELLM_VIRTUAL_KEY");
    let stored: Readonly<Record<string, string>> | null = {};
    if (ordinary.length) {
      try {
        stored = await this.secrets.readNodeSecrets({
          nodeSlug: input.nodeSlug,
          env: input.environment,
        });
      } catch (error) {
        if (error instanceof ComputeLifecycleError) throw error;
        throw new ComputeLifecycleError(
          "transient",
          "SecretResolverUnavailable",
          true
        );
      }
    }
    const result: Record<string, string> = {};
    for (const key of ordinary) {
      const value = stored?.[key];
      if (!value) {
        throw new ComputeLifecycleError(
          "terminal",
          "SecretReferenceMissing",
          false
        );
      }
      result[key] = value;
    }
    if (keys.includes("LITELLM_VIRTUAL_KEY")) {
      if (!this.virtualKeyMinter) {
        throw new ComputeLifecycleError(
          "terminal",
          "SecretResolverUnavailable",
          false
        );
      }
      result.LITELLM_MASTER_KEY = await this.virtualKeyMinter.mint({
        nodeId: input.nodeId,
        serviceName: input.serviceName,
        sourceSha: input.sourceSha,
      });
    }
    return result;
  }
}

/** Budget-capped runtime credential; the operator master key never leaves this adapter. */
export class LiteLlmVirtualKeyMinter implements VirtualKeyMinter {
  constructor(
    private readonly baseUrl: string,
    private readonly masterKey: string,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  async mint(input: {
    nodeId: string;
    serviceName: string;
    sourceSha: string;
  }): Promise<string> {
    let response: Response;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5_000);
    try {
      response = await this.fetchImpl(
        `${this.baseUrl.replace(/\/+$/, "")}/key/generate`,
        {
          method: "POST",
          signal: controller.signal,
          headers: {
            authorization: `Bearer ${this.masterKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            key_alias: `external-${input.nodeId}-${input.serviceName}`,
            max_budget: EXTERNAL_WORKLOAD_LLM_BUDGET_USD,
            budget_duration: EXTERNAL_WORKLOAD_LLM_BUDGET_DURATION,
            metadata: {
              node_id: input.nodeId,
              service: input.serviceName,
              source_sha: input.sourceSha,
            },
          }),
        }
      );
    } catch {
      throw new ComputeLifecycleError(
        "transient",
        "SecretResolverUnavailable",
        true
      );
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) {
      throw new ComputeLifecycleError(
        "transient",
        "SecretResolverUnavailable",
        true
      );
    }
    const body = (await response.json()) as { key?: unknown };
    if (typeof body.key !== "string" || !body.key) {
      throw new ComputeLifecycleError(
        "terminal",
        "SecretResolverUnavailable",
        false
      );
    }
    return body.key;
  }
}
