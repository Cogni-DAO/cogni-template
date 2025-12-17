// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/api/v1/ai/models`
 * Purpose: Provides HTTP endpoint for listing available AI models.
 * Scope: Auth-protected GET endpoint that returns cached model list with tier info. Does not implement caching logic or model fetching.
 * Invariants: Uses server-side cache (no per-request network calls), validates with contract.
 * Side-effects: IO (HTTP request/response)
 * Notes: Implements SEC-001 (auth-protected) and PERF-001 (cached).
 * Links: ai.models.v1.contract, models-cache utility
 * @public
 */

import { NextResponse } from "next/server";
import { getSessionUser } from "@/app/_lib/auth/session";
import { wrapRouteHandlerWithLogging } from "@/bootstrap/http";
import type { Model } from "@/contracts/ai.models.v1.contract";
import { aiModelsOperation } from "@/contracts/ai.models.v1.contract";
import {
  getCachedModels,
  type ModelMeta,
} from "@/shared/ai/model-catalog.server";
import { serverEnv } from "@/shared/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = wrapRouteHandlerWithLogging(
  { routeId: "ai.models", auth: { mode: "required", getSessionUser } },
  async (ctx, _request, _sessionUser) => {
    const startMs = performance.now();
    try {
      // Fetch from cache (fast, no network call)
      // defaults are computed from catalog metadata tags (never from env)
      const { models, defaults } = await getCachedModels();

      // Map internal ModelMeta to contract Model
      const contractModels: Model[] = models.map((m: ModelMeta) => ({
        id: m.id,
        name: m.name,
        isFree: m.isFree,
        isZdr: m.isZdr,
        providerKey: m.providerKey,
      }));

      const responseData = {
        models: contractModels,
        defaultPreferredModelId: defaults.defaultPreferredModelId,
        defaultFreeModelId: defaults.defaultFreeModelId,
      };

      // Validate output with contract
      const outputParseResult =
        aiModelsOperation.output.safeParse(responseData);
      if (!outputParseResult.success) {
        ctx.log.error(
          {
            errCode: "inv_models_contract_validation_failed",
            catalogSize: contractModels.length,
          },
          "Model data failed contract validation"
        );
        return NextResponse.json(
          { error: "Server error: invalid data format" },
          { status: 500 }
        );
      }

      // ONE info log on success
      ctx.log.info(
        {
          cacheHit: true,
          modelCount: contractModels.length,
          durationMs: performance.now() - startMs,
        },
        "ai.models_list_success"
      );

      return NextResponse.json(outputParseResult.data, { status: 200 });
    } catch (error) {
      // ONE error log on failure (safe - no throwing in error path)
      let sanitizedHost = "unknown";
      try {
        const litellmUrl = serverEnv().LITELLM_BASE_URL;
        sanitizedHost = new URL(litellmUrl).hostname;
      } catch {
        // URL parsing failed, use fallback
      }

      ctx.log.error(
        {
          errCode: "ai.models_cache_fetch_failed",
          litellmHost: sanitizedHost,
          hasMasterKey: !!serverEnv().LITELLM_MASTER_KEY,
          errorType: error instanceof Error ? error.name : "unknown",
        },
        "Failed to fetch models from cache"
      );
      return NextResponse.json(
        { error: "Failed to fetch models" },
        { status: 503 }
      );
    }
  }
);
