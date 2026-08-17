// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

import { describe, expect, it } from "vitest";
import { renderCatalog } from "@/shared/node-app-scaffold/gens/catalog";

describe("renderCatalog", () => {
  const ownerWallet = "0x070075F1389Ae1182aBac722B36CA12285d0c949";

  it("renders inline node catalog without submodule source metadata", () => {
    const out = renderCatalog("acme", 3200, 30400, { ownerWallet });
    expect(out).toContain("name: acme\n");
    expect(out).not.toContain("source_repo:");
    expect(out).not.toContain("image_repository:");
    expect(out).toContain("envs: [candidate-a]\n");
    expect(out).toContain("activity_env: candidate-a\n");
    expect(out).toContain(`owner_wallet: "${ownerWallet}"\n`);
  });

  it("renders submodule source metadata for child image resolution", () => {
    const out = renderCatalog("ay", 3200, 30400, {
      ownerWallet,
      sourceRepo: "https://github.com/cogni-test-org/ay.git",
    });

    expect(out).toContain(
      "source_repo: https://github.com/cogni-test-org/ay.git\n"
    );
    expect(out).toContain("image_repository: ghcr.io/cogni-test-org/ay\n");
  });

  it("derives child image repositories from the full source repo name", () => {
    const out = renderCatalog("ay", 3200, 30400, {
      ownerWallet,
      sourceRepo: "https://github.com/Cogni-Test-Org/ay.node.git",
    });

    expect(out).toContain("image_repository: ghcr.io/cogni-test-org/ay.node\n");
  });
});
