# Architecture Primer for Feature Work

## Inside-out Rule

Every non-trivial feature follows:
**contracts → core → ports → features → adapters → app → UI**.
Imports point inward only.

## Layer Import Policy

See [ARCHITECTURE.md Enforcement Rules](ARCHITECTURE.md#enforcement-rules) for canonical import patterns and entry points.

## Minimal Feature Workflow (Gated)

**Contract** · Create `src/contracts/<feature>.<action>.v1.contract.ts` with Zod in/out and id.

**Core rule** · Implement pure logic in `src/core/<domain>/{model.ts,rules.ts}`. No effects.

**Ports** · Define minimal interfaces in `src/ports/*.port.ts` that core/feature need.

**Feature service** · Orchestrate in `src/features/<slice>/services/<action>.ts` using ports.

**Adapter** · Implement ports under `src/adapters/server/**` (or `client/**` when applicable).

**Delivery** · Map HTTP or worker entry in `src/app/**` to the feature service. Validate with the contract.

**UI** · Compose components under `src/features/<slice>/components/**` using kit only.

## Building New UI Components

For any new UI components, follow the [UI Implementation Guide](UI_IMPLEMENTATION_GUIDE.md): vendor → styles/ui.ts (CVA) → components/kit → features/components.

## Checklists to Unblock CI (Copy into PR)

- [ ] Contract exists and is referenced by the delivery entry.
- [ ] Feature service has no direct DB, fetch, or SDK calls; only uses ports.
- [ ] Adapters implement exactly the ports declared; no business rules inside.
- [ ] Core files import only stdlib and shared pure utilities.
- [ ] UI uses kit wrappers; no literal className outside `src/styles/ui.ts`.

## Naming and Paths (Enforced)

**Contract file**: `contracts/<feature>.<action>.v1.contract.ts` exporting `{ id, input, output }`.

**Feature service**: `features/<feature>/services/<action>.ts` exporting `execute`.

**Port interface**: `ports/<name>.port.ts` exporting a single `*Service` or `*Repo`.

**Adapter**: `adapters/{server|client}/<area>/<impl>.{adapter|repo}.ts` exporting the port implementation.

**Route**: `app/api/<feature>/<action>/route.ts` importing the contract and feature service only.

## Prohibited Shortcuts

- [ ] No app or features importing from adapters.
- [ ] No adapter importing from app, features, or UI.
- [ ] No business logic in routes, adapters, or UI.
- [ ] No UI accessing ports directly.

## Docs Anchors

Put a one-page spec in `docs/features/<feature>.<action>.v1.md` that links: contract → service → route.
