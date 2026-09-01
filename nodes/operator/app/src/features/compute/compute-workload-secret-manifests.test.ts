// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

import { describe, expect, it } from "vitest";
import { parse, stringify } from "yaml";

import { buildComputeSecretResources } from "./compute-workload-secret-manifests";

describe("buildComputeSecretResources", () => {
  it("renders only the declared union with exact get-only RBAC", () => {
    const resources = buildComputeSecretResources({
      slug: "toks4",
      environment: "candidate-a",
      secretRefs: [
        { key: "DATABASE_URL" },
        { key: "LITELLM_VIRTUAL_KEY" },
        { key: "DATABASE_URL" },
      ],
    }).map(({ file, manifest }) => ({
      file,
      manifest: parse(stringify(manifest)) as Record<string, unknown>,
    }));

    expect(resources.map(({ file }) => file)).toEqual([
      "compute-env-external-secret.yaml",
      "compute-env-secret-role.yaml",
      "compute-env-secret-role-binding.yaml",
    ]);
    const [externalSecretResource, roleResource, bindingResource] = resources;
    if (!externalSecretResource || !roleResource || !bindingResource) {
      throw new Error("expected all compute secret resources");
    }
    const externalSecret = externalSecretResource.manifest as {
      spec: { data: unknown; [key: string]: unknown };
    };
    expect(externalSecret.spec.data).toEqual([
      {
        secretKey: "DATABASE_URL",
        remoteRef: {
          key: "candidate-a/toks4",
          property: "DATABASE_URL",
        },
      },
      {
        secretKey: "LITELLM_VIRTUAL_KEY",
        remoteRef: {
          key: "candidate-a/toks4",
          property: "LITELLM_VIRTUAL_KEY",
        },
      },
    ]);
    expect(externalSecret.spec).not.toHaveProperty("dataFrom");
    expect(stringify(externalSecret)).not.toContain("LITELLM_MASTER_KEY");

    const role = roleResource.manifest as { rules: unknown };
    expect(role.rules).toEqual([
      {
        apiGroups: [""],
        resources: ["secrets"],
        resourceNames: ["toks4-compute-env-secrets"],
        verbs: ["get"],
      },
    ]);
    const binding = bindingResource.manifest as { subjects: unknown };
    expect(binding.subjects).toEqual([
      {
        kind: "ServiceAccount",
        name: "operator-compute-workload-controller",
        namespace: "cogni-candidate-a",
      },
    ]);
  });

  it("emits no projection for a zero-ref workload", () => {
    expect(
      buildComputeSecretResources({
        slug: "echo",
        environment: "candidate-a",
        secretRefs: [],
      })
    ).toEqual([]);
  });

  it.each([
    "LITELLM_MASTER_KEY",
    "PRIVY_APP_SECRET",
    "UNREVIEWED_KEY",
  ])("rejects denied or unknown ref %s before render", (key) => {
    expect(() =>
      buildComputeSecretResources({
        slug: "toks4",
        environment: "candidate-a",
        secretRefs: [{ key }],
      })
    ).toThrow("secret refs rejected");
  });
});
