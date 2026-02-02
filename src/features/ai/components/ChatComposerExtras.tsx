// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@features/ai/chat/components/ChatComposerExtras`
 * Purpose: Provides composer toolbar extras for chat including model and graph selection.
 * Scope: Smart component managing model selection state, localStorage persistence, and API data synchronization. Does not implement model fetching or localStorage utilities (delegates to hooks and preferences module).
 * Invariants: Validates localStorage preference against API models.
 * Side-effects: global (localStorage via preferences module), IO (API fetch via useModels hook)
 * Notes: Designed to be passed as composerLeft slot to kit Thread.
 * Links: ModelPicker component, GraphPicker component, useModels hook, model-preference module
 * @public
 */

"use client";

import { useEffect, useState } from "react";
import {
  type GraphOption,
  GraphPicker,
} from "@/features/ai/components/GraphPicker";
import { ModelPicker } from "@/features/ai/components/ModelPicker";
import { useModels } from "@/features/ai/hooks/useModels";
import {
  setPreferredModelId,
  validatePreferredModel,
} from "@/features/ai/preferences/model-preference";
import type { GraphId } from "@/ports";

/**
 * TODO: P1 - Replace hardcoded graphs with API fetch from /api/v1/ai/agents
 * Per CATALOG_STATIC_IN_P0: graphs are static, no runtime discovery yet.
 * See AGENT_DISCOVERY.md Phase 2 checklist.
 */
const AVAILABLE_GRAPHS: readonly GraphOption[] = [
  {
    graphId: "langgraph:poet" satisfies GraphId,
    name: "Poet",
    description: "Poetic AI assistant with structured verse",
  },
  {
    graphId: "langgraph:ponderer" satisfies GraphId,
    name: "Ponderer",
    description: "Philosophical thinker",
  },
  {
    graphId: "langgraph:research" satisfies GraphId,
    name: "Research",
    description: "Deep research with web search",
  },
];

/** Default graph ID - exported for page initialization */
export const DEFAULT_GRAPH_ID: GraphId = "langgraph:poet";

export interface ChatComposerExtrasProps {
  selectedModel: string;
  onModelChange: (model: string) => void;
  defaultModelId: string;
  balance?: number;
  selectedGraph?: GraphId;
  onGraphChange?: (graphId: GraphId) => void;
}

export function ChatComposerExtras({
  selectedModel,
  onModelChange,
  defaultModelId,
  balance = 0,
  selectedGraph = DEFAULT_GRAPH_ID,
  onGraphChange,
}: Readonly<ChatComposerExtrasProps>) {
  const modelsQuery = useModels();
  const [localModel, setLocalModel] = useState(selectedModel);

  // Initialize from localStorage on mount, validate against API models
  useEffect(() => {
    if (modelsQuery.data) {
      const modelIds = modelsQuery.data.models.map((m) => m.id);
      const validated = validatePreferredModel(modelIds, defaultModelId);
      if (validated !== localModel) {
        setLocalModel(validated);
        onModelChange(validated);
      }
    }
  }, [modelsQuery.data, defaultModelId, localModel, onModelChange]);

  const handleModelChange = (modelId: string) => {
    setLocalModel(modelId);
    setPreferredModelId(modelId);
    onModelChange(modelId);
  };

  const handleGraphChange = (graphId: GraphId) => {
    onGraphChange?.(graphId);
  };

  return (
    <div className="flex items-center gap-1">
      <ModelPicker
        models={modelsQuery.data?.models ?? []}
        value={localModel}
        onValueChange={handleModelChange}
        disabled={modelsQuery.isLoading || modelsQuery.isError}
        balance={balance}
      />
      <GraphPicker
        graphs={AVAILABLE_GRAPHS}
        value={selectedGraph}
        onValueChange={handleGraphChange}
        disabled={!onGraphChange}
      />
    </div>
  );
}
