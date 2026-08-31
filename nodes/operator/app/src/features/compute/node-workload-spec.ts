// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

/**
 * Module: `@features/compute/node-workload-spec`
 * Purpose: Build the provider-agnostic ProvisionSpec for running ONE node-app container as a
 *   self-contained decentralized-compute workload: the node image + a colocated Postgres, wired
 *   together by service name (task.5044 v1 — no VPN back into the shared cluster).
 * Scope: Pure spec construction. Does NOT render provider manifests (adapter's job), reach the
 *   catalog, or persist anything.
 * Invariants:
 *   - SELF_CONTAINED_V1: the workload carries its own Postgres; shared-infra connectivity is via
 *     public endpoints only (the node dials out; nothing dials in).
 *   - THROWAWAY_CREDS: DB password + AUTH_SECRET are generated per-provision and shared only
 *     inside the workload — they guard a fresh empty DB, not shared-infra state.
 * Side-effects: none (pure; caller supplies generated secrets)
 * Links: ProvisionSpec (@cogni/ai-tools), AkashComputeAdapter (adapters/server/compute)
 * @internal
 */

import type { ProvisionSpec } from "@cogni/ai-tools";

export interface NodeWorkloadInput {
  /** Node slug — becomes the workload label + app service name. */
  readonly slug: string;
  /** Fully-qualified node-app image ref (public registry). */
  readonly image: string;
  /** Container port the node app listens on (catalog `port`, typically 3000). */
  readonly port: number;
  /** Generated per-workload Postgres password (THROWAWAY_CREDS). */
  readonly dbPassword: string;
  /** Generated per-workload NextAuth secret (THROWAWAY_CREDS). */
  readonly authSecret: string;
  /** Custom hostnames the provider ingress should accept, when any. */
  readonly hosts?: readonly string[];
}

const DB_SERVICE = "db";
const POSTGRES_IMAGE = "postgres:16-alpine";

/** Build the two-service (node-app + postgres) workload spec for one node. */
export function buildNodeWorkloadSpec(input: NodeWorkloadInput): ProvisionSpec {
  const dbUrl = `postgresql://cogni:${input.dbPassword}@${DB_SERVICE}:5432/cogni`;
  return {
    name: input.slug,
    services: [
      {
        name: "app",
        image: input.image,
        env: {
          PORT: String(input.port),
          HOSTNAME: "0.0.0.0",
          NODE_ENV: "production",
          APP_ENV: "production",
          DATABASE_URL: dbUrl,
          AUTH_SECRET: input.authSecret,
        },
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
        name: DB_SERVICE,
        image: POSTGRES_IMAGE,
        env: {
          POSTGRES_USER: "cogni",
          POSTGRES_PASSWORD: input.dbPassword,
          POSTGRES_DB: "cogni",
        },
        cpuUnits: 0.25,
        memoryMi: 512,
        storageMi: 1024,
        expose: [{ port: 5432, as: 5432, global: false }],
      },
    ],
  };
}
