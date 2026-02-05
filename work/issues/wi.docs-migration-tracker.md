---
work_item_id: wi.docs-migration-tracker
work_item_type: issue
title: Docs Migration Tracker
state: In Progress
priority: High
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

### Pre-Migration Tasks

**Template Design (Obsidian YAML v0):**

- [x] Define v0 template: `docs/_templates/spec.md`
- [x] Define v0 template: `docs/_templates/guide.md`
- [x] Define v0 template: `docs/_templates/decision.md`
- [x] Define v0 template: `work/_templates/project.md`
- [x] Define v0 template: `work/_templates/issue.md`
- [ ] Update `docs/README.md` schema section to match new format

**Validator Updates:**

- [ ] Add `yaml` or `js-yaml` dev dependency for proper YAML parsing
- [ ] Rewrite `scripts/validate-docs-metadata.mjs` with new rules:
  - dir→type match (`docs/spec/**` ⇒ `type: spec`, etc.)
  - required keys: `id`, `type`, `status`, `trust`, `created`, `spec_state`
  - `verified` optional when `status: draft`; otherwise required
  - enums for type/status/trust/spec_state
  - date format YYYY-MM-DD for created/verified
  - global uniqueness of `id` across typed docs
  - Open Questions must be empty when `spec_state: active`
- [ ] Convert 9 already-migrated specs from Logseq `key::` to YAML frontmatter

### Post-Migration Tasks

- [ ] Create redirect stubs at all original locations
- [ ] Update SPEC_INDEX.md with migrated specs
- [ ] Update root AGENTS.md pointers
- [ ] Verify pnpm check:docs:metadata passes

## Frontmatter Schema (v0)

```yaml
---
id: kebab-case-unique-id
type: spec
title: Document Title
status: active
spec_state: proposed
trust: draft
summary: One-line description
read_when: When to read this doc
implements: wi.work-item-id
owner: derekg1729
created: 2026-02-05
verified: 2026-02-05
tags: [optional]
---
```

## Migration Checklist

| Original                                                            | Destination                      | Moved | Template | Refs Updated |
| ------------------------------------------------------------------- | -------------------------------- | :---: | :------: | :----------: |
| ACCOUNTS_API_KEY_ENDPOINTS.md                                       |                                  |  [ ]  |   [ ]    |     [ ]      |
| ACCOUNTS_DESIGN.md                                                  |                                  |  [ ]  |   [ ]    |     [ ]      |
| ACTIVITY_METRICS.md                                                 |                                  |  [ ]  |   [ ]    |     [ ]      |
| AGENTS_CONTEXT.md                                                   |                                  |  [ ]  |   [ ]    |     [ ]      |
| AGENT_DEVELOPMENT_GUIDE.md                                          | guides/agent-development.md      |  [ ]  |   [ ]    |     [ ]      |
| AGENT_DISCOVERY.md                                                  |                                  |  [ ]  |   [ ]    |     [ ]      |
| AGENT_REGISTRY_SPEC.md                                              | spec/agent-registry.md           |  [ ]  |   [ ]    |     [ ]      |
| AI_EVALS.md                                                         |                                  |  [ ]  |   [ ]    |     [ ]      |
| AI_GOVERNANCE_DATA.md                                               |                                  |  [ ]  |   [ ]    |     [ ]      |
| AI_SETUP_SPEC.md                                                    | spec/ai-setup.md                 |  [x]  |   [x]    |     [ ]      |
| ALLOY_LOKI_SETUP.md                                                 | guides/alloy-loki-setup.md       |  [ ]  |   [ ]    |     [ ]      |
| ARCHITECTURE.md                                                     | spec/architecture.md             |  [x]  |   [x]    |     [ ]      |
| ARCHITECTURE_ENFORCEMENT_GAPS.md                                    |                                  |  [ ]  |   [ ]    |     [ ]      |
| AUTHENTICATION.md                                                   |                                  |  [ ]  |   [ ]    |     [ ]      |
| BILLING_EVOLUTION.md                                                |                                  |  [ ]  |   [ ]    |     [ ]      |
| BUILD_ARCHITECTURE.md                                               |                                  |  [ ]  |   [ ]    |     [ ]      |
| CACHING.md                                                          |                                  |  [ ]  |   [ ]    |     [ ]      |
| CHAIN_ACTION_FLOW_UI_SPEC.md                                        | spec/chain-action-flow-ui.md     |  [ ]  |   [ ]    |     [ ]      |
| CHAIN_CONFIG.md                                                     |                                  |  [ ]  |   [ ]    |     [ ]      |
| CHAIN_DEPLOYMENT_TECH_DEBT.md                                       |                                  |  [ ]  |   [ ]    |     [ ]      |
| CHECK_FULL.md                                                       |                                  |  [ ]  |   [ ]    |     [ ]      |
| CI-CD.md                                                            | spec/ci-cd.md                    |  [x]  |   [x]    |     [ ]      |
| CICD_SERVICES_ROADMAP.md                                            |                                  |  [ ]  |   [ ]    |     [ ]      |
| CLAUDE_SDK_ADAPTER_SPEC.md                                          | spec/claude-sdk-adapter.md       |  [ ]  |   [ ]    |     [ ]      |
| CLAWDBOT_ADAPTER_SPEC.md                                            | spec/clawdbot-adapter.md         |  [ ]  |   [ ]    |     [ ]      |
| COGNI_BRAIN_SPEC.md                                                 | spec/cogni-brain.md              |  [x]  |   [x]    |     [ ]      |
| CREDITS_PAGE_UI_CONSOLIDATION.md                                    |                                  |  [ ]  |   [ ]    |     [ ]      |
| CRED_LICENSING_POLICY_SPEC.md                                       | spec/cred-licensing-policy.md    |  [ ]  |   [ ]    |     [ ]      |
| DAO_ENFORCEMENT.md                                                  |                                  |  [ ]  |   [ ]    |     [ ]      |
| DATABASES.md                                                        | spec/databases.md                |  [x]  |   [x]    |     [ ]      |
| DATABASE_RLS_SPEC.md                                                | spec/database-rls.md             |  [ ]  |   [ ]    |     [ ]      |
| DATABASE_URL_ALIGNMENT_SPEC.md                                      | spec/database-url-alignment.md   |  [ ]  |   [ ]    |     [ ]      |
| ENVIRONMENTS.md                                                     |                                  |  [ ]  |   [ ]    |     [ ]      |
| ERROR_HANDLING_ARCHITECTURE.md                                      |                                  |  [ ]  |   [ ]    |     [ ]      |
| ERROR_HANDLING_IMPROVEMENT_DESIGN.md                                |                                  |  [ ]  |   [ ]    |     [ ]      |
| EXTERNAL_EXECUTOR_BILLING.md                                        |                                  |  [ ]  |   [ ]    |     [ ]      |
| FEATURE_DEVELOPMENT_GUIDE.md                                        | guides/feature-development.md    |  [ ]  |   [ ]    |     [ ]      |
| GIT_SYNC_REPO_MOUNT.md                                              |                                  |  [ ]  |   [ ]    |     [ ]      |
| GOV_DATA_COLLECTORS.md                                              |                                  |  [ ]  |   [ ]    |     [ ]      |
| GRAPH_EXECUTION.md                                                  |                                  |  [ ]  |   [ ]    |     [ ]      |
| HANDOFF_TAILWIND_SPACING_BUG.md                                     |                                  |  [ ]  |   [ ]    |     [ ]      |
| HANDOFF_WALLET_BUTTON_STABILITY.md                                  |                                  |  [ ]  |   [ ]    |     [ ]      |
| HUMAN_IN_THE_LOOP.md                                                |                                  |  [ ]  |   [ ]    |     [ ]      |
| INTEGRATION_WALLETS_CREDITS.md                                      |                                  |  [ ]  |   [ ]    |     [ ]      |
| ISOLATE_LITELLM_DATABASE.md                                         |                                  |  [ ]  |   [ ]    |     [ ]      |
| LANGGRAPH_AI.md                                                     |                                  |  [ ]  |   [ ]    |     [ ]      |
| LANGGRAPH_SERVER.md                                                 |                                  |  [ ]  |   [ ]    |     [ ]      |
| LINTING_RULES.md                                                    |                                  |  [ ]  |   [ ]    |     [ ]      |
| METRICS_OBSERVABILITY.md                                            |                                  |  [ ]  |   [ ]    |     [ ]      |
| MODEL_SELECTION.md                                                  |                                  |  [ ]  |   [ ]    |     [ ]      |
| MVP_DELIVERABLES.md                                                 |                                  |  [ ]  |   [ ]    |     [ ]      |
| N8N_ADAPTER_SPEC.md                                                 | spec/n8n-adapter.md              |  [ ]  |   [ ]    |     [ ]      |
| NEW_PACKAGES.md                                                     |                                  |  [ ]  |   [ ]    |     [ ]      |
| NODE_CI_CD_CONTRACT.md                                              |                                  |  [ ]  |   [ ]    |     [ ]      |
| NODE_FORMATION_SPEC.md                                              | spec/node-formation.md           |  [ ]  |   [ ]    |     [ ]      |
| NODE_VS_OPERATOR_CONTRACT.md                                        |                                  |  [ ]  |   [ ]    |     [ ]      |
| OBSERVABILITY.md                                                    | spec/observability.md            |  [x]  |   [x]    |     [ ]      |
| OBSERVABILITY_REQUIRED_SPEC.md                                      | spec/observability-required.md   |  [ ]  |   [ ]    |     [ ]      |
| ONCHAIN_READERS.md                                                  |                                  |  [ ]  |   [ ]    |     [ ]      |
| PACKAGES_ARCHITECTURE.md                                            |                                  |  [ ]  |   [ ]    |     [ ]      |
| PAYMENTS_DESIGN.md                                                  |                                  |  [ ]  |   [ ]    |     [ ]      |
| PAYMENTS_FRONTEND_DESIGN.md                                         |                                  |  [ ]  |   [ ]    |     [ ]      |
| PAYMENTS_TEST_DESIGN.md                                             |                                  |  [ ]  |   [ ]    |     [ ]      |
| PROMPT_REGISTRY_SPEC.md                                             | spec/prompt-registry.md          |  [ ]  |   [ ]    |     [ ]      |
| PROPOSAL_LAUNCHER.md                                                |                                  |  [ ]  |   [ ]    |     [ ]      |
| RBAC_SPEC.md                                                        | spec/rbac.md                     |  [x]  |   [x]    |     [ ]      |
| REPO_STATE.md                                                       |                                  |  [ ]  |   [ ]    |     [ ]      |
| RUNTIME_POLICY.md                                                   |                                  |  [ ]  |   [ ]    |     [ ]      |
| SANDBOXED_AGENTS.md                                                 |                                  |  [ ]  |   [ ]    |     [ ]      |
| SCHEDULER_SPEC.md                                                   | spec/scheduler.md                |  [x]  |   [x]    |     [ ]      |
| SECURITY_AUTH_SPEC.md                                               | spec/security-auth.md            |  [ ]  |   [ ]    |     [ ]      |
| SERVICES_ARCHITECTURE.md                                            |                                  |  [ ]  |   [ ]    |     [ ]      |
| SERVICES_MIGRATION.md                                               |                                  |  [ ]  |   [ ]    |     [ ]      |
| SETUP.md                                                            | guides/developer-setup.md        |  [ ]  |   [ ]    |     [ ]      |
| SOURCECRED.md                                                       |                                  |  [ ]  |   [ ]    |     [ ]      |
| SOURCECRED_CONFIG_RATIONALE.md                                      |                                  |  [ ]  |   [ ]    |     [ ]      |
| STYLE.md                                                            | spec/style.md                    |  [x]  |   [x]    |     [ ]      |
| SYSTEM_TENANT_DESIGN.md                                             |                                  |  [ ]  |   [ ]    |     [ ]      |
| TEMPORAL_PATTERNS.md                                                |                                  |  [ ]  |   [ ]    |     [ ]      |
| TENANT_CONNECTIONS_SPEC.md                                          | spec/tenant-connections.md       |  [ ]  |   [ ]    |     [ ]      |
| TESTING.md                                                          | guides/testing.md                |  [ ]  |   [ ]    |     [ ]      |
| TOOLS_AUTHORING.md                                                  |                                  |  [ ]  |   [ ]    |     [ ]      |
| TOOL_USE_SPEC.md                                                    | spec/tool-use.md                 |  [ ]  |   [ ]    |     [ ]      |
| UI_CLEANUP_CHECKLIST.md                                             |                                  |  [ ]  |   [ ]    |     [ ]      |
| UI_CLEANUP_PLAN.md                                                  |                                  |  [ ]  |   [ ]    |     [ ]      |
| UI_IMPLEMENTATION_GUIDE.md                                          | guides/ui-implementation.md      |  [ ]  |   [ ]    |     [ ]      |
| UNIFIED_GRAPH_LAUNCH_SPEC.md                                        | spec/unified-graph-launch.md     |  [ ]  |   [ ]    |     [ ]      |
| USAGE_HISTORY.md                                                    |                                  |  [ ]  |   [ ]    |     [ ]      |
| VERCEL_AI_STREAMING.md                                              |                                  |  [ ]  |   [ ]    |     [ ]      |
| archive/COMPLETION_REFACTOR_PLAN.md                                 | archive/                         |  [ ]  |   [ ]    |     [ ]      |
| archive/DEPAY_PAYMENTS.md                                           | archive/                         |  [ ]  |   [ ]    |     [ ]      |
| archive/FIX_AI_STREAMING_PIPELINE.md                                | archive/                         |  [ ]  |   [ ]    |     [ ]      |
| archive/PAYMENTS_WIDGET_DECISION.md                                 | decisions/adr/payments-widget.md |  [ ]  |   [ ]    |     [ ]      |
| archive/triggerdev_analysis.md                                      | archive/                         |  [ ]  |   [ ]    |     [ ]      |
| dev/TOOL_STREAMING_ISSUE.md                                         |                                  |  [ ]  |   [ ]    |     [ ]      |
| features/HEALTH_PROBES.md                                           |                                  |  [ ]  |   [ ]    |     [ ]      |
| introspection/2026-01-19-design-review-scheduler-execution-tools.md |                                  |  [ ]  |   [ ]    |     [ ]      |
| introspection/2026-01-21-cross-spec-alignment-review.md             |                                  |  [ ]  |   [ ]    |     [ ]      |
| postmortems/2026-01-25-main-staging-divergence.md                   |                                  |  [ ]  |   [ ]    |     [ ]      |

## Summary

- **Total docs**: 97
- **Migrated**: 9
- **Destination assigned**: 32
- **Needs classification**: 65

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

- **PIVOT**: Switched from Logseq `key::` to Obsidian YAML frontmatter
- 9 docs already moved need conversion from Logseq → YAML format
- All migrated docs use `trust: draft` (upgrade later after review)
- Blank destinations need content review before classification
