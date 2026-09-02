// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/ci-invariants/argocd-core-configmap-ownership`
 * Purpose: Forbids GitOps ownership of Argo CD's own `argocd-*` ConfigMaps (bug.5095).
 * Scope: Static YAML structure checks over infra/k8s/**. Does NOT talk to a cluster.
 * Invariants: NO_OWNED_ARGOCD_CORE_CONFIGMAP, NO_ARGO_APP_PATH_OVER_ARGOCD_CORE_CONFIGMAP.
 * Side-effects: IO (reads repo manifests)
 * Links: infra/k8s/argocd/argocd-cm-runtime-patch.yaml
 * @public
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseAllDocuments } from "yaml";

const REPO_ROOT = path.resolve(__dirname, "../..");
const PATCH_BODY = "infra/k8s/argocd/argocd-cm-runtime-patch.yaml";

// Owning one of these makes Argo replace metadata.labels with its own tracking
// label, dropping `app.kubernetes.io/part-of: argocd` — the selector Argo's own
// informer matches on. The object goes invisible to every controller and the whole
// environment falls to SYNC=Unknown. A kustomize patch is safe (it merges into the
// complete upstream object); a standalone manifest is a full desired state.
const WHY = `A core argocd-* ConfigMap may only appear under infra/k8s/ as a kustomize patch. Owning one drops Argo's part-of informer label and wedges the environment (bug.5095) — deliver keys via ${PATCH_BODY}.`;

type Doc = Record<string, unknown>;

function docsIn(file: string): Doc[] {
  return parseAllDocuments(readFileSync(file, "utf8"))
    .map((d) => d.toJS() as unknown)
    .filter((v): v is Doc => !!v && typeof v === "object" && !Array.isArray(v));
}

function yamlFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return yamlFiles(full);
    return /\.ya?ml$/.test(e.name) ? [full] : [];
  });
}

const MANIFESTS = yamlFiles(path.join(REPO_ROOT, "infra/k8s"))
  .sort()
  .flatMap((f) =>
    docsIn(f).map((doc) => ({ file: path.relative(REPO_ROOT, f), doc }))
  );

const ofKind = (...kinds: string[]) =>
  MANIFESTS.filter((m) => kinds.includes(m.doc.kind as string));

const coreConfigMaps = ofKind("ConfigMap").filter((m) =>
  /^argocd-/.test((m.doc.metadata as { name?: string } | undefined)?.name ?? "")
);

describe("Argo CD core ConfigMap ownership (bug.5095)", () => {
  it("declares no core argocd-* ConfigMap as a standalone resource", () => {
    // `patches:` is the only sanctioned form — anything else is a full desired state.
    const patched = new Set(
      ofKind("Kustomization").flatMap(({ file, doc }) =>
        ((doc.patches ?? []) as { path?: string }[])
          .map((p) => p?.path)
          .filter((p): p is string => typeof p === "string")
          .map((p) => path.join(path.dirname(file), p))
      )
    );
    const offenders = coreConfigMaps
      .map((m) => m.file)
      .filter((f) => !patched.has(f));
    expect(offenders, WHY).toEqual([]);
  });

  it("points no Argo Application source path at a directory holding one", () => {
    const dirs = new Set(coreConfigMaps.map((m) => path.dirname(m.file)));
    const offenders = ofKind("Application", "ApplicationSet").flatMap(
      ({ file, doc }) => {
        const spec = (doc.spec ?? {}) as Doc;
        const inner =
          (spec.template as { spec?: Doc } | undefined)?.spec ?? spec;
        return [inner.source, ...((inner.sources as unknown[]) ?? [])]
          .map((s) => (s as { path?: string } | undefined)?.path)
          .filter(
            (p): p is string =>
              typeof p === "string" && dirs.has(path.normalize(p))
          )
          .map((p) => `${file} -> ${p}`);
      }
    );
    expect(offenders, WHY).toEqual([]);
  });

  it("keeps the argocd-cm patch body a labels-restoring merge patch, not a manifest", () => {
    const [body] = docsIn(path.join(REPO_ROOT, PATCH_BODY));
    // No apiVersion/kind/metadata.name => can never be applied as a resource.
    expect(Object.keys(body ?? {}).sort()).toEqual(["data", "metadata"]);
    const labels = (
      body?.metadata as { labels?: Record<string, string | null> }
    ).labels;
    expect(labels?.["app.kubernetes.io/part-of"]).toBe("argocd");
    expect(labels?.["app.kubernetes.io/instance"]).toBeNull();
  });
});
