"use client";

// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

/**
 * Module: `@app/(app)/identity/attest/confirm/actions`
 * Purpose: The three terminal actions on the account-intent gate, with a real pending
 *   state — submitting posts a full navigation, so without this the screen sits inert
 *   after the click and reads as broken.
 * Scope: Presentation + submit state only. Decides nothing; the server route owns every
 *   outcome.
 * Invariants:
 *   - NO_AUTO_SUBMIT: nothing fires without a human click. This screen is the account
 *     intent gate (task.5024); an auto-submit would defeat its entire purpose.
 *   - ONE_SUBMIT: once a choice is made all three are disabled, so a double-click cannot
 *     race two terminal actions against one consume-once broker cookie.
 * Side-effects: navigation (form POST)
 * @public
 */

import { Spinner } from "@cogni/node-ui-kit/shadcn/spinner";
import { useState } from "react";

import { Button } from "@/components";

export function ConfirmActions({ login }: { login: string }) {
  const [pending, setPending] = useState<string | null>(null);

  return (
    <form
      action="/api/auth/attest/confirm"
      className="flex flex-wrap items-center gap-2"
      method="post"
      onSubmit={(e) => {
        const action = (e.nativeEvent as SubmitEvent).submitter as
          | HTMLButtonElement
          | undefined;
        setPending(action?.value ?? "confirm");
      }}
    >
      <Button
        disabled={pending !== null}
        name="action"
        type="submit"
        value="confirm"
      >
        {pending === "confirm" ? <Spinner /> : null}
        Link {login}
      </Button>
      <Button
        disabled={pending !== null}
        name="action"
        type="submit"
        value="switch"
        variant="ghost"
      >
        {pending === "switch" ? <Spinner /> : null}
        Switch account
      </Button>
      <Button
        disabled={pending !== null}
        name="action"
        type="submit"
        value="cancel"
        variant="ghost"
      >
        Cancel
      </Button>
    </form>
  );
}
