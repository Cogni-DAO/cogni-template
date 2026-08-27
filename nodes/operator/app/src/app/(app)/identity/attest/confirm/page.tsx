// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

/**
 * Module: `@app/(app)/identity/attest/confirm`
 * Purpose: The account-intent gate. Shows which GitHub account GitHub authenticated and
 *   which node is asking, and requires a deliberate click before anything is signed.
 * Scope: Renders the broker cookie's resolved state. Signs nothing.
 * Invariants:
 *   - INTENT_IS_EXPLICIT: `prompt=select_account` forces GitHub's picker but does NOT
 *     prove intent — it cannot force credential re-entry and is undocumented for the
 *     zero/one-account case. This screen is the only thing that proves the human meant
 *     THIS account for THIS node (task.5024).
 *   - NO_SILENT_ISSUANCE: no auto-submit, no redirect-on-render.
 *   - ONE_QUESTION: the screen asks "this account, this node?" and shows nothing that
 *     does not help answer it. Prose here is a bug — a human under a security prompt
 *     reads the identity and the verb, nothing else.
 * Side-effects: IO (cookie read)
 * @public
 */

import { cookies } from "next/headers";

import { authSecret } from "@/auth";
import { PageContainer, SectionCard } from "@/components";
import {
  BROKER_STATE_COOKIE,
  decodeBrokerState,
} from "@/shared/identity/broker-state";

import { ConfirmActions } from "./actions";

export const dynamic = "force-dynamic";

export default async function IdentityAttestationConfirmPage() {
  const cookieStore = await cookies();
  const brokerState = await decodeBrokerState(
    cookieStore.get(BROKER_STATE_COOKIE)?.value,
    authSecret
  );

  if (!brokerState?.github) {
    return (
      <PageContainer maxWidth="sm">
        <SectionCard title="This request expired">
          <p className="text-muted-foreground text-sm">
            Start again from the node&apos;s profile. Nothing was shared.
          </p>
        </SectionCard>
      </PageContainer>
    );
  }

  const { github, nodeSlug } = brokerState;
  const login = github.login ? `@${github.login}` : `id ${github.id}`;

  return (
    <PageContainer maxWidth="sm">
      <SectionCard title="Link account">
        {/* The pairing IS the question. Identity, direction, destination — one line,
            one glance, no prose to wade through under a security prompt. */}
        <div className="space-y-1">
          <p className="font-semibold text-2xl tracking-tight">{login}</p>
          <p className="text-muted-foreground text-sm">→ {nodeSlug}</p>
        </div>

        <ConfirmActions login={login} />

        <p className="text-muted-foreground text-xs">
          Only your public GitHub identity is shared.
        </p>
      </SectionCard>
    </PageContainer>
  );
}
