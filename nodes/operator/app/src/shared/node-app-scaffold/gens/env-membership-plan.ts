// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

/**
 * Module: `@shared/node-app-scaffold/gens/env-membership-plan`
 * Purpose: Pure delta-planner for the node env-membership verb (story.5020 W4). Given a node's CURRENT
 *   committed control-plane files + a requested `{env, present}` mutation, return the exact set of file
 *   upserts/deletes the operator must commit — WITHOUT touching GitHub. The adapter
 *   ({@link GitHubRepoWriter.openNodeEnvPr}) turns each `upsert` into a blob + each `delete` into a
 *   `sha:null` tree entry; this module owns ALL the add/remove branching so it is unit-testable without
 *   Octokit.
 * Scope: Composes the byte-exact single-file gens (`setCatalogEnvs`, `renderOverlay`, `renderNodeAppset`,
 *   `insert/removeFromAppsetsKustomization`) over the current contents the adapter fetches on main. NO IO,
 *   NO env, NO blob SHAs — the adapter resolves those.
 * Invariants:
 *   - NONEMPTY_DEPLOY_SET — removing an env drops just that env, but removing the final env is rejected;
 *     full decommission is a separate lifecycle operation.
 *   - ACTIVITY_AUTHORITY_STAYS_DEPLOYED — removing the current `activity_env` is rejected. V1 does not
 *     claim an atomic cross-environment authority transfer; that needs a future fenced protocol.
 *   - IDEMPOTENT — requesting the state that already holds (env already present on add / already absent on
 *     remove) yields an EMPTY op list (`{ kind: "no_changes" }`), so the adapter opens no PR.
 *   - DELETE_VIA_SHA_NULL — file removals are emitted as `{ op: "delete", path }`; the adapter maps these
 *     to `{ sha: null }` tree entries (delete-from-base_tree).
 * Side-effects: none — pure string transforms.
 * Links: src/adapters/server/vcs/github-repo-write.ts (openNodeEnvPr), docs/design/operator-fleet-safety.md, story.5020
 * @public
 */

import {
  insertAppsetKustomization,
  removeFromAppsetsKustomization,
  renderNodeAppset,
} from "./appset";
import {
  addCatalogEnv,
  dropCatalogEnv,
  envRemovalViolation,
  parseCatalogActivityEnv,
  parseCatalogEnvs,
  setCatalogEnvs,
} from "./env-membership";
import type { NodeFormationEnv } from "./envs";
import { renderOverlay, renderOverlayFile } from "./overlay";

/** Repo-relative path of a node's per-env overlay kustomization. */
export const overlayPath = (env: string, slug: string): string =>
  `infra/k8s/overlays/${env}/${slug}/kustomization.yaml`;

/** Repo-relative path of a node's per-env ESO producer (creates `<slug>-env-secrets`). */
export const externalSecretPath = (env: string, slug: string): string =>
  `infra/k8s/overlays/${env}/${slug}/external-secret.yaml`;

/** Repo-relative path of a node's per-(env, slug) ApplicationSet object. */
export const appsetPath = (env: string, slug: string): string =>
  `infra/k8s/argocd/appsets/${env}/${env}-${slug}-applicationset.yaml`;

/** Repo-relative path of ONE env's appsets kustomization (the list the slug folds into). */
export const appsetsKustomizationPath = (env: string): string =>
  `infra/k8s/argocd/appsets/${env}/kustomization.yaml`;

export const CATALOG_PATH = (slug: string): string =>
  `infra/catalog/${slug}.yaml`;

/** A single file mutation in the plan. `upsert` carries content; `delete` removes the path. */
export type EnvPlanOp =
  | { readonly op: "upsert"; readonly path: string; readonly content: string }
  | { readonly op: "delete"; readonly path: string };

/**
 * The current committed contents the planner reads. The adapter fetches each on main and passes them in;
 * per-env maps are keyed by env.
 */
export interface EnvPlanCurrent {
  /** Current `infra/catalog/<slug>.yaml` body on main. */
  readonly catalog: string;
  /** The `node-template` overlay for an env being ADDED (source to clone). Keyed by env. */
  readonly templateOverlayByEnv: Readonly<Record<string, string>>;
  /** The `node-template` overlay's `external-secret.yaml` for an env being ADDED (source to clone). Keyed by env. */
  readonly templateExternalSecretByEnv?: Readonly<Record<string, string>>;
  /** The shared `node-applicationset.yaml.tmpl` (only needed on ADD). */
  readonly appsetTemplate?: string | undefined;
  /** Git URL of the deployment parent that owns this env's deploy branches. */
  readonly deploymentParentRepoUrl?: string | undefined;
  /** Current `appsets/<env>/kustomization.yaml` per env. Keyed by env. */
  readonly appsetsKustomizationByEnv: Readonly<Record<string, string>>;
  /** Container port + node_port for the overlay render (only needed on ADD). */
  readonly port?: number | undefined;
  readonly nodePort?: number | undefined;
}

export type EnvDeltaResult =
  | { readonly kind: "no_changes" }
  | {
      readonly kind: "add" | "remove";
      readonly ops: readonly EnvPlanOp[];
      /** The node's non-empty env-set AFTER the mutation. */
      readonly nextEnvs: readonly NodeFormationEnv[];
    };

/** Raised when the request violates a catalog invariant (maps to HTTP 422 / 404 in the adapter). */
export class EnvPlanError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "EnvPlanError";
  }
}

/** The scaffold template node whose per-env overlay every wizard node clones; its env-set is verb-immutable. */
const TEMPLATE_SLUG = "node-template";

/**
 * Pure: compute the file-delta for `{ slug, env, present }` over the node's current control-plane files.
 * Every env is an INDEPENDENT, atomic toggle (ATOMIC_PER_ENV) — candidate-a is no different from
 * preview/production.
 *
 * - ADD (present, env absent): catalog `envs:` += env, render overlay + appset, fold slug into that env's
 *   appsets kustomization.
 * - REMOVE (¬present, env present): catalog `envs:` −= env, DELETE the overlay + appset, regenerate that
 *   env's appsets kustomization without the slug. Applies to candidate-a exactly like any other env.
 *   Removing the final env or the current activity authority is rejected with a typed 422.
 * - Idempotent: the already-holding state returns `{ kind: "no_changes" }`.
 */
export function buildEnvDeltaPlan(input: {
  readonly slug: string;
  readonly env: NodeFormationEnv;
  readonly present: boolean;
  readonly current: EnvPlanCurrent;
}): EnvDeltaResult {
  const { slug, env, present, current } = input;

  // TEMPLATE_NODE_IMMUTABLE — node-template is the per-env overlay TEMPLATE every wizard node clones
  // (render-node-overlays.sh template_path). Removing it from an env deletes that template, so every other
  // node in that env can no longer render. Its env membership is immutable via this verb — fail closed
  // (422). Adds are unaffected: it already lives in every env, so an add is an idempotent no_changes.
  if (!present && slug === TEMPLATE_SLUG) {
    throw new EnvPlanError(
      "template_node_immutable",
      `'${TEMPLATE_SLUG}' is the per-env overlay template every wizard node clones; it cannot be removed from an env.`,
      422
    );
  }

  const currentEnvs = parseCatalogEnvs(current.catalog);
  const activityEnv = parseCatalogActivityEnv(current.catalog);

  if (present) {
    return planAdd({ slug, env, currentEnvs, current });
  }
  return planRemove({ slug, env, currentEnvs, activityEnv, current });
}

function planAdd(args: {
  slug: string;
  env: NodeFormationEnv;
  currentEnvs: NodeFormationEnv[];
  current: EnvPlanCurrent;
}): EnvDeltaResult {
  const { slug, env, currentEnvs, current } = args;

  // Idempotent: already present → no PR.
  if (currentEnvs.includes(env)) {
    return { kind: "no_changes" };
  }

  const nextEnvs = addCatalogEnv(currentEnvs, env);

  const templateOverlay = current.templateOverlayByEnv[env];
  const templateExternalSecret = current.templateExternalSecretByEnv?.[env];
  const appsetsKustomization = current.appsetsKustomizationByEnv[env];
  if (
    templateOverlay === undefined ||
    templateExternalSecret === undefined ||
    appsetsKustomization === undefined ||
    current.appsetTemplate === undefined ||
    current.deploymentParentRepoUrl === undefined ||
    current.port === undefined ||
    current.nodePort === undefined
  ) {
    throw new EnvPlanError(
      "env_render_inputs_missing",
      `cannot render add of '${env}' for '${slug}': missing template overlay, external-secret, appset template, kustomization, or ports.`,
      422
    );
  }

  const ops: EnvPlanOp[] = [
    {
      op: "upsert",
      path: CATALOG_PATH(slug),
      content: setCatalogEnvs(current.catalog, nextEnvs),
    },
    {
      op: "upsert",
      path: overlayPath(env, slug),
      content: renderOverlay(
        templateOverlay,
        slug,
        current.nodePort,
        current.port
      ),
    },
    // ESO producer of <slug>-env-secrets — without it the pod's envFrom secret never
    // exists (CreateContainerConfigError). Byte-exact clone of the node-template overlay's
    // external-secret.yaml (render-node-overlays.sh render_file twin).
    {
      op: "upsert",
      path: externalSecretPath(env, slug),
      content: renderOverlayFile(
        templateExternalSecret,
        slug,
        current.nodePort,
        current.port
      ),
    },
    {
      op: "upsert",
      path: appsetPath(env, slug),
      content: renderNodeAppset(
        current.appsetTemplate,
        slug,
        env,
        current.deploymentParentRepoUrl
      ),
    },
    {
      op: "upsert",
      path: appsetsKustomizationPath(env),
      content: insertAppsetKustomization(appsetsKustomization, slug, env),
    },
  ];
  return { kind: "add", ops, nextEnvs };
}

function planRemove(args: {
  slug: string;
  env: NodeFormationEnv;
  currentEnvs: NodeFormationEnv[];
  activityEnv: NodeFormationEnv;
  current: EnvPlanCurrent;
}): EnvDeltaResult {
  const { slug, env, currentEnvs, activityEnv, current } = args;

  // Idempotent: already absent → no PR.
  if (!currentEnvs.includes(env)) {
    return { kind: "no_changes" };
  }

  const violation = envRemovalViolation({
    currentEnvs,
    activityEnv,
    removeEnv: env,
  });
  if (violation === "final_environment_required") {
    throw new EnvPlanError(
      violation,
      `cannot remove '${env}' from '${slug}': every node must remain deployed in at least one environment. Use the decommission lifecycle to remove the node.`,
      422
    );
  }
  if (violation === "activity_authority_cutover_required") {
    throw new EnvPlanError(
      violation,
      `cannot remove activity authority '${env}' from '${slug}': v1 has no safe cross-environment cutover.`,
      422
    );
  }

  const remaining = dropCatalogEnv(currentEnvs, env);

  const appsetsKustomization = current.appsetsKustomizationByEnv[env];
  if (appsetsKustomization === undefined) {
    throw new EnvPlanError(
      "env_render_inputs_missing",
      `cannot render remove of '${env}' for '${slug}': missing appsets kustomization.`,
      422
    );
  }
  const ops: EnvPlanOp[] = [
    {
      op: "upsert",
      path: CATALOG_PATH(slug),
      content: setCatalogEnvs(current.catalog, remaining),
    },
    { op: "delete", path: overlayPath(env, slug) },
    { op: "delete", path: externalSecretPath(env, slug) },
    { op: "delete", path: appsetPath(env, slug) },
    {
      op: "upsert",
      path: appsetsKustomizationPath(env),
      content: removeFromAppsetsKustomization(appsetsKustomization, slug, env),
    },
  ];
  return { kind: "remove", ops, nextEnvs: remaining };
}
