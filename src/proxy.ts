// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@/proxy`
 * Purpose: Next.js 16 proxy (formerly middleware) for route protection.
 * Scope: Root-level proxy. Enforces session auth on /api/v1/* routes (except /api/v1/public/*) via NextAuth JWT token inspection. Does not handle public infrastructure endpoints (e.g., /api/metrics, /api/health).
 * Invariants: /api/v1/public/* accessible without auth; other /api/v1/* routes require session; public infra endpoints live outside /api/v1/.
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

  // Allow public namespace without authentication
  if (pathname.startsWith("/api/v1/public/")) {
    return NextResponse.next();
  }

  const tokenSecret = authSecret || authOptions.secret;

  if (!tokenSecret && pathname.startsWith("/api/v1/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token =
    tokenSecret && pathname.startsWith("/api/v1/")
      ? await getToken({
          req,
          secret: tokenSecret,
        })
      : null;

  const isLoggedIn = !!token;

  // Protect /api/v1/* routes (except /api/v1/public/* which was early-returned above)
  // IMPORTANT: All route handlers under /api/v1 must still call getServerSession() server-side.
  // This proxy provides early rejection for unauthenticated requests, but handlers
  // are responsible for their own auth enforcement.
  // Public unauthenticated endpoints must use /api/v1/public/* namespace.
  if (pathname.startsWith("/api/v1/")) {
    if (!isLoggedIn) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  return NextResponse.next();
}

export const config = {
  // Run middleware on ALL /api/v1/* routes for uniform auth perimeter
  matcher: ["/api/v1/:path*"],
};
