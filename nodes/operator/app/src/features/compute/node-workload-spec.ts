// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

/**
 * Module: `@features/compute/node-workload-spec`
 * Purpose: Build the provider-agnostic ProvisionSpec for running ONE node-app as a
 *   self-contained decentralized-compute workload (task.5044 v000): node image + colocated
 *   postgres/redis/doltgres, one-shot provision+migrate runner, and an optional stdout→Loki
 *   log pump so shared-infra observability works where nothing scrapes container stdout.
 * Scope: Pure spec construction. Does NOT render provider manifests (adapter's job), reach
 *   the catalog, or persist anything. Caller supplies all generated secrets.
 * Invariants:
 *   - SELF_CONTAINED_V000: the workload carries its own postgres/redis/doltgres; shared-infra
 *     connectivity is outbound-only (public endpoints + Loki push). No VPN into the cluster.
 *   - THROWAWAY_CREDS: DB passwords + AUTH_SECRET etc. are generated per-provision and shared
 *     only inside the workload — they guard fresh empty stores, never shared-infra state.
 *   - BOOT_CONTRACT: env mirrors the node-app kernel's hard requirements (server-env.ts):
 *     two distinct non-superuser DB users, sslmode on non-localhost DSNs, non-empty
 *     TEMPORAL_* strings, COGNI_REPO_PATH baked in the image.
 *   - LOG_PUMP_IS_V000_EXCEPTION: piping app stdout through an inline Loki pusher is the
 *     zero-image-change stopgap; the proper env-gated transport in node-template is v0 scope.
 *     Labels mirror Alloy exactly ({env, service:"app", node:<nodeId>}) so the operator
 *     observability proxy reads Akash lines unmodified.
 * Side-effects: none (pure)
 * Links: ProvisionSpec (@cogni/ai-tools), AkashComputeAdapter (adapters/server/compute),
 *   infra/compose/runtime/docker-compose.yml (sidecar pins + migrate model),
 *   docs/guides/agent-api-validation.md (the flow this workload must serve)
 * @internal
 */

import type { ProvisionSpec } from "@cogni/ai-tools";

const POSTGRES_IMAGE = "postgres:15";
const REDIS_IMAGE = "redis:7-alpine";
const DOLTGRES_IMAGE = "dolthub/doltgresql:0.57.3";
const TEMPORAL_IMAGE = "temporalio/auto-setup:1.29.1";

export interface NodeWorkloadSecrets {
  /** Password for the app DB role (`app_<node>`). */
  readonly appDbPassword: string;
  /** Password for the service DB role (`service_<node>`). */
  readonly serviceDbPassword: string;
  /** NextAuth/machine-key HMAC secret (≥32 chars). */
  readonly authSecret: string;
  /** scheduler-worker → internal graph API token (≥32 chars; unused but boot-required). */
  readonly schedulerApiToken: string;
  /** Billing ingest token (≥32 chars; boot-required). */
  readonly billingIngestToken: string;
}

export interface NodeWorkloadLogPush {
  /** Loki push endpoint (e.g. https://logs-prod-021.grafana.net/loki/api/v1/push). */
  readonly url: string;
  readonly username: string;
  readonly password: string;
  /** Value for the `env` stream label (must match the operator env that reads it). */
  readonly env: string;
}

export interface NodeWorkloadInput {
  /** Node slug (DB names: `cogni_<slug>` / roles `app_<slug>`, `-`→`_`). */
  readonly slug: string;
  /** Node UUID — the Loki `node` stream label the observability proxy forces. */
  readonly nodeId: string;
  /** Fully-qualified node-app image ref (public registry; repo-spec + PORT baked in). */
  readonly image: string;
  /** Container port the node app listens on (baked into the fork's image). */
  readonly port: number;
  /** Public base URL the app should consider canonical (NEXTAUTH_URL/APP_BASE_URL). */
  readonly publicUrl: string;
  /** Custom hostnames the provider ingress should accept (CNAME targets). */
  readonly hosts?: readonly string[];
  readonly secrets: NodeWorkloadSecrets;
  /** LLM routing (OpenAI-compatible upstream + key). Omit → completions unavailable. */
  readonly llm?: { readonly baseUrl: string; readonly masterKey: string };
  /** Enable the stdout→Loki pump (v000 exception; see LOG_PUMP_IS_V000_EXCEPTION). */
  readonly logPush?: NodeWorkloadLogPush;
}

/** Inline stdin→Loki batch pusher, run as `node -e` behind the app's stdout pipe. */
function lokiPumpJs(): string {
  // Kept dependency-free (node builtins only) — it runs inside the node-app image.
  return [
    "const https=require('https');const {URL}=require('url');",
    "const u=new URL(process.env.LOKI_PUSH_URL);",
    "const auth='Basic '+Buffer.from(process.env.LOKI_PUSH_USER+':'+process.env.LOKI_PUSH_PASSWORD).toString('base64');",
    "const labels={env:process.env.LOKI_PUSH_ENV,service:'app',node:process.env.LOKI_PUSH_NODE,source:'akash'};",
    "let buf=[];",
    "function flush(){if(!buf.length)return;const body=JSON.stringify({streams:[{stream:labels,values:buf}]});buf=[];",
    "const req=https.request({host:u.hostname,path:u.pathname,method:'POST',headers:{'content-type':'application/json',authorization:auth}},r=>r.resume());",
    "req.on('error',()=>{});req.end(body);}",
    "setInterval(flush,2000);",
    "let acc='';process.stdin.on('data',d=>{acc+=d;const lines=acc.split('\\n');acc=lines.pop()||'';",
    "for(const l of lines){if(!l)continue;console.log(l);buf.push([String(Date.now())+'000000',l]);if(buf.length>500)flush();}});",
    "process.stdin.on('end',()=>{flush();setTimeout(()=>process.exit(0),3000);});",
  ].join("");
}

/** One-shot provision+migrate shell for the `init` service (psql-capable postgres image). */
function initShell(slug: string, s: NodeWorkloadSecrets): string {
  const db = `cogni_${slug.replace(/-/g, "_")}`;
  const appRole = `app_${slug.replace(/-/g, "_")}`;
  const svcRole = `service_${slug.replace(/-/g, "_")}`;
  const kdb = `knowledge_${slug.replace(/-/g, "_")}`;
  return [
    `export PGPASSWORD="$POSTGRES_BOOT_PASSWORD"`,
    // wait for postgres
    `until psql -h db -U postgres -c 'select 1' >/dev/null 2>&1; do echo waiting-for-postgres; sleep 2; done`,
    // roles + db (idempotent)
    `psql -h db -U postgres -tc "SELECT 1 FROM pg_roles WHERE rolname='${appRole}'" | grep -q 1 || psql -h db -U postgres -c "CREATE ROLE ${appRole} LOGIN PASSWORD '${s.appDbPassword}'"`,
    `psql -h db -U postgres -tc "SELECT 1 FROM pg_roles WHERE rolname='${svcRole}'" | grep -q 1 || psql -h db -U postgres -c "CREATE ROLE ${svcRole} LOGIN PASSWORD '${s.serviceDbPassword}'"`,
    `psql -h db -U postgres -tc "SELECT 1 FROM pg_database WHERE datname='${db}'" | grep -q 1 || psql -h db -U postgres -c "CREATE DATABASE ${db} OWNER ${appRole}"`,
    `psql -h db -U postgres -d ${db} -c "GRANT ALL ON SCHEMA public TO ${appRole}, ${svcRole}"`,
    // doltgres db (postgres superuser is doltgres' only login in 0.57.x; default password)
    `until PGPASSWORD=password psql -h doltgres -p 5432 -U postgres -c 'select 1' >/dev/null 2>&1; do echo waiting-for-doltgres; sleep 2; done`,
    `PGPASSWORD=password psql -h doltgres -p 5432 -U postgres -tc "SELECT 1 FROM pg_database WHERE datname='${kdb}'" | grep -q 1 || PGPASSWORD=password psql -h doltgres -p 5432 -U postgres -c "CREATE DATABASE ${kdb}"`,
    `echo init-done`,
    // 68 years; busybox sh (alpine images) has no GNU "sleep infinity"
    `sleep 2147483647`,
  ].join(" && ");
}

/** Migrate shell run inside the node-app image (node-at-root paths). */
function migrateShell(): string {
  return [
    `until node -e "require('net').connect(5432,'db').on('connect',()=>process.exit(0)).on('error',()=>process.exit(1))"; do sleep 2; done`,
    `node /app/app/migrate.mjs /app/app/migrations`,
    `DATABASE_URL="$DOLTGRES_MIGRATE_URL" node /app/app/migrate-doltgres.mjs /app/app/doltgres-migrations`,
    `echo migrate-done`,
    `sleep 2147483647`,
  ].join(" && ");
}

/** Build the full self-contained workload spec for one node. */
export function buildNodeWorkloadSpec(input: NodeWorkloadInput): ProvisionSpec {
  const slugDb = input.slug.replace(/-/g, "_");
  const s = input.secrets;
  const databaseUrl = `postgresql://app_${slugDb}:${s.appDbPassword}@db:5432/cogni_${slugDb}?sslmode=disable`;
  const serviceUrl = `postgresql://service_${slugDb}:${s.serviceDbPassword}@db:5432/cogni_${slugDb}?sslmode=disable`;
  const doltgresUrl = `postgresql://postgres:password@doltgres:5432/knowledge_${slugDb}?sslmode=disable`;

  const appEnv: Record<string, string> = {
    APP_ENV: "production",
    NODE_ENV: "production",
    // repo-spec.yaml ships in the image at /app (node-at-root); the container can't
    // construct without it (getNodeId at bootstrap).
    COGNI_REPO_PATH: "/app",
    DEPLOY_ENVIRONMENT: input.logPush?.env ?? "akash",
    NODE_NAME: input.slug,
    DATABASE_URL: databaseUrl,
    DATABASE_SERVICE_URL: serviceUrl,
    DOLTGRES_URL: doltgresUrl,
    REDIS_URL: "redis://redis:6379",
    AUTH_SECRET: s.authSecret,
    AUTH_TRUST_HOST: "true",
    NEXTAUTH_URL: input.publicUrl,
    APP_BASE_URL: input.publicUrl,
    SCHEDULER_API_TOKEN: s.schedulerApiToken,
    BILLING_INGEST_TOKEN: s.billingIngestToken,
    // Colocated auto-setup Temporal (node forks' /readyz treats connectivity as fatal).
    TEMPORAL_ADDRESS: "temporal:7233",
    TEMPORAL_NAMESPACE: "default",
    // Public RPC satisfies payments config checks when the node's repo-spec activates rails.
    EVM_RPC_URL: "https://mainnet.base.org",
    LITELLM_BASE_URL: input.llm?.baseUrl ?? "http://litellm-unconfigured:4000",
    LITELLM_MASTER_KEY: input.llm?.masterKey ?? "unconfigured",
  };

  // The pump source travels base64 in env and is materialized to a file at start —
  // zero shell-quoting/escaping of code (js/incomplete-sanitization safe by construction).
  const appCommand = input.logPush
    ? [
        "/bin/sh",
        "-c",
        'printf %s "$LOKI_PUMP_B64" | base64 -d > /tmp/loki-pump.js && node /app/app/server.js 2>&1 | node /tmp/loki-pump.js',
      ]
    : undefined;
  if (input.logPush) {
    appEnv.LOKI_PUMP_B64 = Buffer.from(lokiPumpJs(), "utf8").toString("base64");
    appEnv.LOKI_PUSH_URL = input.logPush.url;
    appEnv.LOKI_PUSH_USER = input.logPush.username;
    appEnv.LOKI_PUSH_PASSWORD = input.logPush.password;
    appEnv.LOKI_PUSH_ENV = input.logPush.env;
    appEnv.LOKI_PUSH_NODE = input.nodeId;
  }

  return {
    name: input.slug,
    services: [
      {
        name: "app",
        image: input.image,
        env: appEnv,
        ...(appCommand ? { command: appCommand } : {}),
        cpuUnits: 0.5,
        memoryMi: 1024,
        storageMi: 2048,
        expose: [
          {
            port: input.port,
            as: 80,
            global: true,
            ...(input.hosts && input.hosts.length > 0
              ? { hosts: input.hosts }
              : {}),
          },
        ],
      },
      {
        name: "db",
        image: POSTGRES_IMAGE,
        env: {
          POSTGRES_USER: "postgres",
          POSTGRES_PASSWORD: s.appDbPassword,
          POSTGRES_DB: "postgres",
        },
        cpuUnits: 0.25,
        memoryMi: 512,
        storageMi: 2048,
        expose: [{ port: 5432, as: 5432, global: false }],
      },
      {
        name: "redis",
        image: REDIS_IMAGE,
        command: [
          "redis-server",
          "--save",
          "",
          "--maxmemory",
          "128mb",
          "--maxmemory-policy",
          "noeviction",
        ],
        cpuUnits: 0.1,
        memoryMi: 256,
        storageMi: 512,
        expose: [{ port: 6379, as: 6379, global: false }],
      },
      {
        name: "doltgres",
        image: DOLTGRES_IMAGE,
        env: { DOLTGRES_PASSWORD: "password" },
        cpuUnits: 0.25,
        memoryMi: 512,
        storageMi: 2048,
        // Its own SDL service — port 5432 doesn't collide with db's service.
        expose: [{ port: 5432, as: 5432, global: false }],
      },
      {
        name: "temporal",
        image: TEMPORAL_IMAGE,
        env: {
          DB: "postgres12",
          POSTGRES_SEEDS: "db",
          DB_PORT: "5432",
          POSTGRES_USER: "postgres",
          POSTGRES_PWD: s.appDbPassword,
          DEFAULT_NAMESPACE: "default",
        },
        cpuUnits: 0.25,
        memoryMi: 512,
        storageMi: 512,
        expose: [{ port: 7233, as: 7233, global: false }],
      },
      {
        name: "init",
        image: POSTGRES_IMAGE,
        env: { POSTGRES_BOOT_PASSWORD: s.appDbPassword },
        command: ["/bin/sh", "-c", initShell(input.slug, s)],
        cpuUnits: 0.1,
        memoryMi: 256,
        storageMi: 512,
      },
      {
        name: "migrate",
        image: input.image,
        env: {
          DATABASE_URL: `postgresql://postgres:${s.appDbPassword}@db:5432/cogni_${slugDb}?sslmode=disable`,
          DOLTGRES_MIGRATE_URL: doltgresUrl,
          NODE_NAME: input.slug,
        },
        command: ["/bin/sh", "-c", migrateShell()],
        cpuUnits: 0.1,
        memoryMi: 512,
        storageMi: 512,
      },
    ],
  };
}
