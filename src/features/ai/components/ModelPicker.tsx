// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@features/ai/components/ModelPicker`
 * Purpose: Provides model selection dialog for chat interface.
 * Scope: Feature-specific controlled UI component for selecting AI models. Does not manage state, persistence, or API data (delegates to parent).
 * Invariants: Responsive CSS (mobile bottom-sheet, desktop centered modal).
 * Side-effects: none (controlled component, delegates state to parent)
 * Notes: Uses Dialog+ScrollArea from shadcn, provider icons from config.
 * Links: Used by ChatComposerExtras, provider-icons config
 * @internal
 */

"use client";

import { Check, ChevronDown, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { ScrollArea } from "@/components/kit/data-display/ScrollArea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/kit/overlays/Dialog";
import type { Model } from "@/contracts/ai.models.v1.contract";
import {
  getIconByProviderKey,
  getProviderIcon,
} from "@/features/ai/config/provider-icons";
import { cn } from "@/shared/util/cn";

export interface ModelPickerProps {
  models: Model[];
  value: string;
  onValueChange: (modelId: string) => void;
  disabled?: boolean;
  balance?: number;
}

export function ModelPicker({
  models,
  value,
  onValueChange,
  disabled,
  balance = 0,
}: Readonly<ModelPickerProps>) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const selectedModel = models.find((m) => m.id === value);
  const filteredModels = models.filter((model) => {
    const query = searchQuery.toLowerCase();
    return (
      model.id.toLowerCase().includes(query) ||
      model.name?.toLowerCase().includes(query)
    );
  });

  // Format model name for display (e.g., "gpt-4o-mini" → "GPT-4o Mini")
  const displayName =
    selectedModel?.name || selectedModel?.id || "Select model";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            // Base styles - rounded-full like attachment button, proper sizing
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5",
            "h-[var(--size-composer-icon-btn)] w-auto",
            "border-none bg-transparent shadow-none outline-none",
            // Typography - match attachment button
            "font-semibold text-muted-foreground text-xs",
            // Hover - use semantic accent tokens (matches card hover)
            "transition-colors hover:bg-accent hover:text-foreground",
            // Active/expanded state
            "aria-[expanded=true]:bg-accent aria-[expanded=true]:text-foreground",
            // Disabled state
            "disabled:pointer-events-none disabled:opacity-50"
          )}
          aria-label="Select model"
        >
          <span className="max-w-[var(--max-width-model-trigger)] truncate">
            {displayName}
          </span>
          <ChevronDown className="size-4 shrink-0" />
        </button>
      </DialogTrigger>

      <DialogContent
        className={cn(
          // Mobile: bottom sheet
          "fixed inset-x-0 bottom-0 rounded-t-2xl",
          // Desktop: centered modal
          "sm:top-[var(--center-50)] sm:bottom-auto sm:left-[var(--center-50)]",
          "sm:translate-x-[var(--center-neg-50)] sm:translate-y-[var(--center-neg-50)]",
          "sm:max-w-lg sm:rounded-2xl",
          // Shared
          "flex max-h-[var(--max-height-dialog)] flex-col gap-4"
        )}
      >
        <DialogHeader>
          <DialogTitle>Select Model</DialogTitle>
        </DialogHeader>

        {/* Search input */}
        <input
          type="text"
          placeholder="Search models..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-offset-background"
        />

        {/* Models list */}
        <ScrollArea className="-mx-6 flex-1 px-6">
          <div className="space-y-1">
            {filteredModels.length === 0 ? (
              <div className="py-6 text-center text-muted-foreground text-sm">
                No models found
              </div>
            ) : (
              filteredModels.map((model) => {
                // Prefer providerKey from model_info, fallback to ID-based inference
                const Icon = model.providerKey
                  ? getIconByProviderKey(model.providerKey)
                  : getProviderIcon(model.id);
                const isSelected = model.id === value;
                const isPaidAndNoBalance = !model.isFree && balance <= 0;

                return (
                  <button
                    key={model.id}
                    type="button"
                    disabled={isPaidAndNoBalance}
                    onClick={() => {
                      if (!isPaidAndNoBalance) {
                        onValueChange(model.id);
                        setOpen(false);
                        setSearchQuery("");
                      }
                    }}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left",
                      "transition-colors hover:bg-accent",
                      isSelected && "bg-accent",
                      isPaidAndNoBalance &&
                        "cursor-not-allowed opacity-50 hover:bg-transparent"
                    )}
                  >
                    <Icon className="size-5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1 truncate font-medium text-sm">
                      {model.name || model.id}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {model.isZdr && (
                        <span className="flex items-center gap-1 font-medium text-primary text-xs">
                          <ShieldCheck className="size-3" />
                          Private (ZDR)
                        </span>
                      )}
                      {model.isFree && (
                        <span className="flex items-center gap-1.5 font-medium text-sm text-success">
                          {isSelected && <Check className="size-4" />}
                          Free
                        </span>
                      )}
                      {!model.isFree && !model.isZdr && isSelected && (
                        <Check className="size-4 text-primary" />
                      )}
                      {model.isZdr && isSelected && (
                        <Check className="size-4 text-primary" />
                      )}
                      {isPaidAndNoBalance && (
                        <span className="text-muted-foreground text-xs">
                          (Credits required)
                        </span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
