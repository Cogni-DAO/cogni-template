// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/posthog-provider.client`
 * Purpose: Browser-only PostHog (posthog-js) provider. Initializes the official
 *   posthog-js SDK in the browser to capture `$pageview`, `$pageleave`, web-vitals
 *   (LCP/FCP/INP/CLS) and autocapture — the user-perceived page-load telemetry the
 *   server-side `capture()` path cannot see. Additive to server-side analytics.
 * Scope: `'use client'` boundary. Init runs once, in `useEffect` (browser only), so
 *   posthog-js never touches the server bundle.
 * Invariants:
 *   - Config (project key + hosts) is resolved server-side and passed as props (see
 *     `@shared/env/posthog-browser-config`); this component never reads
 *     `process.env` for the key — runtime env is not build-inlined in this repo.
 *   - `api_host` is `/ingest` (reverse-proxy rewrite in `next.config.ts`), dodging
 *     ad-blockers; `ui_host` points at the PostHog app for toolbar/deep links.
 *   - Single init: a module-level guard prevents the React StrictMode double-invoke
 *     (and remounts) from re-initializing the singleton.
 *   - Missing `apiKey` (e.g. local dev) is a safe no-op — children still render.
 * Side-effects: initializes the global posthog-js singleton in the browser.
 * Links: ./layout.tsx, @shared/env/posthog-browser-config,
 *   https://posthog.com/docs/libraries/next-js
 * @public
 */

"use client";

import posthog from "posthog-js";
import { PostHogProvider as PostHogJsProvider } from "posthog-js/react";
import { type ReactNode, useEffect } from "react";

/** Module-level guard so StrictMode double-invoke / remounts don't re-init the singleton. */
let initialized = false;

export interface PostHogProviderProps {
  /** PostHog project key (`phc_...`). When absent, browser capture is disabled. */
  readonly apiKey: string | undefined;
  /** Ingest host — the `/ingest` reverse-proxy rewrite. */
  readonly apiHost: string;
  /** PostHog app host for toolbar / deep links. */
  readonly uiHost: string;
  readonly children: ReactNode;
}

export function PostHogProvider({
  apiKey,
  apiHost,
  uiHost,
  children,
}: PostHogProviderProps): ReactNode {
  useEffect(() => {
    if (initialized || !apiKey) {
      return;
    }
    initialized = true;

    posthog.init(apiKey, {
      api_host: apiHost,
      ui_host: uiHost,
      // Opt into modern posthog-js defaults (SPA-aware pageviews, sensible privacy).
      defaults: "2025-05-24",
      // User page-load / navigation telemetry.
      capture_pageview: true,
      capture_pageleave: true,
      // Web-vitals autocapture → `$web_vitals` events. Forced on client-side so it
      // does not depend on the project's remote "Web vitals autocapture" toggle.
      capture_performance: {
        web_vitals: true,
        web_vitals_allowed_metrics: ["LCP", "FCP", "INP", "CLS"],
        network_timing: true,
      },
      // Keep anonymous page loads cheap; still emits $pageview / $web_vitals events.
      person_profiles: "identified_only",
    });
  }, [apiKey, apiHost, uiHost]);

  return <PostHogJsProvider client={posthog}>{children}</PostHogJsProvider>;
}
