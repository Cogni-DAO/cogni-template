// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

import { spawnSync } from "node:child_process";

// biome-ignore lint/style/noProcessEnv: one-shot artifact smoke preserves only executable lookup
const path = process.env.PATH ?? "";
const result = spawnSync(
  process.execPath,
  ["dist-controller/compute-workload-controller.mjs"],
  {
    encoding: "utf8",
    env: {
      PATH: path,
      NODE_ENV: "production",
    },
  }
);
const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
if (
  result.status === 0 ||
  !output.includes(
    "POD_NAMESPACE, CONTROLLER_ENVIRONMENT, and DEPLOYMENT_DOMAIN are required"
  ) ||
  output.includes("Dynamic require")
) {
  process.stderr.write(output);
  throw new Error(
    "packaged controller did not reach its expected missing-environment guard"
  );
}
process.stdout.write("compute controller packaged entry loaded successfully\n");
