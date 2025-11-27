// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@tests/lint/eslint/vendor-sdk-imports`
 * Purpose: Verifies no-vendor-sdk-imports rule blocks vendor SDK imports in core code.
 * Scope: Tests import statements for blocked vendor SDKs. Does NOT test hexagonal boundaries.
 * Invariants: Vendor SDKs blocked in src/** except src/infra/**; prevents vendor lock-in.
 * Side-effects: IO (via runEslint temp file creation)
 * Notes: Tests no-vendor-sdk-imports/no-vendor-sdk-imports rule for SaaS vendor dependencies.
 * Links: scripts/eslint/plugins/no-vendor-sdk-imports.cjs, eslint/no-vendor-sdk-imports.config.mjs
 * @public
 */

import { describe, expect, it } from "vitest";

import { lintFixture } from "./runBiome";

// TODO: Migrate to Biome - waiting for corresponding commit
// TODO: Migrate to Biome - waiting for corresponding commit

describe.skip("Vendor SDK Import Restrictions", () => {
  it("blocks observability SaaS imports", async () => {
    const { errors, messages } = await lintFixture(
      "src/components/tracking/Analytics.tsx",
      `import * as Sentry from "@sentry/nextjs";
       import { trace } from "dd-trace";
       import posthog from "posthog-js";
       import { FullStory } from "@fullstory/browser";
       export const Analytics = () => <div>tracking</div>;`,
      { focusRulePrefixes: ["no-vendor-sdk-imports"] }
    );

    expect(errors).toBeGreaterThan(0);
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "no-vendor-sdk-imports/no-vendor-sdk-imports",
          message: expect.stringContaining(
            'Vendor SDK import "@sentry/nextjs"'
          ),
        }),
        expect.objectContaining({
          ruleId: "no-vendor-sdk-imports/no-vendor-sdk-imports",
          message: expect.stringContaining('Vendor SDK import "posthog-js"'),
        }),
        expect.objectContaining({
          ruleId: "no-vendor-sdk-imports/no-vendor-sdk-imports",
          message: expect.stringContaining(
            'Vendor SDK import "@fullstory/browser"'
          ),
        }),
      ])
    );
  });

  it("blocks auth SaaS imports", async () => {
    const { errors, messages } = await lintFixture(
      "src/features/auth/LoginForm.tsx",
      `import { ClerkProvider } from "@clerk/nextjs";
       import { useAuth0 } from "@auth0/nextjs-auth0";
       export const LoginForm = () => <div>login</div>;`,
      { focusRulePrefixes: ["no-vendor-sdk-imports"] }
    );

    expect(errors).toBeGreaterThan(0);
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "no-vendor-sdk-imports/no-vendor-sdk-imports",
          message: expect.stringContaining('Vendor SDK import "@clerk/nextjs"'),
        }),
      ])
    );
  });

  it("blocks BaaS and queue/cache imports", async () => {
    const { errors, messages } = await lintFixture(
      "src/lib/database.ts",
      `import { createClient } from "@supabase/supabase-js";
       import { Redis } from "@upstash/redis";
       import { initializeApp } from "firebase/app";
       export const db = {};`,
      { focusRulePrefixes: ["no-vendor-sdk-imports"] }
    );

    expect(errors).toBeGreaterThan(0);
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "no-vendor-sdk-imports/no-vendor-sdk-imports",
          message: expect.stringContaining(
            'Vendor SDK import "@supabase/supabase-js"'
          ),
        }),
        expect.objectContaining({
          ruleId: "no-vendor-sdk-imports/no-vendor-sdk-imports",
          message: expect.stringContaining(
            'Vendor SDK import "@upstash/redis"'
          ),
        }),
        expect.objectContaining({
          ruleId: "no-vendor-sdk-imports/no-vendor-sdk-imports",
          message: expect.stringContaining('Vendor SDK import "firebase/app"'),
        }),
      ])
    );
  });

  it("blocks Vercel platform SDKs", async () => {
    const { errors, messages } = await lintFixture(
      "src/lib/deployment.ts",
      `import { geolocation } from "@vercel/edge";
       import { analytics } from "@vercel/analytics";
       export const deployment = {};`,
      { focusRulePrefixes: ["no-vendor-sdk-imports"] }
    );

    expect(errors).toBeGreaterThan(0);
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "no-vendor-sdk-imports/no-vendor-sdk-imports",
          message: expect.stringContaining('Vendor SDK import "@vercel/edge"'),
        }),
        expect.objectContaining({
          ruleId: "no-vendor-sdk-imports/no-vendor-sdk-imports",
          message: expect.stringContaining(
            'Vendor SDK import "@vercel/analytics"'
          ),
        }),
      ])
    );
  });

  it("allows standard library and framework imports", async () => {
    const { errors } = await lintFixture(
      "src/components/ui/Button.tsx",
      `import React from "react";
       import { NextResponse } from "next/server";
       import { drizzle } from "drizzle-orm";
       import { z } from "zod";
       export const Button = () => <button>Click</button>;`,
      { focusRulePrefixes: ["no-vendor-sdk-imports"] }
    );

    expect(errors).toBe(0);
  });

  it("allows vendor SDKs in infra adapters", async () => {
    const { errors } = await lintFixture(
      "src/infra/auth/clerk.adapter.ts",
      `import { ClerkProvider } from "@clerk/nextjs";
       import * as Sentry from "@sentry/nextjs";
       export class ClerkAdapter {
         getCurrentUser() { return null; }
       }`,
      { focusRulePrefixes: ["no-vendor-sdk-imports"] }
    );

    expect(errors).toBe(0);
  });

  it("blocks dynamic imports and require calls", async () => {
    const { errors, messages } = await lintFixture(
      "src/lib/lazy-load.ts",
      `export async function loadSentry() {
         const sentry = await import("@sentry/browser");
         const dd = require("dd-trace");
         return { sentry, dd };
       }`,
      { focusRulePrefixes: ["no-vendor-sdk-imports"] }
    );

    expect(errors).toBeGreaterThan(0);
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "no-vendor-sdk-imports/no-vendor-sdk-imports",
          message: expect.stringContaining(
            'Vendor SDK import "@sentry/browser"'
          ),
        }),
        expect.objectContaining({
          ruleId: "no-vendor-sdk-imports/no-vendor-sdk-imports",
          message: expect.stringContaining('Vendor SDK import "dd-trace"'),
        }),
      ])
    );
  });

  it("blocks subpath imports from vendor SDKs", async () => {
    const { errors, messages } = await lintFixture(
      "src/features/auth/hooks.ts",
      `import { useUser } from "@clerk/nextjs/server";
       import { getSession } from "@auth0/nextjs-auth0/edge";
       export const useAuthHooks = () => {};`,
      { focusRulePrefixes: ["no-vendor-sdk-imports"] }
    );

    expect(errors).toBeGreaterThan(0);
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ruleId: "no-vendor-sdk-imports/no-vendor-sdk-imports",
          message: expect.stringContaining(
            'Vendor SDK import "@clerk/nextjs/server"'
          ),
        }),
        expect.objectContaining({
          ruleId: "no-vendor-sdk-imports/no-vendor-sdk-imports",
          message: expect.stringContaining(
            'Vendor SDK import "@auth0/nextjs-auth0/edge"'
          ),
        }),
      ])
    );
  });
});
