// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

/**
 * Module: `@app/(app)/identity/attest/confirm`
 * Purpose: The explicit account-intent gate. Names the GitHub account GitHub actually
 *   authenticated and the node that asked, and requires a deliberate confirmation
 *   before anything is signed.
 * Scope: Renders the broker cookie's resolved state. Signs nothing; the form posts to
 *   the confirm route.
 * Invariants:
 *   - INTENT_IS_EXPLICIT: `prompt=select_account` forces GitHub's picker but does NOT
 *     prove intent — it cannot force credential re-entry and is undocumented for the
 *     zero/one-account case. This screen is the only thing that proves the human meant
 *     THIS account for THIS node (task.5024).
 *   - NO_SILENT_ISSUANCE: there is no auto-submit and no redirect-on-render.
 *   - SHARED_CHROME: uses PageContainer/SectionCard/Button so the one human gate in the
 *     flow looks like the rest of the product, not a bare HTML page.
 * Side-effects: IO (cookie read)
 * @public
 */

import { cookies } from "next/headers";

import { authSecret } from "@/auth";
import { Button, PageContainer, SectionCard } from "@/components";
import {
  BROKER_STATE_COOKIE,
  decodeBrokerState,
} from "@/shared/identity/broker-state";

export const dynamic = "force-dynamic";

export default async function IdentityAttestationConfirmPage() {
  const cookieStore = await cookies();
  const brokerState = await decodeBrokerState(
    cookieStore.get(BROKER_STATE_COOKIE)?.value,
    authSecret
  );

  if (!brokerState?.github) {
    return (
      <PageContainer maxWidth="xl">
        <SectionCard title="This verification request expired">
          <p className="text-muted-foreground text-sm">
            Return to the node and start GitHub verification again from your
            profile. Nothing was shared.
          </p>
        </SectionCard>
      </PageContainer>
    );
  }

  const { github, nodeSlug, targetOrigin } = brokerState;
  const displayLogin = github.login ? `@${github.login}` : `id ${github.id}`;

  return (
    <PageContainer maxWidth="xl">
      <SectionCard title="Confirm GitHub verification">
        <div className="space-y-3 text-sm">
          <p>
            You signed in to GitHub as{" "}
            <strong className="font-semibold">{displayLogin}</strong>.
          </p>
          <p>
            Verify this GitHub account for the node{" "}
            <strong className="font-semibold">{nodeSlug}</strong> at{" "}
            <span className="font-mono text-xs">{targetOrigin}</span>?
          </p>
          <p className="text-muted-foreground">
            Only this GitHub account&apos;s public identity is shared. Your
            operator account, wallet, and any other links are never sent to the
            node — the node records this GitHub identity against its own local
            account.
          </p>
        </div>

        <form
          action="/api/auth/attest/confirm"
          className="flex flex-wrap gap-3"
          method="post"
        >
          <Button name="action" type="submit" value="confirm">
            Verify {displayLogin}
          </Button>
          <Button name="action" type="submit" value="switch" variant="outline">
            Use a different account
          </Button>
          <Button name="action" type="submit" value="cancel" variant="ghost">
            Cancel
          </Button>
        </form>

        <p className="text-muted-foreground text-xs">
          Wrong account? Sign out of GitHub first, then choose &quot;Use a
          different account&quot;.
        </p>
      </SectionCard>
    </PageContainer>
  );
}
