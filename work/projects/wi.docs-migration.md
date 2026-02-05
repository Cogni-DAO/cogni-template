work_item_id:: wi.docs-migration
work_item_type:: project
title:: Documentation Migration to Typed Structure
state:: Active
summary:: Migrate legacy docs/\*.md files to typed directories with Logseq metadata headers
outcome:: All docs in typed directories (spec/, guides/, decisions/), redirect stubs at old paths, all references updated
assignees:: derekg1729
created:: 2026-02-05
updated:: 2026-02-05

# Documentation Migration to Typed Structure

## Goal

Migrate legacy documentation files into structured, validated system with Logseq-native `key:: value` metadata. Result: ripgrep-discoverable, agent-readable docs with trust levels and consistent organization.

## Migration Checklist

| Original                            | Destination                      | Moved | Template | Refs Updated |
| ----------------------------------- | -------------------------------- | :---: | :------: | :----------: |
| ARCHITECTURE.md                     | spec/architecture.md             |  [x]  |   [x]    |     [ ]      |
| SCHEDULER_SPEC.md                   | spec/scheduler.md                |  [x]  |   [x]    |     [ ]      |
| RBAC_SPEC.md                        | spec/rbac.md                     |  [x]  |   [x]    |     [ ]      |
| AI_SETUP_SPEC.md                    | spec/ai-setup.md                 |  [x]  |   [x]    |     [ ]      |
| COGNI_BRAIN_SPEC.md                 | spec/cogni-brain.md              |  [x]  |   [x]    |     [ ]      |
| DATABASES.md                        | spec/databases.md                |  [x]  |   [x]    |     [ ]      |
| OBSERVABILITY.md                    | spec/observability.md            |  [x]  |   [x]    |     [ ]      |
| CI-CD.md                            | spec/ci-cd.md                    |  [x]  |   [x]    |     [ ]      |
| STYLE.md                            | spec/style.md                    |  [x]  |   [x]    |     [ ]      |
| SETUP.md                            | guides/developer-setup.md        |  [ ]  |   [ ]    |     [ ]      |
| FEATURE_DEVELOPMENT_GUIDE.md        | guides/feature-development.md    |  [ ]  |   [ ]    |     [ ]      |
| TESTING.md                          | guides/testing.md                |  [ ]  |   [ ]    |     [ ]      |
| ALLOY_LOKI_SETUP.md                 | guides/alloy-loki-setup.md       |  [ ]  |   [ ]    |     [ ]      |
| archive/PAYMENTS_WIDGET_DECISION.md | decisions/adr/payments-widget.md |  [ ]  |   [ ]    |     [ ]      |

## Post-Migration Tasks

- [ ] Create redirect stubs at all original locations
- [ ] Update SPEC_INDEX.md with migrated specs
- [ ] Update root AGENTS.md pointers
- [ ] Verify pnpm check:docs:metadata passes

## Notes

- All migrated docs use `trust:: draft` (upgrade later after review)
- Reference spec: [DOCS_ORGANIZATION_PLAN.md](../../docs/DOCS_ORGANIZATION_PLAN.md)
