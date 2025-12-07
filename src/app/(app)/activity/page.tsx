// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/(app)/activity/page`
 * Purpose: Activity dashboard page.
 * Scope: Fetches initial data server-side and renders view. Does not handle client interactions.
 * Invariants: Protected route (server-side auth check).
 * Side-effects: IO
 * Links: [ActivityView](./view.tsx)
 * @public
 */

import { redirect } from "next/navigation";

import { getActivity } from "@/app/_facades/ai/activity.server";
import { getServerSessionUser } from "@/lib/auth/server";
import { ActivityView } from "./view";

export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  const user = await getServerSessionUser();
  if (!user) {
    redirect("/");
  }

  // Default to last 30 days
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);

  const data = await getActivity({
    sessionUser: user,
    from: from.toISOString(),
    to: to.toISOString(),
    groupBy: "day",
    limit: 20,
  });

  return <ActivityView initialData={data} />;
}
