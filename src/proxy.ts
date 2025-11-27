// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@/proxy`
 * Purpose: Next.js 16 proxy (formerly middleware) for route protection.
 * Scope: Root-level proxy. Enforces session auth on /api/v1/ai/* routes via NextAuth JWT token inspection. Does not handle auth for other API routes.
 * Invariants: Public routes remain accessible; protected routes require valid session.
 * Side-effects: none
 * Links: docs/SECURITY_AUTH_SPEC.md
 * @public
 */

/* eslint-disable boundaries/no-unknown-files */

import { type NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

import { authOptions, authSecret } from "@/auth";

export async function proxy(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;

  const tokenSecret = authSecret || authOptions.secret;

  if (!tokenSecret && pathname.startsWith("/api/v1/ai")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token =
    tokenSecret && pathname.startsWith("/api/v1/ai")
      ? await getToken({
          req,
          secret: tokenSecret,
        })
      : null;

  const isLoggedIn = !!token;

  // Protect /api/v1/ai/* routes (second line of defense)
  // IMPORTANT: All route handlers under /api/v1/ai must still call getServerSession() server-side.
  // This proxy provides early rejection for unauthenticated requests, but handlers
  // are responsible for their own auth enforcement.
  if (pathname.startsWith("/api/v1/ai")) {
    if (!isLoggedIn) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  return NextResponse.next();
}

export const config = {
  // Only run middleware on /api/v1/ai/* routes to avoid unnecessary overhead
  matcher: ["/api/v1/ai/:path*"],
};
