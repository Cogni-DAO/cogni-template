import { execSync } from "node:child_process";

import { PostgreSqlContainer } from "@testcontainers/postgresql";

export default async () => {
  const c = await new PostgreSqlContainer("postgres:15-alpine").start();
  process.env.DATABASE_URL = c.getConnectionUri();
  process.env.APP_ENV = "test";
  execSync("pnpm db:migrate", { stdio: "inherit" });
  return async () => {
    await c.stop();
  };
};
