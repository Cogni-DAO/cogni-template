// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@/auth`
 * Purpose: Auth.js configuration using SIWE (Credentials provider) with JWT sessions.
 * Scope: Defines auth handlers, JWT strategy, and SIWE verification. Users table tracks wallet addresses; no database sessions. Does not handle client-side session management or route protection.
 * Invariants: JWT-backed sessions; wallet address in JWT token; manual user record management.
 * Side-effects: IO (User table writes only, no session table)
 * Links: docs/SECURITY_AUTH_SPEC.md
 * @public
 */

/* eslint-disable boundaries/no-unknown-files */

import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import NextAuth, { type User as NextAuthUser } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { SiweMessage } from "siwe";

import { getDb } from "@/adapters/server/db/client";
import { users } from "@/shared/db/schema.auth";

type DbUser = typeof users.$inferSelect;

function toNextAuthUser(row: DbUser, address: string): NextAuthUser {
  const walletAddress = row.walletAddress ?? address;
  return {
    id: row.id,
    name: row.name ?? null,
    email: row.email ?? null,
    image: row.image ?? null,
    walletAddress,
  };
}

/**
 * NextAuth configuration and exports.
 * Direct export pattern per Auth.js v5 examples - no lazy initialization.
 * Build-time: Docker builder provides DATABASE_URL so getDb() can validate during build.
 * Runtime: Actual DB connections only happen when auth handlers are invoked.
 *
 * Note: No adapter with JWT strategy. Credentials provider manually manages users table.
 * Database sessions table is not used; JWT tokens stored in HttpOnly cookies instead.
 */
export const { auth, signIn, signOut, handlers } = NextAuth({
  session: {
    strategy: "jwt",
    // 30 days
    maxAge: 30 * 24 * 60 * 60,
  },
  // Rely on AUTH_SECRET or NEXTAUTH_SECRET in process.env
  providers: [
    Credentials({
      id: "siwe",
      name: "Sign-In with Ethereum",
      credentials: {
        message: { label: "Message", type: "text" },
        signature: { label: "Signature", type: "text" },
      },
      async authorize(credentials, req) {
        console.log("[SIWE] authorize() called with:", {
          hasMessage: !!credentials?.message,
          hasSignature: !!credentials?.signature,
          messagePreview:
            typeof credentials?.message === "string"
              ? credentials.message.substring(0, 100)
              : "N/A",
        });

        if (!credentials?.message || !credentials?.signature) {
          console.error("[SIWE] Missing credentials");
          return null;
        }

        // Get domain from incoming request (single source of truth)
        const host = req?.headers?.get("host");
        if (!host) {
          console.error("[SIWE] No host header in request");
          return null;
        }

        const siweMessage = new SiweMessage(credentials.message as string);

        console.log("[SIWE] Parsed message:", {
          signedDomain: siweMessage.domain,
          requestHost: host,
          address: siweMessage.address,
          nonce: siweMessage.nonce,
        });

        // CRITICAL: Enforce domain match (prevent domain spoofing)
        if (siweMessage.domain !== host) {
          console.error(
            "[SIWE] Domain mismatch - signed domain must match request host",
            {
              signed: siweMessage.domain,
              requestHost: host,
            }
          );
          return null;
        }

        // Enforce nonce match against Auth.js CSRF token cookie to mitigate replay
        const cookieStore = await cookies();
        const csrfCookie = cookieStore.get("authjs.csrf-token");
        const csrfTokenFromCookie =
          csrfCookie?.value?.split("|")?.[0] ?? undefined;

        console.log("[SIWE] CSRF/Nonce check:", {
          csrfFromCookie: csrfTokenFromCookie,
          nonceFromMessage: siweMessage.nonce,
          match: csrfTokenFromCookie === siweMessage.nonce,
        });

        if (!csrfTokenFromCookie || siweMessage.nonce !== csrfTokenFromCookie) {
          console.error("[SIWE] Nonce mismatch");
          return null;
        }

        console.log("[SIWE] Attempting signature verification...");
        // Use request host for verification, not env-derived domain
        const verification = await siweMessage.verify({
          signature: credentials.signature as string,
          domain: host,
          nonce: csrfTokenFromCookie,
        });

        console.log("[SIWE] Verification result:", verification);

        if (!verification.success) {
          console.error("[SIWE] Signature verification failed");
          return null;
        }

        const address = siweMessage.address.toLowerCase();
        const db = getDb();

        // Optimistic fetch first (fast path)
        let user = await db.query.users.findFirst({
          where: eq(users.walletAddress, address),
        });

        if (user) {
          return toNextAuthUser(user, address);
        }

        // Insert with conflict handling (race condition safety)
        await db
          .insert(users)
          .values({
            id: randomUUID(),
            walletAddress: address,
          })
          .onConflictDoNothing({ target: users.walletAddress });

        // Fetch again to get the definitive record (ours or the winner's)
        user = await db.query.users.findFirst({
          where: eq(users.walletAddress, address),
        });

        if (!user) {
          console.error("[SIWE] Failed to create or retrieve user");
          return null;
        }

        return toNextAuthUser(user, address);
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        // SIWE invariant: wallet address must exist
        if (!user.walletAddress) {
          throw new Error("SIWE authentication must provide wallet address");
        }
        token.id = user.id;
        token.walletAddress = user.walletAddress;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        const userId = typeof token.id === "string" ? token.id : "";
        const walletAddr =
          typeof token.walletAddress === "string" ? token.walletAddress : null;

        session.user.id = userId;
        session.user.walletAddress = walletAddr;
      }
      return session;
    },
  },
  // Always trust reverse proxy host headers; app only runs behind our own Caddy / managed proxies.
  trustHost: true,
});
