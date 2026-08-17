// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/(app)/gov/review/page`
 * Purpose: Server entrypoint for the epoch review admin page with wallet context.
 * Scope: Server component. Passes the SIWE wallet to the client view, which compares it with each epoch's pinned authority. Does not perform data fetching or mutations.
 * Invariants: REVIEW_AUTHORITY_IS_EPOCH_PINNED; write routes independently enforce authorization. Auth enforced by (app) layout guard.
 * Side-effects: IO (auth session read)
 * Links: src/app/api/v1/attribution/_lib/approver-guard.ts
 * @public
 */

import type { ReactElement } from "react";

import { getServerSessionUser } from "@/lib/auth/server";

import { ReviewView } from "./view";

export default async function ReviewPage(): Promise<ReactElement> {
  const user = await getServerSessionUser();
  return (
    <ReviewView walletAddress={user?.walletAddress?.toLowerCase() ?? null} />
  );
}
