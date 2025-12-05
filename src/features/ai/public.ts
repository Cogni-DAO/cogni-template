// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@features/ai/public`
 * Purpose: Public API surface for AI feature - barrel export for stable feature boundaries.
 * Scope: Re-exports public types, components, and functions. Does not implement logic.
 * Invariants: All public exports must be stable; breaking changes require new feature version.
 * Side-effects: none
 * Notes: Feature consumers should only import from this file, never from internal modules.
 * Links: Part of hexagonal architecture boundary enforcement
 * @public
 */

// Model selection rules (re-exported from core for app layer access)
export { pickDefaultModel } from "@/core";
export type { ChatComposerExtrasProps } from "./components/ChatComposerExtras";
// Model selection components
export { ChatComposerExtras } from "./components/ChatComposerExtras";
// Chat error components
export type { ChatErrorBubbleProps } from "./components/ChatErrorBubble";
export { ChatErrorBubble } from "./components/ChatErrorBubble";
export type { ModelPickerProps } from "./components/ModelPicker";
export { ModelPicker } from "./components/ModelPicker";
// Model data hooks
export { useModels } from "./hooks/useModels";
// Model preferences
export {
  clearPreferredModelId,
  getPreferredModelId,
  setPreferredModelId,
  validatePreferredModel,
} from "./preferences/model-preference";
