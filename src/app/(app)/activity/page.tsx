// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

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
