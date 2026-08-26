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
 * Side-effects: IO (cookie read)
 * @public
 */

import { cookies } from "next/headers";
import Link from "next/link";

import { authSecret } from "@/auth";
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
      <main className="mx-auto max-w-xl px-6 py-16">
        <h1 className="font-semibold text-xl">
          This verification request expired
        </h1>
        <p className="mt-3 text-muted-foreground text-sm">
          Return to the node and start GitHub verification again from your
          profile.
        </p>
      </main>
    );
  }

  const { github, nodeSlug, targetOrigin } = brokerState;
  const displayLogin = github.login ? `@${github.login}` : `id ${github.id}`;

  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <h1 className="font-semibold text-xl">Confirm GitHub verification</h1>

      <p className="mt-4 text-sm">
        You signed in to GitHub as <strong>{displayLogin}</strong>.
      </p>
      <p className="mt-2 text-sm">
        Verify this GitHub account for the node <strong>{nodeSlug}</strong> at{" "}
        <strong>{targetOrigin}</strong>?
      </p>
      <p className="mt-4 text-muted-foreground text-sm">
        Only this GitHub account&apos;s public identity is shared. Your operator
        account, wallet, and any other links are never sent to the node — the
        node records this GitHub identity against its own local account.
      </p>

      <form
        action="/api/v1/public/identity/attest/confirm"
        className="mt-8 flex flex-wrap gap-3"
        method="post"
      >
        <button
          className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground text-sm"
          name="action"
          type="submit"
          value="confirm"
        >
          Verify {displayLogin}
        </button>
        <button
          className="rounded-md border px-4 py-2 font-medium text-sm"
          name="action"
          type="submit"
          value="switch"
        >
          Use a different account
        </button>
        <button
          className="rounded-md border px-4 py-2 font-medium text-sm"
          name="action"
          type="submit"
          value="cancel"
        >
          Cancel
        </button>
      </form>

      <p className="mt-6 text-muted-foreground text-xs">
        Wrong account?{" "}
        <Link className="underline" href="https://github.com/logout">
          Sign out of GitHub
        </Link>{" "}
        first, then choose &quot;Use a different account&quot;.
      </p>
    </main>
  );
}
