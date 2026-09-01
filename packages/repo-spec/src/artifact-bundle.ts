// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/repo-spec/artifact-bundle`
 * Purpose: Define and atomically resolve the source-SHA artifact bundle emitted by node CI.
 * Scope: Pure schemas and assembly. Does not read git, registries, files, or deployment state.
 * Invariants: EXACT_SERVICE_COVERAGE, ONE_SOURCE_SHA, DIGEST_PINNED, ATOMIC_OR_NOTHING.
 * Side-effects: none
 * Links: story.5016, task.5065, docs/spec/node-ci-cd-contract.md
 * @public
 */

import { z } from "zod";

import {
  extractNodeId,
  extractNodeServices,
  type NodeServiceConfig,
} from "./accessors.js";
import type { RepoSpec } from "./schema.js";

const sourceShaSchema = z
  .string()
  .regex(/^[0-9a-f]{40}$/, "source SHA must be 40 lowercase hex characters");
const logicalNameSchema = z
  .string()
  .regex(/^[a-z][a-z0-9-]{0,62}$/, "name must be a DNS-safe lowercase token");
const digestImageSchema = z
  .string()
  .regex(
    /^[a-z0-9][a-z0-9._:-]*(?:\/[a-z0-9][a-z0-9._-]*)+@sha256:[0-9a-f]{64}$/,
    "image must be an immutable OCI sha256 digest reference"
  );

export const nodeArtifactBundleServiceSchema = z
  .object({
    service: logicalNameSchema,
    artifact: logicalNameSchema,
    source_sha: sourceShaSchema,
    image: digestImageSchema,
  })
  .strict();

export type NodeArtifactBundleService = z.infer<
  typeof nodeArtifactBundleServiceSchema
>;

export const nodeArtifactBundleSchema = z
  .object({
    schema_version: z.literal(1),
    node_id: z.string().uuid(),
    source_sha: sourceShaSchema,
    repository: z
      .string()
      .regex(
        /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/,
        "repository must be GitHub owner/name"
      ),
    services: z.array(nodeArtifactBundleServiceSchema).min(1).max(8),
  })
  .strict()
  .superRefine((bundle, ctx) => {
    const serviceNames = bundle.services.map((service) => service.service);
    if (new Set(serviceNames).size !== serviceNames.length) {
      ctx.addIssue({
        code: "custom",
        message: "Duplicate bundle service names",
      });
    }
    const imageByArtifact = new Map<string, string>();
    bundle.services.forEach((service, index) => {
      if (service.source_sha !== bundle.source_sha) {
        ctx.addIssue({
          code: "custom",
          path: ["services", index, "source_sha"],
          message: "Every bundled service must have the bundle source SHA",
        });
      }
      const priorImage = imageByArtifact.get(service.artifact);
      if (priorImage && priorImage !== service.image) {
        ctx.addIssue({
          code: "custom",
          path: ["services", index, "image"],
          message: "One artifact identity must resolve to one image digest",
        });
      } else {
        imageByArtifact.set(service.artifact, service.image);
      }
    });
  });

export type NodeArtifactBundle = z.infer<typeof nodeArtifactBundleSchema>;

export interface BuiltNodeArtifact {
  readonly artifact: string;
  readonly sourceSha: string;
  readonly image: string;
}

export interface ResolvedNodeServiceArtifact {
  readonly service: NodeServiceConfig;
  readonly sourceSha: string;
  readonly image: string;
}

export interface ResolvedNodeArtifactBundle {
  readonly nodeId: string;
  readonly sourceSha: string;
  readonly repository: string;
  readonly services: readonly ResolvedNodeServiceArtifact[];
}

export function parseNodeArtifactBundle(input: unknown): NodeArtifactBundle {
  const result = nodeArtifactBundleSchema.safeParse(input);
  if (!result.success) {
    throw new Error(
      `[artifact-bundle] Invalid bundle: ${result.error.message}`
    );
  }
  return result.data;
}

/**
 * Assemble the ONE CI bundle from per-artifact digest outputs.
 *
 * The full declared set is checked before an object is returned, so a caller
 * cannot serialize a partial bundle after one matrix leg fails or goes missing.
 */
export function buildNodeArtifactBundle(input: {
  readonly spec: RepoSpec;
  readonly sourceSha: string;
  readonly repository: string;
  readonly artifacts: readonly BuiltNodeArtifact[];
}): NodeArtifactBundle {
  const services = extractNodeServices(input.spec);
  const byArtifact = new Map(
    input.artifacts.map((artifact) => [artifact.artifact, artifact] as const)
  );
  if (byArtifact.size !== input.artifacts.length) {
    throw new Error("[artifact-bundle] Duplicate built artifact identities");
  }

  const declaredArtifacts = new Set(
    services.map((service) => service.artifact.name)
  );
  const extra = input.artifacts.find(
    (artifact) => !declaredArtifacts.has(artifact.artifact)
  );
  if (extra) {
    throw new Error(
      `[artifact-bundle] Undeclared built artifact: ${extra.artifact}`
    );
  }

  const bundledServices = services.map((service) => {
    const built = byArtifact.get(service.artifact.name);
    if (!built) {
      throw new Error(
        `[artifact-bundle] Missing artifact for service ${service.name}: ${service.artifact.name}`
      );
    }
    if (built.sourceSha !== input.sourceSha) {
      throw new Error(
        `[artifact-bundle] Source SHA mismatch for artifact ${built.artifact}`
      );
    }
    return {
      service: service.name,
      artifact: service.artifact.name,
      source_sha: built.sourceSha,
      image: built.image,
    };
  });

  return parseNodeArtifactBundle({
    schema_version: 1,
    node_id: extractNodeId(input.spec),
    source_sha: input.sourceSha,
    repository: input.repository,
    services: bundledServices,
  });
}

/**
 * Resolve a CI bundle against the declaration at the same source revision.
 * Exact service+artifact equality is checked before any ProvisionSpec assembly.
 */
export function resolveNodeArtifactBundle(
  spec: RepoSpec,
  input: unknown
): ResolvedNodeArtifactBundle {
  const bundle = parseNodeArtifactBundle(input);
  const nodeId = extractNodeId(spec);
  if (bundle.node_id !== nodeId) {
    throw new Error(
      `[artifact-bundle] Node mismatch: expected ${nodeId}, received ${bundle.node_id}`
    );
  }

  const declaredServices = extractNodeServices(spec);
  const byService = new Map(
    bundle.services.map((service) => [service.service, service] as const)
  );
  if (bundle.services.length !== declaredServices.length) {
    throw new Error(
      `[artifact-bundle] Service coverage mismatch: declared ${declaredServices.length}, bundled ${bundle.services.length}`
    );
  }

  const services = declaredServices.map((service) => {
    const bundled = byService.get(service.name);
    if (!bundled) {
      throw new Error(
        `[artifact-bundle] Missing bundled service: ${service.name}`
      );
    }
    if (bundled.artifact !== service.artifact.name) {
      throw new Error(
        `[artifact-bundle] Artifact mismatch for service ${service.name}: expected ${service.artifact.name}, received ${bundled.artifact}`
      );
    }
    return {
      service,
      sourceSha: bundled.source_sha,
      image: bundled.image,
    };
  });

  return {
    nodeId,
    sourceSha: bundle.source_sha,
    repository: bundle.repository,
    services,
  };
}
