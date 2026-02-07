---
id: feature-development-guide
type: guide
title: Architecture Primer for Feature Work
status: draft
trust: draft
summary: End-to-end workflow for building features following hexagonal architecture (contracts → core → ports → features → adapters → app → UI).
read_when: Starting a new feature, adding an API endpoint, or need a refresher on the layer import policy.
owner: derekg1729
created: 2026-02-06
verified: 2026-02-06
tags: [architecture, dev]
---

# Architecture Primer for Feature Work

## When to Use This

You are building a new feature, adding an API endpoint, or modifying existing feature code. This guide ensures you follow the hexagonal architecture layer ordering.

## Preconditions

- [ ] Familiar with the [Architecture Spec](../spec/architecture.md)
- [ ] Feature scope defined (what contract, service, and route you need)

## Steps

### Inside-out Rule

Every non-trivial feature follows:
**contracts → core → ports → features → adapters → app → UI**.
Imports point inward only. `packages/` are external libraries (like npm deps) — they never import from `src/`.

## Layer Import Policy

See [Architecture Spec Enforcement Rules](../spec/architecture.md#enforcement-rules) for canonical import patterns and entry points.

## Packages

Internal packages under `packages/` are treated like external npm dependencies:

| Package                   | Purpose                                                           |
| ------------------------- | ----------------------------------------------------------------- |
| `@cogni/ai-core`          | AI primitives: AiEvent, UsageFact, ToolSpec, ToolInvocationRecord |
| `@cogni/ai-tools`         | Tool contracts and pure implementations                           |
| `@cogni/langgraph-graphs` | LangGraph runtime, graph factories                                |
| `@cogni/cogni-contracts`  | Smart contract ABIs and types                                     |
| `@cogni/aragon-osx`       | Aragon DAO/OSx integration                                        |

Packages may import from each other and external deps. Never from `src/`.

All AI functionality in `src/` must flow through ports (`GraphExecutorPort`, `LlmCaller`) for billing and telemetry.

### Minimal Feature Workflow (Gated)

**Contract** · Create `src/contracts/<feature>.<action>.v1.contract.ts` with Zod in/out and id.

**Core rule** · Implement pure logic in `src/core/<domain>/{model.ts,rules.ts}`. No effects.

**Ports** · Define minimal interfaces in `src/ports/*.port.ts` that core/feature need.

**Feature service** · Orchestrate in `src/features/<slice>/services/<action>.ts` using ports.

**Adapter** · Implement ports under `src/adapters/server/**` (or `client/**` when applicable).

**Delivery** · Map HTTP or worker entry in `src/app/**` to the feature service. Validate with the contract.

**UI** · Compose components under `src/features/<slice>/components/**` using kit only.

## Building New UI Components

For any new UI components, follow the [UI Implementation Spec](../spec/ui-implementation.md): vendor → styles/ui.ts (CVA) → components/kit → features/components.

## Verification

### CI Checklist (Copy into PR)

- [ ] Contract exists and is referenced by the delivery entry.
- [ ] Feature service has no direct DB, fetch, or SDK calls; only uses ports.
- [ ] Adapters implement exactly the ports declared; no business rules inside.
- [ ] Core files import only stdlib and shared pure utilities.
- [ ] UI uses kit wrappers; no literal className outside `src/styles/ui.ts`.

### Naming and Paths (Enforced)

**Contract file**: `contracts/<feature>.<action>.v1.contract.ts` exporting `{ id, input, output }`.

**Feature service**: `features/<feature>/services/<action>.ts` exporting `execute`.

**Port interface**: `ports/<name>.port.ts` exporting a single `*Service` or `*Repo`.

**Adapter**: `adapters/{server|client}/<area>/<impl>.{adapter|repo}.ts` exporting the port implementation.

**Route**: `app/api/<feature>/<action>/route.ts` importing the contract and feature service only.

**Package module**: `packages/<pkg>/src/<domain>/<name>.ts` with barrel export via subpath.

## Troubleshooting

### Prohibited Shortcuts

- [ ] No app or features importing from adapters.
- [ ] No adapter importing from app, features, or UI.
- [ ] No business logic in routes, adapters, or UI.
- [ ] No UI accessing ports directly.
- [ ] No packages importing from `src/`.

### Docs Anchors

Put a one-page spec in `docs/features/<feature>.<action>.v1.md` that links: contract → service → route.

## Related

- [Architecture Spec](../spec/architecture.md) — canonical import patterns and enforcement rules
- [UI Implementation Spec](../spec/ui-implementation.md) — UI component pipeline
- [Testing Guide](./testing.md) — test adapter pattern and CI integration
- [Create a New Service](./create-service.md) — for standalone deployable services
