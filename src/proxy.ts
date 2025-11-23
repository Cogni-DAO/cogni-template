// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@/proxy`
 * Purpose: Next.js 16 proxy (formerly middleware) for route protection.
 * Scope: Root-level proxy. Enforces session auth on /api/v1/ai/* routes via Auth.js auth() wrapper. Does not handle auth for other API routes.
 * Invariants: Public routes remain accessible; protected routes require valid session.
 * Side-effects: none
 * Links: docs/SECURITY_AUTH_SPEC.md
 * @public
 */

/* eslint-disable boundaries/no-unknown-files */

import { NextResponse } from "next/server";

import { auth } from "@/auth";

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const { pathname } = req.nextUrl;

  // Protect /api/v1/ai/* routes (second line of defense)
  // IMPORTANT: All route handlers under /api/v1/ai must still call auth() server-side.
  // This proxy provides early rejection for unauthenticated requests, but handlers
  // are responsible for their own auth enforcement.
  if (pathname.startsWith("/api/v1/ai")) {
    if (!isLoggedIn) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  return NextResponse.next();
});

export const config = {
  // Only run middleware on /api/v1/ai/* routes to avoid unnecessary overhead
  matcher: ["/api/v1/ai/:path*"],
};
