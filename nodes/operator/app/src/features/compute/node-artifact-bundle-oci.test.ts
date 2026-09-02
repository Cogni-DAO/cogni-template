// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

import { describe, expect, it } from "vitest";

import {
  buildNodeBundleTagRef,
  NODE_BUNDLE_ARTIFACT_TYPE,
  NODE_BUNDLE_PAYLOAD_FILE,
  NODE_BUNDLE_PAYLOAD_MEDIA_TYPE,
  verifyNodeBundleManifest,
} from "./node-artifact-bundle-oci";

const digest = `sha256:${"a".repeat(64)}`;
const manifest = {
  artifactType: NODE_BUNDLE_ARTIFACT_TYPE,
  layers: [
    {
      mediaType: NODE_BUNDLE_PAYLOAD_MEDIA_TYPE,
      annotations: {
        "org.opencontainers.image.title": NODE_BUNDLE_PAYLOAD_FILE,
      },
    },
  ],
};

describe("node artifact bundle OCI contract", () => {
  it("derives the deterministic source-SHA tag", () => {
    expect(
      buildNodeBundleTagRef({
        repository: "ghcr.io/cogni-dao/toks4",
        sourceSha: "1".repeat(40),
      })
    ).toBe(`ghcr.io/cogni-dao/toks4:bundle-sha-${"1".repeat(40)}`);
  });

  it("accepts exactly one named bundle payload and returns an immutable ref", () => {
    expect(
      verifyNodeBundleManifest({
        repository: "ghcr.io/cogni-dao/toks4",
        digest,
        manifest,
      })
    ).toEqual({ digestRef: `ghcr.io/cogni-dao/toks4@${digest}` });
  });

  it("rejects a manifest with an extra or incorrectly typed payload", () => {
    expect(() =>
      verifyNodeBundleManifest({
        repository: "ghcr.io/cogni-dao/toks4",
        digest,
        manifest: {
          ...manifest,
          layers: [
            ...manifest.layers,
            { ...manifest.layers[0], mediaType: "application/json" },
          ],
        },
      })
    ).toThrow();
  });
});
