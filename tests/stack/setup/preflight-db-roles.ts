// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/stack/setup/preflight-db-roles`
 * Purpose: Vitest globalSetup that asserts required PostgreSQL roles exist before stack tests run.
 * Scope: Fails fast with actionable instructions. Read-only — does not create roles.
 * Invariants:
 *   - Service role name follows provision.sh convention: `${POSTGRES_USER}_service`
 *   - Must run after Docker Postgres is healthy, before reset-db
 * Side-effects: IO (single read-only query to Postgres)
 * Links: platform/infra/services/runtime/postgres-init/provision.sh, docs/DATABASE_RLS_SPEC.md
 * @internal
 */

// TODO(rls): Uncomment when RLS branch lands and scheduler-worker uses the service role.
// import postgres from "postgres";
// import { buildDatabaseUrl } from "@/shared/db/db-url";

// biome-ignore lint/style/noDefaultExport: Vitest globalSetup requires default export
export default async function preflightDbRoles() {
  console.log("\n🔍 Preflight: checking required database roles...");

  // TODO(rls): Uncomment when scheduler-worker DATABASE_URL switches to ${POSTGRES_USER}_service.
  // The service role is created by provision.sh (db-provision container).
  // Without it, the scheduler-worker cannot authenticate and Temporal activities fail silently.
  //
  // const dbEnv: Record<string, string | number | undefined> = {
  //   POSTGRES_USER: process.env.POSTGRES_USER,
  //   POSTGRES_PASSWORD: process.env.POSTGRES_PASSWORD,
  //   POSTGRES_DB: process.env.POSTGRES_DB,
  //   DB_HOST: process.env.DB_HOST,
  //   DB_PORT: process.env.DB_PORT,
  // };
  //
  // const filteredEnv = Object.fromEntries(
  //   Object.entries(dbEnv).filter(([, value]) => value !== undefined)
  // );
  //
  // const databaseUrl = process.env.DATABASE_URL ?? buildDatabaseUrl(filteredEnv);
  //
  // const sql = postgres(databaseUrl, {
  //   max: 1,
  //   connection: { application_name: "vitest_preflight_db_roles" },
  // });
  //
  // const pgUser = process.env.POSTGRES_USER ?? "user";
  // const serviceRole = `${pgUser}_service`;
  //
  // try {
  //   const rows = await sql<{ rolname: string }[]>`
  //     SELECT rolname FROM pg_roles WHERE rolname = ${serviceRole}
  //   `;
  //
  //   if (rows.length === 0) {
  //     throw new Error(
  //       [
  //         `❌ Required PostgreSQL role "${serviceRole}" does not exist.`,
  //         "",
  //         "This role is created by provision.sh (db-provision container).",
  //         "Run:",
  //         "",
  //         "  pnpm db:setup:test",
  //       ].join("\n")
  //     );
  //   }
  //
  //   console.log(`✅ Role "${serviceRole}" exists\n`);
  // } finally {
  //   await sql.end();
  // }

  console.log("✅ DB role checks skipped (no service role required yet)\n");
}
