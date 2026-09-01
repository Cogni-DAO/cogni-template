// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

/**
 * Module: `@features/compute/node-services-workload-spec`
 * Purpose: Assemble an atomically resolved node artifact bundle into one provider-neutral workload.
 * Scope: Pure declaration+digest → ProvisionSpec mapping; no registry, secret, provider, or lifecycle I/O.
 * Invariants: DIGEST_PINNED, ONE_PUBLIC_SERVICE, PRIVATE_IS_NON_GLOBAL, BIND_ALL_INTERFACES.
 * Side-effects: none
 * Links: story.5016, task.5065, @cogni/repo-spec artifact bundle
 * @internal
 */

import type { ProvisionSpec } from "@cogni/ai-tools";
import type { ResolvedNodeArtifactBundle } from "@cogni/repo-spec";

export interface NodeServicesWorkloadInput {
  /** Node slug used as the provider-neutral workload label. */
  readonly slug: string;
  /** Fully resolved, exact-set, digest-pinned artifact bundle. */
  readonly bundle: ResolvedNodeArtifactBundle;
  /** Canonical public URL injected into the public app service. */
  readonly publicUrl: string;
  /** Custom hostnames accepted by the public ingress. */
  readonly hosts?: readonly string[];
  /** Scoped runtime env supplied independently for each service. */
  readonly envByService?: Readonly<
    Record<string, Readonly<Record<string, string>>>
  >;
}

/** Build one co-located workload from the already-validated complete bundle. */
export function buildNodeServicesWorkloadSpec(
  input: NodeServicesWorkloadInput
): ProvisionSpec {
  return {
    name: input.slug,
    services: input.bundle.services.map(({ service, image }) => {
      const isPublic = service.visibility === "public";
      const suppliedEnv = input.envByService?.[service.name] ?? {};
      const conflictingBinding = Object.keys(service.bindings).find(
        (envName) => suppliedEnv[envName] !== undefined
      );
      if (conflictingBinding) {
        throw new Error(
          `[node-workload] Runtime env cannot override Git-declared binding ${service.name}.${conflictingBinding}`
        );
      }
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
      const serviceEnv = {
        NODE_NAME: input.slug,
        COGNI_SERVICE_NAME: service.name,
        ...(isPublic
          ? {
              COGNI_REPO_PATH: "/app",
              AUTH_TRUST_HOST: "true",
              NEXTAUTH_URL: input.publicUrl,
              APP_BASE_URL: input.publicUrl,
            }
          : {}),
        ...suppliedEnv,
        ...bindingEnv,
        // BIND_ALL_INTERFACES is not caller-overridable. Images must honor this
        // declared process contract; the candidate checkpoint proves it live.
        HOST: service.bindHost,
        HOSTNAME: service.bindHost,
        PORT: String(service.port),
      };

      return {
        name: service.name,
        image,
        env: serviceEnv,
        ...(service.command ? { command: service.command } : {}),
        ...(service.args ? { args: service.args } : {}),
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
