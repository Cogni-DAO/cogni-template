// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@bootstrap/knowledge-mirror`
 * Purpose: Resolve the DoltHub mirror remote for THIS node's knowledge push.
 * Scope: Pure runtime wiring helper; no network IO.
 * Invariants:
 *   - ENV_OVERRIDE_WINS: a non-empty per-env `KNOWLEDGE_DOLTHUB_REMOTE_URL`
 *     overrides repo-spec `knowledge.remote.url`. This is how a non-prod env
 *     (candidate-a) syncs to a throwaway test repo while prod targets the
 *     canonical `<owner>/<slug>` repo — the repo-spec is a single git file and
 *     cannot itself vary per env.
 * Side-effects: none
 * Links: docs/spec/knowledge-data-plane.md, docs/runbooks/dolthub-remote-bootstrap.md
 * @internal
 */

import type { KnowledgeConfig } from "@/shared/config";

export function resolveKnowledgeMirrorRemoteUrl(
  knowledge: KnowledgeConfig | undefined,
  envRemoteUrl?: string | undefined
): string | undefined {
  // ENV_OVERRIDE_WINS: candidate-a → throwaway repo; prod → repo-spec default.
  return envRemoteUrl ?? knowledge?.remote.url;
}
