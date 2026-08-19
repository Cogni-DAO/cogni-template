// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@shared/config/repoSpec.schema`
 * Purpose: Re-export barrel for @cogni/repo-spec Zod schemas and types. Single source of truth lives in the package.
 * Scope: Re-exports only. Does not define local schemas.
 * Invariants: REPO_SPEC_AUTHORITY — schema lives in @cogni/repo-spec package.
 * Side-effects: none
 * Links: packages/repo-spec/src/schema.ts, .cogni/repo-spec.yaml
 * @public
 */

export {
  type ActivityLedgerSpec,
  type ActivitySourceSpec,
  activityLedgerSpecSchema,
  activitySourceSpecSchema,
  type BudgetPolicySpec,
  budgetPolicySpecSchema,
  type CreditsTopupSpec,
  creditsTopupSpecSchema,
  type GovernanceScheduleSpec,
  type GovernanceSpec,
  governanceScheduleSchema,
  governanceSpecSchema,
  type OperatorWalletSpec,
  operatorWalletSpecSchema,
  type PoolConfigSpec,
  poolConfigSpecSchema,
  type RepoSpec,
  repoSpecSchema,
  scopeIdSchema,
  scopeKeySchema,
} from "@cogni/repo-spec";
