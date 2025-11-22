// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@/auth`
 * Purpose: Auth.js configuration using SIWE (Credentials provider) with Drizzle adapter.
 * Scope: Defines auth handlers, session strategy, and SIWE verification. Used by API routes and middleware. Does not handle client-side session management.
 * Invariants: Database-backed sessions; wallet address never leaves the server except via session payload.
 * Side-effects: IO (Auth.js DB operations via Drizzle)
 * Links: docs/SECURITY_AUTH_SPEC.md
 * @public
 */

/* eslint-disable boundaries/no-unknown-files */

import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import NextAuth, { type User as NextAuthUser } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { SiweMessage } from "siwe";

import { getDb } from "@/adapters/server/db/client";
import {
  accounts,
  sessions,
  users,
  verificationTokens,
} from "@/shared/db/schema.auth";

/**
 * Get auth domain from environment.
 * NOTE: src/auth.ts is a boundary module and intentionally reads process.env
 * directly to avoid importing env/server.ts, keeping Next.js build imports lightweight.
 */
function getAuthDomain(): string {
  const domain = process.env.DOMAIN;
  if (domain) return domain;
  try {
    const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
    const url = new URL(baseUrl);
    return url.hostname;
  } catch {
    return "localhost";
  }
}

type DbUser = typeof users.$inferSelect;

function toNextAuthUser(
  row: DbUser | undefined,
  address: string
): NextAuthUser {
  const walletAddress = row?.walletAddress ?? address ?? null;
  return {
    id: row?.id ?? address,
    name: row?.name ?? address,
    email: row?.email ?? null,
    image: row?.image ?? null,
    walletAddress,
  };
}

/**
 * NextAuth configuration and exports.
 * Direct export pattern per Auth.js v5 examples - no lazy initialization.
 * Build-time: Docker builder provides DATABASE_URL so getDb() can validate during build.
 * Runtime: Actual DB connections only happen when auth handlers are invoked.
 */
export const { auth, signIn, signOut, handlers } = NextAuth({
  adapter: DrizzleAdapter(getDb(), {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: "database" },
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
        if (!credentials?.message || !credentials?.signature) return null;

        const siweMessage = new SiweMessage(credentials.message as string);
        const domain = getAuthDomain();

        // Enforce nonce match against Auth.js CSRF token cookie to mitigate replay
        const csrfTokenFromCookie =
          req?.headers
            ?.get("cookie")
            ?.match(/next-auth\.csrf-token=([^;]+);?/)?.[1]
            ?.split("|")?.[0] ?? undefined;

        if (!csrfTokenFromCookie || siweMessage.nonce !== csrfTokenFromCookie) {
          return null;
        }

        const verification = await siweMessage.verify({
          signature: credentials.signature as string,
          domain,
          nonce: csrfTokenFromCookie,
        });

        if (!verification.success) {
          return null;
        }

        const address = siweMessage.address.toLowerCase();
        const db = getDb();
        const existing = await db.query.users.findFirst({
          where: eq(users.id, address),
        });

        if (existing) {
          return toNextAuthUser(existing, address);
        }

        const [created] = await db
          .insert(users)
          .values({
            id: address,
            name: address,
            walletAddress: address,
          })
          .onConflictDoUpdate({
            target: users.id,
            set: { walletAddress: address, name: address },
          })
          .returning();

        return toNextAuthUser(created, address);
      },
    }),
  ],
  callbacks: {
    session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        session.user.walletAddress = user.walletAddress ?? null;
      }
      return session;
    },
    jwt({ token, user }) {
      if (user) {
        if (user.id) {
          token.sub = user.id;
        }
        const wallet = user.walletAddress ?? null;
        if (wallet) {
          token.walletAddress = wallet;
        }
      }
      return token;
    },
  },
  trustHost: process.env.NODE_ENV === "development",
});
