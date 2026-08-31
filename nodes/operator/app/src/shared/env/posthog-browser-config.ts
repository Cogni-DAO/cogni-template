// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@shared/env/posthog-browser-config`
 * Purpose: Server-side resolver for the browser (posthog-js) analytics config passed
 *   into the client `PostHogProvider`. Complements the server-side `capture()` path
 *   in `@shared/analytics` — this is additive, not a replacement.
 * Scope: Pure function reading env; no posthog-js import (keeps this server-safe).
 * Invariants:
 *   - Browser SDK reuses the PostHog **project** key (`phc_...`). `POSTHOG_API_KEY` is
 *     already such a key and is delivered to the pod at runtime, so no separate secret
 *     is required. `NEXT_PUBLIC_POSTHOG_KEY` is an optional, non-secret override for
 *     deployments that want a distinct client key.
 *   - This repo delivers env at runtime (ESO `envFrom`), not build-time inlining, so the
 *     key is resolved here on the server and passed into the client component as a prop
 *     (mirrors the wagmi `initialState` pattern in `layout.tsx`). A naive browser-side
 *     `process.env.NEXT_PUBLIC_*` read would be `undefined` at runtime.
 *   - `apiHost` is always `/ingest` — the reverse-proxy rewrite declared in
 *     `next.config.ts` (standard adblock-dodge pattern).
 * Side-effects: reads `process.env`.
 * Links: ../../app/posthog-provider.client.tsx, ../../../next.config.ts,
 *   packages/node-shared/src/analytics/capture.ts, docs/guides/posthog-setup.md
 * @public
 */

/** Resolved config handed to the browser posthog-js provider. */
export interface PostHogBrowserConfig {
  /** PostHog project key (`phc_...`). `undefined` disables browser capture (e.g. local dev without a key). */
  readonly apiKey: string | undefined;
  /** Ingest host the browser SDK posts to — the local `/ingest` reverse-proxy rewrite. */
  readonly apiHost: string;
  /** PostHog app host used for toolbar / deep links (not ingest). */
  readonly uiHost: string;
}

/** Default PostHog app host (US Cloud). Override with `NEXT_PUBLIC_POSTHOG_UI_HOST`. */
const DEFAULT_UI_HOST = "https://us.posthog.com";

/**
 * Resolve the browser analytics config from the environment.
 * Prefers the explicit public override, then falls back to the server project key,
 * so browser telemetry works out-of-the-box wherever `POSTHOG_API_KEY` is already set.
 */
export function resolvePostHogBrowserConfig(
  env: Record<string, string | undefined> = process.env
): PostHogBrowserConfig {
  const rawKey = env.NEXT_PUBLIC_POSTHOG_KEY ?? env.POSTHOG_API_KEY;
  const apiKey = rawKey && rawKey.length > 0 ? rawKey : undefined;
  const uiHost = env.NEXT_PUBLIC_POSTHOG_UI_HOST ?? DEFAULT_UI_HOST;

  return {
    apiKey,
    apiHost: "/ingest",
    uiHost,
  };
}
