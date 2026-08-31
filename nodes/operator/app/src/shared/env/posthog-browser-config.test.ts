// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

import { describe, expect, it } from "vitest";
import { resolvePostHogBrowserConfig } from "./posthog-browser-config";

describe("resolvePostHogBrowserConfig", () => {
  it("falls back to the server POSTHOG_API_KEY (already a phc_ project key)", () => {
    const cfg = resolvePostHogBrowserConfig({
      POSTHOG_API_KEY: "phc_server_key",
    });

    expect(cfg.apiKey).toBe("phc_server_key");
    expect(cfg.apiHost).toBe("/ingest");
    expect(cfg.uiHost).toBe("https://us.posthog.com");
  });

  it("prefers the explicit NEXT_PUBLIC_POSTHOG_KEY override", () => {
    const cfg = resolvePostHogBrowserConfig({
      POSTHOG_API_KEY: "phc_server_key",
      NEXT_PUBLIC_POSTHOG_KEY: "phc_public_key",
      NEXT_PUBLIC_POSTHOG_UI_HOST: "https://eu.posthog.com",
    });

    expect(cfg.apiKey).toBe("phc_public_key");
    expect(cfg.uiHost).toBe("https://eu.posthog.com");
  });

  it("returns undefined apiKey (disabled) when no key is present", () => {
    const cfg = resolvePostHogBrowserConfig({});
    expect(cfg.apiKey).toBeUndefined();
  });

  it("treats an empty-string key as disabled", () => {
    const cfg = resolvePostHogBrowserConfig({
      POSTHOG_API_KEY: "",
    });
    expect(cfg.apiKey).toBeUndefined();
  });
});
