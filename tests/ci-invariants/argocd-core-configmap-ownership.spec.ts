// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

/**
 * Module: `@tests/ci-invariants/argocd-core-configmap-ownership`
 * Purpose: Pins that no Cogni-authored manifest can take GitOps ownership of a core `argocd-*` ConfigMap (bug.5095).
 * Scope: Static YAML structure checks over infra/k8s/**. Does NOT talk to a cluster or to Argo.
 * Invariants: NO_OWNED_ARGOCD_CORE_CONFIGMAP, NO_ARGO_APP_PATH_OVER_ARGOCD_CORE_CONFIGMAP, ARGOCD_CM_KEYS_VIA_MERGE_PATCH.
 * Side-effects: IO (reads repo manifests)
 * Links: infra/k8s/argocd/argocd-cm-runtime-patch.yaml, scripts/setup/provision-env-vm.sh
 * @public
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseAllDocuments } from "yaml";

const REPO_ROOT = path.resolve(__dirname, "../..");
const K8S_ROOT = path.join(REPO_ROOT, "infra/k8s");
const RUNTIME_PATCH = "infra/k8s/argocd/argocd-cm-runtime-patch.yaml";
const PROVISION_SCRIPT = "scripts/setup/provision-env-vm.sh";

/**
 * Argo CD's own configuration surface. These ConfigMaps are created by Argo's
 * upstream install and then mutated in place at provision time with values that
 * MUST NOT live in Git (above all the GitHub repository credentials in
 * `argocd-cm`). A Cogni manifest that declares one of them with a partial `data`
 * block and is synced by an Argo Application makes Argo the owner of the whole
 * object, and every key absent from Git is dropped on the next sync.
 */
const CORE_CM_NAME = /^argocd-/;

interface YamlDoc {
  file: string; // repo-relative
  dir: string; // absolute
  value: Record<string, unknown>;
}

function listYamlFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listYamlFiles(full));
    else if (/\.ya?ml$/.test(entry.name)) out.push(full);
  }
  return out.sort();
}

function loadDocs(): YamlDoc[] {
  const docs: YamlDoc[] = [];
  for (const file of listYamlFiles(K8S_ROOT)) {
    const parsed = parseAllDocuments(readFileSync(file, "utf8"));
    for (const doc of parsed) {
      if (doc.errors.length > 0) {
        throw new Error(`${path.relative(REPO_ROOT, file)}: ${doc.errors[0]}`);
      }
      const value = doc.toJS();
      if (value && typeof value === "object" && !Array.isArray(value)) {
        docs.push({
          file: path.relative(REPO_ROOT, file),
          dir: path.dirname(file),
          value: value as Record<string, unknown>,
        });
      }
    }
  }
  return docs;
}

const ALL_DOCS = loadDocs();

function metaName(doc: YamlDoc): string {
  const meta = doc.value.metadata as { name?: string } | undefined;
  return meta?.name ?? "";
}

/** Every file referenced as a kustomize PATCH (repo-relative), from any kustomization.yaml. */
function kustomizePatchFiles(): Set<string> {
  const files = new Set<string>();
  for (const doc of ALL_DOCS) {
    if (doc.value.kind !== "Kustomization") continue;
    const patches = (doc.value.patches ?? []) as { path?: string }[];
    for (const patch of patches) {
      if (patch?.path)
        files.add(path.relative(REPO_ROOT, path.resolve(doc.dir, patch.path)));
    }
    const legacy = (doc.value.patchesStrategicMerge ?? []) as string[];
    for (const entry of legacy) {
      if (typeof entry === "string" && !entry.includes("\n")) {
        files.add(path.relative(REPO_ROOT, path.resolve(doc.dir, entry)));
      }
    }
  }
  return files;
}

/** Repo-relative source paths declared by any Argo Application / ApplicationSet. */
function argoSourcePaths(): { app: string; sourcePath: string }[] {
  const out: { app: string; sourcePath: string }[] = [];
  const collect = (app: string, spec: unknown) => {
    if (!spec || typeof spec !== "object") return;
    const s = spec as Record<string, unknown>;
    const sources = [s.source, ...((s.sources as unknown[]) ?? [])];
    for (const source of sources) {
      const p = (source as { path?: string } | undefined)?.path;
      if (typeof p === "string" && p.length > 0) {
        out.push({ app, sourcePath: path.normalize(p).replace(/\/+$/, "") });
      }
    }
  };
  for (const doc of ALL_DOCS) {
    if (doc.value.kind === "Application") collect(doc.file, doc.value.spec);
    if (doc.value.kind === "ApplicationSet") {
      const spec = doc.value.spec as
        | { template?: { spec?: unknown } }
        | undefined;
      collect(doc.file, spec?.template?.spec);
    }
  }
  return out;
}

const CORE_CM_DOCS = ALL_DOCS.filter(
  (doc) => doc.value.kind === "ConfigMap" && CORE_CM_NAME.test(metaName(doc))
);

describe("Argo CD core ConfigMap ownership (bug.5095)", () => {
  it("declares no core argocd-* ConfigMap as a standalone deployable resource", () => {
    // A kustomize patch is safe: it merges into the COMPLETE upstream object
    // that the same kustomization installs, so it adds keys instead of
    // replacing the live ConfigMap. A standalone manifest is not — it is a
    // full desired state, and whoever applies it owns every key.
    const patchFiles = kustomizePatchFiles();
    const offenders = CORE_CM_DOCS.filter(
      (doc) => !patchFiles.has(doc.file)
    ).map((doc) => `${doc.file} (${metaName(doc)})`);
    expect(
      offenders,
      "A core argocd-* ConfigMap may only appear under infra/k8s/ as a kustomize " +
        "patch (listed in a kustomization.yaml `patches:`). Declaring one as a " +
        "standalone resource lets an Argo Application own the whole object and drop " +
        "every key it does not declare — including the GitHub repository credentials " +
        "argocd-repo-server needs to clone. That took candidate-a, preview AND " +
        `production down (bug.5095). Deliver keys via ${RUNTIME_PATCH} instead.`
    ).toEqual([]);
  });

  it("points no Argo Application source path at a directory holding a core argocd-* ConfigMap", () => {
    const cmDirs = new Set(CORE_CM_DOCS.map((doc) => path.dirname(doc.file)));
    const offenders = argoSourcePaths()
      .filter(({ sourcePath }) => cmDirs.has(sourcePath))
      .map(({ app, sourcePath }) => `${app} -> ${sourcePath}`);
    expect(
      offenders,
      "Argo must never be handed a source path that renders Argo's own core " +
        "configuration: that is the self-management hazard bug.5095 hit. Argo's " +
        "install + config stay in the out-of-band bootstrap kustomization."
    ).toEqual([]);
  });

  it("keeps Cogni's argocd-cm keys in a keys-only merge-patch body, not a manifest", () => {
    const raw = readFileSync(path.join(REPO_ROOT, RUNTIME_PATCH), "utf8");
    const docs = parseAllDocuments(raw);
    expect(docs).toHaveLength(1);
    const body = (docs[0]?.toJS() ?? {}) as Record<string, unknown>;
    // No apiVersion/kind/metadata => it can never be applied as a resource,
    // rendered by kustomize, or picked up from an Argo Application source path.
    expect(Object.keys(body).sort()).toEqual(["data"]);
    const data = body.data as Record<string, string>;
    expect(data["kustomize.buildOptions"]).toBe("--enable-helm");
    expect(
      data["resource.customizations.health.compute.cogni.io_ComputeWorkload"]
    ).toContain("condition.observedGeneration == generation");
  });

  it("applies that patch body with a non-destructive `kubectl patch --type merge`", () => {
    const script = readFileSync(path.join(REPO_ROOT, PROVISION_SCRIPT), "utf8");
    expect(script).toContain(
      "kubectl -n argocd patch cm argocd-cm --type merge"
    );
    expect(script).toContain(RUNTIME_PATCH);
    // `kubectl apply`/`replace` on argocd-cm would reintroduce whole-object ownership.
    expect(script).not.toMatch(
      /kubectl[^\n]*(apply|replace)[^\n]*argocd-cm-runtime-patch/
    );
  });
});
