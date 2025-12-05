// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@contracts/ai.models.v1.contract`
 * Purpose: Defines operation contract for listing available LiteLLM models.
 * Scope: Provides Zod schema and types for models list endpoint wire format. Does not implement business logic or validation beyond schema definition.
 * Invariants: Contract remains stable; breaking changes require new version. All consumers use z.infer types.
 * Side-effects: none
 * Notes: Includes tier/isFree for future homepage filtering and defaultModelId for client fallback.
 * Links: /api/v1/ai/models route, useModels hook
 * @internal
 */

import { z } from "zod";

/**
 * Model schema with metadata from LiteLLM model_info
 * - id: Model identifier (model_name alias from config)
 * - name: Optional display name from model_info.display_name
 * - isFree: Tier classification from model_info.is_free
 * - providerKey: Provider identifier for icon rendering (from model_info.provider_key)
 */
export const ModelSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  isFree: z.boolean(),
  providerKey: z.string().optional(),
});

/**
 * Models list response
 * - models: Array of available models
 * - defaultPreferredModelId: Server's preferred default model (from catalog metadata.cogni.default_preferred tag, null if catalog empty)
 * - defaultFreeModelId: Free model to use when user has zero credits (from catalog metadata.cogni.default_free tag, null if no free models)
 */
export const aiModelsOperation = {
  id: "ai.models.v1",
  summary: "List available AI models",
  description:
    "Returns list of available LiteLLM models with tier information and default model IDs computed from catalog metadata",
  input: z.object({}), // No input, GET request
  output: z.object({
    models: z.array(ModelSchema),
    defaultPreferredModelId: z.string().nullable(),
    defaultFreeModelId: z.string().nullable(),
  }),
} as const;

// Export inferred types - all consumers MUST use these, never manual interfaces
export type Model = z.infer<typeof ModelSchema>;
export type ModelsOutput = z.infer<typeof aiModelsOperation.output>;
