---
work_item_id: wi.docs-migration-tracker
work_item_type: issue
title: Docs Migration Tracker
state: In Progress
priority: 0
estimate: 4
summary: Track migration of 97 legacy docs to typed structure with YAML frontmatter
outcome: All docs classified, migrated to typed directories, references updated
spec_refs: docs/spec/spec-project-lifecycle.md, docs/spec/docs-work-system.md
assignees: derekg1729
initiative: ini.docs-system-infrastructure
created: 2026-02-05
updated: 2026-02-06
labels: [docs, migration]
pr:
external_refs:
---

# Docs Migration Tracker

## Execution Checklist

### Pre-Migration Tasks (Done)

**Template Design (Obsidian YAML v0):**

- [x] Define v0 template: `docs/_templates/spec.md`
- [x] Define v0 template: `docs/_templates/guide.md`
- [x] Define v0 template: `docs/_templates/decision.md`
- [x] Define v0 template: `work/_templates/initiative.md`
- [x] Define v0 template: `work/_templates/issue.md`

**Validator Updates:**

- [x] Add `yaml` dev dependency for proper YAML parsing
- [x] Rewrite `scripts/validate-docs-metadata.mjs` with new rules (dir→type match, required keys, enums, date format, uniqueness, field set separation)
- [x] Add required H2 heading validation per doc type (spec gated on `spec_state`)
- [x] Convert 9 already-migrated specs from Logseq `key::` to YAML frontmatter

**Specs & Structure:**

- [x] Create `docs/spec/development-lifecycle.md` and `docs/spec/docs-work-system.md`
- [x] Sort SPEC_INDEX by domain→state→id
- [x] Create `work/initiatives/` and `work/issues/` directories
- [x] Add `## Schema` and `## File Pointers` sections to spec template
- [x] Merge initiative Roadmap + Work Items into unified deliverable tables
- [x] Classify all legacy docs (this table)

### Next Steps

- [x] Agent scan: populate destination columns for all unmigrated docs
- [ ] Proof-of-concept: migrate GRAPH_EXECUTION.md (split → spec + initiative)
- [ ] Strip roadmap content from `docs/spec/scheduler.md` → initiative
- [ ] Strip roadmap content from `docs/spec/rbac.md` → initiative
- [ ] Update `docs/README.md` schema section to match new format

### Post-Migration Tasks

- [ ] All `Refs` checkboxes in migration table are checked (references updated)
- [ ] `.claude/commands/` updated to reference new doc/work locations and follow workflow conventions per `ini.development-workflows`
- [ ] Update SPEC_INDEX.md with each newly migrated spec
- [ ] Create redirect stubs at all original locations
- [ ] Verify `pnpm check:docs` passes after each batch

## Content State Legend

| Tag          | Meaning                                                        |
| ------------ | -------------------------------------------------------------- |
| `migrated`   | Content moved to `docs/spec/`; original needs redirect stub    |
| `as-built`   | Describes implemented code; clean spec migration               |
| `AB+road`    | Mixed: as-built invariants + P1/P2 checklists; needs 1:N split |
| `roadmap`    | Primarily future/planned work; becomes initiative              |
| `procedural` | Howto / setup steps; becomes guide                             |
| `snapshot`   | Point-in-time assessment; archive candidate                    |
| `obsolete`   | Superseded or historical; archive or delete                    |

## Migration Table

Destination columns: `filename.md` = planned output, `-` = not applicable.

Paths are relative to their type directory: Spec → `docs/spec/`, Ini → `work/initiatives/`, WI → `work/issues/`, Guide → `docs/guides/`.

| Original                             | Spec                           | Ini                                | WI  | Guide                    | State      | Done | Refs |
| ------------------------------------ | ------------------------------ | ---------------------------------- | --- | ------------------------ | ---------- | :--: | :--: |
| ACCOUNTS_API_KEY_ENDPOINTS.md        | accounts-api-endpoints.md      | ini.accounts-api-keys.md           | -   | -                        | AB+road    | [ ]  | [ ]  |
| ACCOUNTS_DESIGN.md                   | accounts-design.md             | ini.accounts-api-keys.md           | -   | -                        | AB+road    | [ ]  | [ ]  |
| ACTIVITY_METRICS.md                  | activity-metrics.md            | -                                  | -   | -                        | as-built   | [ ]  | [ ]  |
| AGENTS_CONTEXT.md                    | -                              | -                                  | -   | agents-context.md        | procedural | [ ]  | [ ]  |
| AGENT_DEVELOPMENT_GUIDE.md           | -                              | -                                  | -   | agent-development.md     | procedural | [ ]  | [ ]  |
| AGENT_DISCOVERY.md                   | agent-discovery.md             | -                                  | -   | -                        | as-built   | [ ]  | [ ]  |
| AGENT_REGISTRY_SPEC.md               | agent-registry.md              | ini.agent-registry.md              | -   | -                        | roadmap    | [ ]  | [ ]  |
| AI_EVALS.md                          | ai-evals.md                    | -                                  | -   | -                        | as-built   | [ ]  | [ ]  |
| AI_GOVERNANCE_DATA.md                | ai-governance-data.md          | ini.governance-agents.md           | -   | -                        | AB+road    | [ ]  | [ ]  |
| AI_SETUP_SPEC.md                     | ai-setup.md                    | -                                  | -   | -                        | migrated   | [x]  | [ ]  |
| ALLOY_LOKI_SETUP.md                  | -                              | -                                  | -   | alloy-loki-setup.md      | procedural | [ ]  | [ ]  |
| ARCHITECTURE.md                      | architecture.md                | -                                  | -   | -                        | migrated   | [x]  | [ ]  |
| ARCHITECTURE_ENFORCEMENT_GAPS.md     | -                              | -                                  | -   | -                        | snapshot   | [ ]  | [ ]  |
| AUTHENTICATION.md                    | authentication.md              | -                                  | -   | -                        | as-built   | [ ]  | [ ]  |
| BILLING_EVOLUTION.md                 | billing-evolution.md           | -                                  | -   | -                        | as-built   | [ ]  | [ ]  |
| BUILD_ARCHITECTURE.md                | build-architecture.md          | -                                  | -   | -                        | as-built   | [ ]  | [ ]  |
| CACHING.md                           | -                              | ini.caching.md                     | -   | -                        | roadmap    | [ ]  | [ ]  |
| CHAIN_ACTION_FLOW_UI_SPEC.md         | chain-action-flow-ui.md        | -                                  | -   | -                        | as-built   | [ ]  | [ ]  |
| CHAIN_CONFIG.md                      | chain-config.md                | -                                  | -   | -                        | as-built   | [ ]  | [ ]  |
| CHAIN_DEPLOYMENT_TECH_DEBT.md        | -                              | ini.chain-deployment-refactor.md   | -   | -                        | roadmap    | [ ]  | [ ]  |
| CHECK_FULL.md                        | check-full.md                  | -                                  | -   | -                        | as-built   | [ ]  | [ ]  |
| CI-CD.md                             | ci-cd.md                       | -                                  | -   | -                        | migrated   | [x]  | [ ]  |
| CICD_SERVICES_ROADMAP.md             | -                              | ini.cicd-services-gitops.md        | -   | -                        | roadmap    | [ ]  | [ ]  |
| CLAUDE_SDK_ADAPTER_SPEC.md           | claude-sdk-adapter.md          | ini.claude-sdk-adapter.md          | -   | -                        | roadmap    | [ ]  | [ ]  |
| CLAWDBOT_ADAPTER_SPEC.md             | clawdbot-adapter.md            | ini.clawdbot-executor.md           | -   | -                        | roadmap    | [ ]  | [ ]  |
| COGNI_BRAIN_SPEC.md                  | cogni-brain.md                 | -                                  | -   | -                        | migrated   | [x]  | [ ]  |
| CREDITS_PAGE_UI_CONSOLIDATION.md     | -                              | -                                  | -   | -                        | snapshot   | [ ]  | [ ]  |
| CRED_LICENSING_POLICY_SPEC.md        | cred-licensing-policy.md       | ini.cred-licensing.md              | -   | -                        | roadmap    | [ ]  | [ ]  |
| DAO_ENFORCEMENT.md                   | dao-enforcement.md             | -                                  | -   | -                        | as-built   | [ ]  | [ ]  |
| DATABASES.md                         | databases.md                   | -                                  | -   | -                        | migrated   | [x]  | [ ]  |
| DATABASE_RLS_SPEC.md                 | database-rls.md                | -                                  | -   | -                        | as-built   | [ ]  | [ ]  |
| DATABASE_URL_ALIGNMENT_SPEC.md       | database-url-alignment.md      | -                                  | -   | -                        | as-built   | [ ]  | [ ]  |
| DOCS_ORGANIZATION_PLAN.md            | -                              | -                                  | -   | -                        | snapshot   | [ ]  | [ ]  |
| ENVIRONMENTS.md                      | environments.md                | -                                  | -   | -                        | as-built   | [ ]  | [ ]  |
| ERROR_HANDLING_ARCHITECTURE.md       | error-handling.md              | -                                  | -   | -                        | as-built   | [ ]  | [ ]  |
| ERROR_HANDLING_IMPROVEMENT_DESIGN.md | -                              | ini.error-handling-improvements.md | -   | -                        | roadmap    | [ ]  | [ ]  |
| EXTERNAL_EXECUTOR_BILLING.md         | external-executor-billing.md   | -                                  | -   | -                        | as-built   | [ ]  | [ ]  |
| FEATURE_DEVELOPMENT_GUIDE.md         | -                              | -                                  | -   | feature-development.md   | procedural | [ ]  | [ ]  |
| GIT_SYNC_REPO_MOUNT.md               | git-sync-repo-mount.md         | -                                  | -   | -                        | as-built   | [ ]  | [ ]  |
| GOV_DATA_COLLECTORS.md               | gov-data-collectors.md         | -                                  | -   | -                        | as-built   | [ ]  | [ ]  |
| GRAPH_EXECUTION.md                   | graph-execution.md             | ini.graph-execution.md             | -   | -                        | AB+road    | [ ]  | [ ]  |
| HANDOFF_TAILWIND_SPACING_BUG.md      | -                              | -                                  | -   | -                        | obsolete   | [ ]  | [ ]  |
| HANDOFF_WALLET_BUTTON_STABILITY.md   | -                              | -                                  | -   | -                        | obsolete   | [ ]  | [ ]  |
| HUMAN_IN_THE_LOOP.md                 | human-in-the-loop.md           | ini.hil-graphs.md                  | -   | -                        | AB+road    | [ ]  | [ ]  |
| INTEGRATION_WALLETS_CREDITS.md       | -                              | -                                  | -   | wallet-auth-setup.md     | procedural | [ ]  | [ ]  |
| ISOLATE_LITELLM_DATABASE.md          | -                              | -                                  | -   | -                        | obsolete   | [ ]  | [ ]  |
| LANGGRAPH_AI.md                      | langgraph-patterns.md          | -                                  | -   | langgraph-guide.md       | AB+road    | [ ]  | [ ]  |
| LANGGRAPH_SERVER.md                  | langgraph-server.md            | ini.langgraph-server-production.md | -   | langgraph-server-dev.md  | AB+road    | [ ]  | [ ]  |
| LINTING_RULES.md                     | -                              | -                                  | -   | linting-migration.md     | snapshot   | [ ]  | [ ]  |
| METRICS_OBSERVABILITY.md             | -                              | ini.public-analytics.md            | -   | -                        | roadmap    | [ ]  | [ ]  |
| MODEL_SELECTION.md                   | model-selection.md             | -                                  | -   | -                        | as-built   | [ ]  | [ ]  |
| MVP_DELIVERABLES.md                  | -                              | -                                  | -   | -                        | snapshot   | [ ]  | [ ]  |
| N8N_ADAPTER_SPEC.md                  | n8n-adapter.md                 | ini.n8n-integration.md             | -   | -                        | roadmap    | [ ]  | [ ]  |
| NEW_PACKAGES.md                      | -                              | -                                  | -   | new-packages.md          | procedural | [ ]  | [ ]  |
| NODE_CI_CD_CONTRACT.md               | node-ci-cd-contract.md         | ini.ci-cd-reusable.md              | -   | -                        | AB+road    | [ ]  | [ ]  |
| NODE_FORMATION_SPEC.md               | node-formation.md              | ini.node-formation-ui.md           | -   | node-formation-guide.md  | AB+road    | [ ]  | [ ]  |
| NODE_VS_OPERATOR_CONTRACT.md         | node-operator-contract.md      | -                                  | -   | -                        | as-built   | [ ]  | [ ]  |
| OBSERVABILITY.md                     | observability.md               | -                                  | -   | -                        | migrated   | [x]  | [ ]  |
| OBSERVABILITY_REQUIRED_SPEC.md       | observability-requirements.md  | ini.observability-hardening.md     | -   | -                        | AB+road    | [ ]  | [ ]  |
| ONCHAIN_READERS.md                   | onchain-readers.md             | ini.onchain-indexer.md             | -   | -                        | AB+road    | [ ]  | [ ]  |
| PACKAGES_ARCHITECTURE.md             | packages-architecture.md       | -                                  | -   | -                        | as-built   | [ ]  | [ ]  |
| PAYMENTS_DESIGN.md                   | payments-design.md             | ini.payments-enhancements.md       | -   | payments-setup.md        | AB+road    | [ ]  | [ ]  |
| PAYMENTS_FRONTEND_DESIGN.md          | -                              | -                                  | -   | -                        | obsolete   | [ ]  | [ ]  |
| PAYMENTS_TEST_DESIGN.md              | -                              | -                                  | -   | -                        | obsolete   | [ ]  | [ ]  |
| PROMPT_REGISTRY_SPEC.md              | prompt-registry.md             | ini.prompt-registry.md             | -   | -                        | roadmap    | [ ]  | [ ]  |
| PROPOSAL_LAUNCHER.md                 | proposal-launcher.md           | ini.proposal-launcher.md           | -   | -                        | roadmap    | [ ]  | [ ]  |
| RBAC_SPEC.md                         | rbac.md                        | ini.rbac-hardening.md              | -   | -                        | migrated   | [x]  | [ ]  |
| REPO_STATE.md                        | -                              | -                                  | -   | -                        | snapshot   | [ ]  | [ ]  |
| RUNTIME_POLICY.md                    | runtime-policy.md              | -                                  | -   | -                        | as-built   | [ ]  | [ ]  |
| SANDBOXED_AGENTS.md                  | sandboxed-agents.md            | ini.sandboxed-agents.md            | -   | -                        | AB+road    | [ ]  | [ ]  |
| SCHEDULER_SPEC.md                    | scheduler.md                   | ini.scheduler-evolution.md         | -   | -                        | migrated   | [x]  | [ ]  |
| SECURITY_AUTH_SPEC.md                | security-auth.md               | -                                  | -   | -                        | as-built   | [ ]  | [ ]  |
| SERVICES_ARCHITECTURE.md             | services-architecture.md       | -                                  | -   | services-overview.md     | as-built   | [ ]  | [ ]  |
| SERVICES_MIGRATION.md                | -                              | ini.services-migration.md          | -   | -                        | roadmap    | [ ]  | [ ]  |
| SETUP.md                             | -                              | -                                  | -   | developer-setup.md       | procedural | [ ]  | [ ]  |
| SOURCECRED.md                        | sourcecred.md                  | -                                  | -   | sourcecred-operations.md | AB+road    | [ ]  | [ ]  |
| SOURCECRED_CONFIG_RATIONALE.md       | sourcecred-config-rationale.md | -                                  | -   | -                        | as-built   | [ ]  | [ ]  |
| STYLE.md                             | style.md                       | -                                  | -   | -                        | migrated   | [x]  | [ ]  |
| SYSTEM_TENANT_DESIGN.md              | system-tenant.md               | -                                  | -   | -                        | AB+road    | [ ]  | [ ]  |
| TEMPORAL_PATTERNS.md                 | temporal-patterns.md           | -                                  | -   | -                        | as-built   | [ ]  | [ ]  |
| TENANT_CONNECTIONS_SPEC.md           | tenant-connections.md          | ini.tenant-connections.md          | -   | -                        | AB+road    | [ ]  | [ ]  |
| TESTING.md                           | -                              | -                                  | -   | testing.md               | procedural | [ ]  | [ ]  |
| TOOLS_AUTHORING.md                   | -                              | -                                  | -   | tools-authoring.md       | procedural | [ ]  | [ ]  |
| TOOL_USE_SPEC.md                     | tool-use.md                    | ini.tool-use-evolution.md          | -   | -                        | AB+road    | [ ]  | [ ]  |
| UI_CLEANUP_CHECKLIST.md              | -                              | -                                  | -   | -                        | obsolete   | [ ]  | [ ]  |
| UI_CLEANUP_PLAN.md                   | -                              | -                                  | -   | -                        | obsolete   | [ ]  | [ ]  |
| UI_IMPLEMENTATION_GUIDE.md           | ui-implementation.md           | -                                  | -   | -                        | as-built   | [ ]  | [ ]  |
| UNIFIED_GRAPH_LAUNCH_SPEC.md         | unified-graph-launch.md        | -                                  | -   | -                        | AB+road    | [ ]  | [ ]  |
| USAGE_HISTORY.md                     | usage-history.md               | -                                  | -   | -                        | AB+road    | [ ]  | [ ]  |
| VERCEL_AI_STREAMING.md               | -                              | -                                  | -   | -                        | obsolete   | [ ]  | [ ]  |
| archive/COMPLETION_REFACTOR_PLAN.md  | -                              | -                                  | -   | -                        | obsolete   | [ ]  | [ ]  |
| archive/DEPAY_PAYMENTS.md            | -                              | -                                  | -   | -                        | obsolete   | [ ]  | [ ]  |
| archive/FIX_AI_STREAMING_PIPELINE.md | -                              | -                                  | -   | -                        | obsolete   | [ ]  | [ ]  |
| archive/PAYMENTS_WIDGET_DECISION.md  | -                              | -                                  | -   | -                        | obsolete   | [ ]  | [ ]  |
| archive/triggerdev_analysis.md       | -                              | -                                  | -   | -                        | obsolete   | [ ]  | [ ]  |
| dev/TOOL_STREAMING_ISSUE.md          | -                              | -                                  | -   | -                        | snapshot   | [ ]  | [ ]  |
| features/HEALTH_PROBES.md            | health-probes.md               | -                                  | -   | -                        | AB+road    | [ ]  | [ ]  |
| introspection/2026-01-19-\*.md       | -                              | -                                  | -   | -                        | snapshot   | [ ]  | [ ]  |
| introspection/2026-01-21-\*.md       | -                              | -                                  | -   | -                        | snapshot   | [ ]  | [ ]  |
| postmortems/2026-01-25-\*.md         | -                              | -                                  | -   | -                        | snapshot   | [ ]  | [ ]  |

## Summary

- **Total legacy docs**: ~100 (9 migrated, 91 remaining)
- **Spec destinations**: 55 (including 9 migrated)
- **Initiative destinations**: 30 (roadmap content extracted from specs)
- **Guide destinations**: 13
- **Obsolete / archive**: 15
- **Snapshot / no destination**: 8
- **WI column**: 0 (no docs produced standalone WIs — tasks tracked via initiatives)

## Agent Scan Flags

Content that doesn't cleanly fit the 4 types:

- **ARCHITECTURE_ENFORCEMENT_GAPS.md** — meta-snapshot of enforcement coverage; not a spec/guide/ini
- **CREDITS_PAGE_UI_CONSOLIDATION.md** — completed UI refactor plan; more postmortem than roadmap
- **DOCS_ORGANIZATION_PLAN.md** — superseded by `docs/spec/docs-work-system.md`; archive candidate
- **MVP_DELIVERABLES.md** — MVP scope snapshot (dated); planning artifact, not ongoing roadmap
- **REPO_STATE.md** — point-in-time repo assessment; archive candidate
- **LINTING_RULES.md** — rule inventory with Biome migration feasibility; reference snapshot
- **PAYMENTS_FRONTEND_DESIGN.md** / **PAYMENTS_TEST_DESIGN.md** — work is complete; obsolete
- **postmortems/**, **introspection/** — incident/review docs; snapshots, not guides
- **archive/PAYMENTS_WIDGET_DECISION.md** — ADR candidate (DePay vs Resmic decision)

## PR Checklist

- [ ] **Work Item:** wi.docs-migration-tracker
- [ ] **Spec:** docs/spec/spec-project-lifecycle.md#core-invariants
- [ ] **Invariants Validated:** SPEC_STATE_LIFECYCLE, INV-SPEC-SCOPE-001

## Validation

**Command:**

```bash
node scripts/validate-docs-metadata.mjs
```

**Expected:** All migrated docs pass validation.

## Notes

- **PIVOT**: Switched from Logseq `key::` to Obsidian YAML frontmatter (done)
- 9 already-migrated specs converted to YAML frontmatter (done, `pnpm check:docs` green)
- All migrated docs use `trust: draft` (upgrade later after review)
- Many legacy docs are conglomerates — ~30 produce both spec + initiative
- GRAPH_EXECUTION.md (1023 lines) is the highest-priority split candidate
- Proof-of-concept migration order: GRAPH_EXECUTION → then batch the clean single-type docs
- Several docs reclassified by agent scan (e.g., BUILD_ARCHITECTURE, CHECK_FULL, ENVIRONMENTS → spec not guide)
- RBAC + SCHEDULER already migrated but have roadmap content to extract into initiatives
- WI column is empty — no docs produced standalone work items; tasks are tracked via initiatives
