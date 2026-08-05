// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/knowledge-base/seeds/domains`
 * Purpose: Base `domains` registry rows. Every knowledge entry's `domain` column references one of these.
 *   New domains can be added per-node by inserting additional rows + Dolt commit (per knowledge-syntropy spec).
 * Scope: Seed data definitions only. Does not perform I/O — the migrator (or first-write path on candidate-a) applies these.
 * Invariants: Domain `id`s are stable identifiers. New domains are append-only and registered explicitly per knowledge-syntropy.
 * Side-effects: none
 * Links: docs/spec/knowledge-syntropy.md
 * @public
 */

export interface NewDomain {
  id: string;
  name: string;
  description?: string;
}

// UNIVERSAL baseline only — the three domains EVERY node inherits, mapping 1:1
// to what the cognition bundle assembles (mission field, orientation, EDO/domains).
// Niche/subject-matter domains (operator: infrastructure/governance/nodes; poly:
// prediction-market; resy: reservations) are seeded by each node's OWN migrator,
// NEVER here — putting them in the shared base was cross-node contamination.
// `skills` is intentionally absent: it is an entry_type (skill/guide/playbook),
// not a domain. See docs/spec/knowledge-domain-registry.md § Seeding.
export const BASE_DOMAIN_SEEDS: NewDomain[] = [
  {
    id: "meta",
    name: "Meta",
    description:
      "How to operate this node and the knowledge hub itself — orientation, conventions, and operating skills.",
  },
  {
    id: "mission",
    name: "Mission",
    description:
      "The node's charter — why it exists, its values, and its non-goals.",
  },
  {
    id: "strategy",
    name: "Strategy",
    description:
      "How the node pursues its mission — decision approaches and EDO hypothesis chains, promoted to rules once validated.",
  },
];
