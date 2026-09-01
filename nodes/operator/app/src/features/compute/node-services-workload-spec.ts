// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

/**
 * Module: `@features/compute/node-services-workload-spec`
 * Purpose: Assemble an atomically resolved node artifact bundle into one provider-neutral workload.
 * Scope: Pure declaration+digest mapping; no registry, secret, provider, or lifecycle I/O.
 * Invariants: DIGEST_PINNED, ONE_PUBLIC_SERVICE, PRIVATE_IS_NON_GLOBAL, BIND_ALL_INTERFACES, NO_RAW_ENV_INPUT.
 * Side-effects: none
 * Links: story.5016, task.5065, @cogni/repo-spec artifact bundle
 * @internal
 */

import type { ProvisionServiceSpec, ProvisionSpec } from "@cogni/ai-tools";
import type { ResolvedNodeArtifactBundle } from "@cogni/repo-spec";

export interface NodeServicesWorkloadInput {
  /** Node slug used as the provider-neutral workload label. */
  readonly slug: string;
  /** Fully resolved, exact-set, digest-pinned artifact bundle. */
  readonly bundle: ResolvedNodeArtifactBundle;
  /** Custom hostnames accepted by the public ingress. */
  readonly hosts?: readonly string[];
}

export interface LegacyCogniAppCompatibilityInput
  extends NodeServicesWorkloadInput {
  /** Canonical URL used by the existing Cogni Next.js app image. */
  readonly publicUrl: string;
}

export interface NodeServicesProvisionServiceSpec extends ProvisionServiceSpec {
  /** Value-free requirements resolved server-side before provider I/O. */
  readonly secretRefs: readonly { readonly key: string }[];
}

export interface NodeServicesWorkloadSpec
  extends Omit<ProvisionSpec, "services"> {
  readonly services: readonly NodeServicesProvisionServiceSpec[];
}

/** Build one generic co-located workload from the validated complete bundle. */
export function buildNodeServicesWorkloadSpec(
  input: NodeServicesWorkloadInput
): NodeServicesWorkloadSpec {
  return {
    name: input.slug,
    services: input.bundle.services.map(({ service, image }) => {
      const isPublic = service.visibility === "public";
      const bindingEnv = Object.fromEntries(
        Object.entries(service.bindings).map(([envName, targetName]) => {
          const target = input.bundle.services.find(
            (candidate) => candidate.service.name === targetName
          );
          if (!target) {
            // Defensive only: repo-spec validation already rejects missing targets.
            throw new Error(
              `[node-workload] Missing binding target ${service.name}.${envName} -> ${targetName}`
            );
          }
          return [envName, target.service.internalUrl];
        })
      );

      return {
        name: service.name,
        image,
        secretRefs: service.secretRefs,
        // This generic layer accepts no caller-provided values. Every value is
        // deterministically derived from the Git service/topology declaration.
        env: {
          ...bindingEnv,
          HOST: service.bindHost,
          HOSTNAME: service.bindHost,
          PORT: String(service.port),
        },
        ...(service.command ? { command: service.command } : {}),
        ...(service.args ? { args: service.args } : {}),
        ...(service.readinessPath
          ? { readinessPath: service.readinessPath }
          : {}),
        ...service.resources,
        expose: [
          {
            port: service.port,
            as: isPublic ? 80 : service.port,
            global: isPublic,
            ...(isPublic && input.hosts && input.hosts.length > 0
              ? { hosts: input.hosts }
              : {}),
          },
        ],
      };
    }),
  };
}

/**
 * Preserve the existing single Next.js node image's non-secret runtime config.
 *
 * This compatibility policy is deliberately named and app-specific. It is not
 * applied by the generic service mapper and it has no arbitrary env input;
 * secret refs are resolved later at the provider-I/O boundary.
 */
export function buildLegacyCogniAppWorkloadSpec(
  input: LegacyCogniAppCompatibilityInput
): NodeServicesWorkloadSpec {
  const workload = buildNodeServicesWorkloadSpec(input);
  const app = workload.services.find((service) => service.name === "app");
  if (!app || app.expose?.[0]?.global !== true) {
    throw new Error(
      "[node-workload] Legacy Cogni compatibility requires the public app service"
    );
  }

  return {
    ...workload,
    services: workload.services.map((service) =>
      service.name === "app"
        ? {
            ...service,
            env: {
              ...service.env,
              NODE_NAME: input.slug,
              COGNI_REPO_PATH: "/app",
              AUTH_TRUST_HOST: "true",
              NEXTAUTH_URL: input.publicUrl,
              APP_BASE_URL: input.publicUrl,
            },
          }
        : service
    ),
  };
}
