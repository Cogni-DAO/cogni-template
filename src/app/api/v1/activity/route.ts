// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

import { NextResponse } from "next/server";

import { getActivity } from "@/app/_facades/ai/activity.server";
import { aiActivityOperation } from "@/contracts/ai.activity.v1.contract";
import { getServerSessionUser } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getServerSessionUser();
  if (!user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(request.url);

  // Parse and validate input
  const inputResult = aiActivityOperation.input.safeParse({
    from: searchParams.get("from"),
    to: searchParams.get("to"),
    groupBy: searchParams.get("groupBy"),
    cursor: searchParams.get("cursor") || undefined,
    limit: searchParams.has("limit")
      ? Number.parseInt(searchParams.get("limit") || "20", 10)
      : undefined,
  });

  if (!inputResult.success) {
    return NextResponse.json(
      { error: "Invalid input", details: inputResult.error.format() },
      { status: 400 }
    );
  }

  try {
    const data = await getActivity({
      ...inputResult.data,
      sessionUser: user,
    });

    return NextResponse.json(data);
  } catch (_error) {
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
