// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/(app)/activity/page`
 * Purpose: Activity dashboard page shell.
 * Scope: Auth check only. Does not fetch activity data or implement business logic.
 * Invariants: Protected route (server-side auth check).
 * Side-effects: IO
 * Links: [ActivityView](./view.tsx)
 * @public
 */

import { redirect } from "next/navigation";

import { getServerSessionUser } from "@/lib/auth/server";
import { ActivityView } from "./view";

export default async function ActivityPage() {
  const user = await getServerSessionUser();
  if (!user) {
    redirect("/");
  }

  return <ActivityView />;
}
