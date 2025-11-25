// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@/auth`
 * Purpose: NextAuth.js configuration and export.
 * Scope: App-wide authentication configuration. Does not handle client-side session management.
 * Invariants: Uses SIWE (Sign-In with Ethereum) provider with "credentials" ID; returns DB UUID as user ID.
 * Side-effects: IO (Handles session creation, validation, and persistence)
 * Links: docs/AUTHENTICATION.md
 * @public
 */

/* eslint-disable boundaries/no-unknown-files */

import nodeCrypto, { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import type { NextAuthOptions } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { getCsrfToken } from "next-auth/react";
import { SiweMessage } from "siwe";

import { getDb } from "@/adapters/server/db/client";
import { users } from "@/shared/db/schema.auth";

export const authSecret =
  process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "";

/**
 * NextAuth configuration.
 * Exports authOptions for use in route handlers and server helpers.
 *
 * Note: No adapter with JWT strategy. Credentials provider manually manages users table.
 * Database sessions table is not used; JWT tokens stored in HttpOnly cookies instead.
 */
export const authOptions: NextAuthOptions = {
  pages: {
    // Prevent redirect to default NextAuth sign-in page
    signIn: "/",
  },
  session: {
    strategy: "jwt",
    // 30 days
    maxAge: 30 * 24 * 60 * 60,
  },
  secret: authSecret,
  // Rely on AUTH_SECRET or NEXTAUTH_SECRET in process.env
  providers: [
    Credentials({
      // Changed from "siwe" to match default RainbowKit adapter expectation
      id: "credentials",
      name: "Sign-In with Ethereum",
      credentials: {
        message: { label: "Message", type: "text" },
        signature: { label: "Signature", type: "text" },
      },
      async authorize(credentials, req) {
        try {
          if (!credentials?.message || !credentials?.signature) {
            console.error("[SIWE] Missing credentials");
            return null;
          }

          const siwe = new SiweMessage(credentials.message as string);
          const nextAuthUrl = new URL(
            process.env.NEXTAUTH_URL ?? "http://localhost:3000"
          );

          // Convert Headers to plain object for getCsrfToken
          const headers: Record<string, string> = {};
          if (req.headers instanceof Headers) {
            for (const [key, value] of req.headers.entries()) {
              headers[key] = value;
            }
          } else {
            Object.assign(headers, req.headers);
          }

          // Verify domain, nonce, and signature
          const nonce = await getCsrfToken({ req: { headers } });
          if (!nonce) {
            console.error("[SIWE] Failed to retrieve nonce");
            return null;
          }

          // [DEBUG] Log attempt details
          const messageHash = nodeCrypto
            .createHash("sha256")
            .update(credentials.message as string)
            .digest("hex")
            .slice(0, 8);
          console.log(
            `[SIWE] Authorize attempt: nonce=${nonce}, address=${new SiweMessage(credentials.message as string).address}, msgHash=${messageHash}`
          );

          const result = await siwe.verify({
            signature: credentials.signature as string,
            domain: nextAuthUrl.host,
            nonce,
          });

          if (!result.success) {
            console.error("[SIWE] Verification failed:", result.error);
            return null;
          }

          const { data: fields } = result;
          const db = getDb();

          // Check for existing user
          let user = await db.query.users.findFirst({
            where: eq(users.walletAddress, fields.address),
          });

          if (!user) {
            // Create new user if not exists
            const [newUser] = await db
              .insert(users)
              .values({
                // Generate ID manually since it's not auto-generated in schema
                id: randomUUID(),
                walletAddress: fields.address,
                // role: "user", // Removed as it might not be in schema, relying on default
              })
              .returning();
            user = newUser;
          }

          if (!user) {
            console.error("[SIWE] Failed to create or retrieve user");
            return null;
          }

          console.log("[SIWE] Login success for:", fields.address);

          // Always use DB UUID as primary ID
          return {
            id: user.id,
            walletAddress: fields.address,
          };
        } catch (e) {
          console.error("[SIWE] Authorize error:", e);
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.walletAddress = user.walletAddress ?? null;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.walletAddress = token.walletAddress as string | null;
      }
      return session;
    },
  },
  // Enable debugging to diagnose login issues
  debug: process.env.NODE_ENV === "development",
};
