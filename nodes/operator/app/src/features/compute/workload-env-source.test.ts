// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

import { describe, expect, it } from "vitest";
import {
  buildLogPush,
  composeWorkloadEnv,
  DENIED_FLEET_KEYS,
  deriveSubstrateHost,
  FORWARDED_NODE_SECRET_KEYS,
} from "./workload-env-source";

const HOST = "203.0.113.7";

/** Minimal bucket that satisfies REQUIRED_NODE_SECRET_KEYS. */
function baseBucket(): Record<string, string> {
  return {
    AUTH_SECRET: "node-auth-secret",
    DATABASE_URL: `postgresql://app_toks4:pw@${HOST}:5432/cogni_toks4?sslmode=disable`,
    DATABASE_SERVICE_URL: `postgresql://service_toks4:pw2@${HOST}:5432/cogni_toks4?sslmode=disable`,
    DOLTGRES_URL: `postgresql://postgres:pw3@${HOST}:5435/knowledge_toks4?sslmode=disable`,
  };
}

describe("composeWorkloadEnv", () => {
  it("composes a bootable env from bucket + virtual key alone (ZERO_CALLER_SECRETS)", () => {
    const result = composeWorkloadEnv({
      deployEnv: "candidate-a",
      nodeSecrets: baseBucket(),
      mintedLlmKey: "sk-virtual",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const env = result.env;
    // Substrate config derived from the DSN host (HOST_FROM_NODE_DSN)
    expect(env.APP_ENV).toBe("production");
    expect(env.DEPLOY_ENVIRONMENT).toBe("candidate-a");
    expect(env.TEMPORAL_ADDRESS).toBe(`${HOST}:7233`);
    expect(env.TEMPORAL_NAMESPACE).toBe("cogni-candidate-a");
    expect(env.TEMPORAL_TASK_QUEUE).toBe("scheduler-tasks");
    expect(env.REDIS_URL).toBe(`redis://${HOST}:6379`);
    expect(env.LITELLM_BASE_URL).toBe(`http://${HOST}:4000`);
    // Bucket creds forwarded
    expect(env.AUTH_SECRET).toBe("node-auth-secret");
    expect(env.DATABASE_URL).toContain(HOST);
    expect(env.DOLTGRES_URL).toContain(":5435");
    // Virtual key under the env name node apps read
    expect(env.LITELLM_MASTER_KEY).toBe("sk-virtual");
  });

  it("derives the host from a DNS-named DSN too", () => {
    const bucket = baseBucket();
    bucket.DATABASE_URL =
      "postgresql://app_x:pw@cogni-preview.vm.cognidao.org:5432/cogni_x?sslmode=disable";
    const result = composeWorkloadEnv({
      deployEnv: "preview",
      nodeSecrets: bucket,
      mintedLlmKey: "sk-v",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.env.TEMPORAL_ADDRESS).toBe(
      "cogni-preview.vm.cognidao.org:7233"
    );
  });

  it("NEVER forwards fleet-power keys present in the bucket (SCOPED_CREDS_ONLY)", () => {
    const bucket = baseBucket();
    for (const key of DENIED_FLEET_KEYS) {
      bucket[key] = `leaked-${key}`;
    }
    const result = composeWorkloadEnv({
      deployEnv: "candidate-a",
      nodeSecrets: bucket,
      mintedLlmKey: "sk-virtual",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const key of DENIED_FLEET_KEYS) {
      expect(result.env[key], key).not.toBe(`leaked-${key}`);
    }
    // The master slot holds the virtual key, not the bucket's master.
    expect(result.env.LITELLM_MASTER_KEY).toBe("sk-virtual");
    expect(JSON.stringify(result.env)).not.toContain("leaked-");
  });

  it("drops unknown bucket keys (allowlist, not denylist)", () => {
    const bucket = { ...baseBucket(), SOME_RANDOM_KEY: "x" };
    const result = composeWorkloadEnv({
      deployEnv: "candidate-a",
      nodeSecrets: bucket,
      mintedLlmKey: "sk-v",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.env.SOME_RANDOM_KEY).toBeUndefined();
  });

  it("forwards allowlisted integration creds when present", () => {
    const bucket = {
      ...baseBucket(),
      LANGFUSE_SECRET_KEY: "lf-sk",
      GH_OAUTH_CLIENT_SECRET: "gh-oauth",
      SCHEDULER_API_TOKEN: "sched-tok",
    };
    const result = composeWorkloadEnv({
      deployEnv: "candidate-a",
      nodeSecrets: bucket,
      mintedLlmKey: "sk-v",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.env.LANGFUSE_SECRET_KEY).toBe("lf-sk");
    expect(result.env.GH_OAUTH_CLIENT_SECRET).toBe("gh-oauth");
    expect(result.env.SCHEDULER_API_TOKEN).toBe("sched-tok");
  });

  it("reports missing required keys by NAME (no values)", () => {
    const bucket = baseBucket();
    delete (bucket as Record<string, string | undefined>).AUTH_SECRET;
    delete (bucket as Record<string, string | undefined>).DOLTGRES_URL;
    const result = composeWorkloadEnv({
      deployEnv: "candidate-a",
      nodeSecrets: bucket,
      mintedLlmKey: "sk-v",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.missing).toEqual(
      expect.arrayContaining(["AUTH_SECRET", "DOLTGRES_URL"])
    );
  });

  it("treats an unparsable DATABASE_URL as missing", () => {
    const bucket = { ...baseBucket(), DATABASE_URL: "not a url" };
    const result = composeWorkloadEnv({
      deployEnv: "candidate-a",
      nodeSecrets: bucket,
      mintedLlmKey: "sk-v",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.missing).toContain("DATABASE_URL");
  });

  it("allow/deny sets are disjoint (policy drift guard)", () => {
    const denied = new Set(DENIED_FLEET_KEYS);
    for (const key of FORWARDED_NODE_SECRET_KEYS) {
      expect(denied.has(key), key).toBe(false);
    }
  });
});

describe("deriveSubstrateHost", () => {
  it("parses IP and DNS hosts", () => {
    expect(deriveSubstrateHost("postgresql://u:p@10.0.0.5:5432/db")).toBe(
      "10.0.0.5"
    );
    expect(
      deriveSubstrateHost("postgresql://u:p@vm.example.org:5432/db?x=1")
    ).toBe("vm.example.org");
  });
  it("returns null on garbage", () => {
    expect(deriveSubstrateHost("nope")).toBeNull();
  });
});

describe("buildLogPush", () => {
  const CREDS = {
    GRAFANA_CLOUD_LOKI_URL: "https://logs.example.net/loki/api/v1/push",
    GRAFANA_CLOUD_LOKI_USER: "123456",
    GRAFANA_CLOUD_LOKI_API_KEY: "glc_write-only",
  };

  it("builds push creds from the node-template bucket", () => {
    expect(buildLogPush(CREDS, "candidate-a")).toEqual({
      url: "https://logs.example.net/loki/api/v1/push",
      username: "123456",
      password: "glc_write-only",
      env: "candidate-a",
    });
  });

  it("returns null when any cred is absent or the bucket is missing", () => {
    expect(buildLogPush(null, "candidate-a")).toBeNull();
    const partial = { ...CREDS } as Record<string, string>;
    delete partial.GRAFANA_CLOUD_LOKI_API_KEY;
    expect(buildLogPush(partial, "candidate-a")).toBeNull();
  });
});
