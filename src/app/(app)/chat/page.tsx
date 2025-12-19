// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/(app)/chat/page`
 * Purpose: Protected chat page with assistant-ui integration.
 * Scope: Client component that displays chat interface using assistant-ui Thread component. Does not handle authentication directly.
 * Invariants: Session guaranteed by (app)/layout auth guard.
 * Side-effects: IO (chat API calls, session management)
 * Notes: Uses assistant-ui with useExternalStoreRuntime; ThreadWelcome customized for Cogni copy.
 * Links: src/components/vendor/assistant-ui/thread.tsx, src/features/ai/chat/providers/ChatRuntimeProvider.client.tsx
 * @public
 */

"use client";

import { signOut } from "next-auth/react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { ErrorAlert, Thread } from "@/components";
import type { ChatError } from "@/contracts/error.chat.v1.contract";
import { ChatRuntimeProvider } from "@/features/ai/chat/providers/ChatRuntimeProvider.client";
import { toErrorAlertProps } from "@/features/ai/chat/utils/toErrorAlertProps";
import {
  ChatComposerExtras,
  ChatErrorBubble,
  getPreferredModelId,
  pickDefaultModel,
  setPreferredModelId,
  useModels,
} from "@/features/ai/public";
import { useCreditsSummary } from "@/features/payments/public";

const ChatWelcomeWithHint = () => (
  <div className="mx-auto flex h-full w-full max-w-[var(--thread-max-width)] flex-col items-center justify-center">
    <div className="flex flex-col justify-center gap-1 px-8">
      <div className="fade-in slide-in-from-bottom-2 animate-in whitespace-nowrap text-2xl text-muted-foreground/65 duration-300 ease-out">
        Clone this living mind 🧠
      </div>
      <div className="fade-in slide-in-from-bottom-2 animate-in whitespace-nowrap text-2xl text-muted-foreground/65 delay-100 duration-300 ease-out">
        Teach it what your people need 🏘️
      </div>
      <div className="fade-in slide-in-from-bottom-2 animate-in whitespace-nowrap text-2xl text-muted-foreground/65 delay-200 duration-300 ease-out">
        Intelligence, shared. 🤝
      </div>
    </div>
  </div>
);

export default function ChatPage(): ReactNode {
  const modelsQuery = useModels();
  const { data: creditsData, isLoading: isCreditsLoading } =
    useCreditsSummary();
  const balance = creditsData?.balanceCredits ?? 0;

  // Refs for user intent tracking (prevent re-init after user selection)
  const hasUserSelectedRef = useRef(false);
  const hasInitializedRef = useRef(false);

  // State
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [chatError, setChatError] = useState<ChatError | null>(null);
  const [isBlocked, setIsBlocked] = useState(false);

  // Extract server-provided defaults (NO CLIENT INVENTION)
  const models = modelsQuery.data?.models ?? [];
  const defaultPreferredModelId =
    modelsQuery.data?.defaultPreferredModelId ?? null;
  const defaultFreeModelId = modelsQuery.data?.defaultFreeModelId ?? null;
  const freeModelIds = models.filter((m) => m.isFree).map((m) => m.id);

  // Single initialization effect
  useEffect(() => {
    // Skip if user already selected or already initialized
    if (hasInitializedRef.current || hasUserSelectedRef.current) return;
    // Wait for both data sources
    if (isCreditsLoading || !modelsQuery.data) return;

    const userChoice = getPreferredModelId();

    // MF-6: Feature-layer validation - if zero credits, ensure userChoice is free
    let validatedChoice = userChoice;
    if (balance <= 0 && userChoice && !freeModelIds.includes(userChoice)) {
      validatedChoice = null; // Invalidate paid model selection when out of credits
    }

    const selected = pickDefaultModel({
      balanceCredits: balance,
      userChoice: validatedChoice,
      defaultFreeModelId,
      defaultPaidModelId: defaultPreferredModelId,
    });

    if (selected) {
      setSelectedModel(selected);
      setIsBlocked(false);
    } else {
      // No valid model: blocked state (zero credits + no free models)
      setIsBlocked(true);
      setChatError({
        code: "NO_FREE_MODELS",
        message: "No free models available. Add credits to continue chatting.",
        retryable: false,
        blocking: true,
        suggestedAction: "add_credits",
      });
    }

    hasInitializedRef.current = true;
  }, [
    isCreditsLoading,
    balance,
    modelsQuery.data,
    freeModelIds,
    defaultFreeModelId,
    defaultPreferredModelId,
  ]);
  // NOTE: selectedModel intentionally NOT in deps to prevent re-init loop

  // Model change handler - marks user intent
  const handleModelChange = useCallback((modelId: string) => {
    hasUserSelectedRef.current = true;
    setSelectedModel(modelId);
    setPreferredModelId(modelId);
    setIsBlocked(false);
    setChatError(null);
  }, []);

  // Error handler from provider
  const handleError = useCallback((error: ChatError) => {
    setChatError(error);
  }, []);

  // Switch to free model action
  const handleSwitchFreeModel = useCallback(() => {
    if (defaultFreeModelId) {
      handleModelChange(defaultFreeModelId);
    }
  }, [defaultFreeModelId, handleModelChange]);

  // Retry action - clear error (runtime handles retry internally)
  const handleRetry = useCallback(() => {
    setChatError(null);
  }, []);

  // Add credits action (navigate to credits page)
  const handleAddCredits = useCallback(() => {
    window.location.href = "/credits";
  }, []);

  // Prepare error alert props
  const errorAlertProps = chatError
    ? toErrorAlertProps(chatError, !!defaultFreeModelId)
    : null;

  // INV-UI-NO-PAID-DEFAULT-WHEN-ZERO: Gate rendering until init completes
  if (!hasInitializedRef.current) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  // INV-NO-INTERACTION-BEFORE-READY: Blocked state shows error only, no chat
  if (isBlocked && !selectedModel) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center">
        <div className="mx-auto w-full max-w-[var(--size-container-sm)] px-4">
          {errorAlertProps && (
            <ErrorAlert
              code={errorAlertProps.code}
              message={errorAlertProps.message}
              retryable={errorAlertProps.retryable}
              showRetry={errorAlertProps.showRetry}
              showSwitchFree={errorAlertProps.showSwitchFree}
              showAddCredits={errorAlertProps.showAddCredits}
              onRetry={handleRetry}
              onSwitchFreeModel={handleSwitchFreeModel}
              onAddCredits={handleAddCredits}
            />
          )}
        </div>
      </div>
    );
  }

  // Compute UI default model based on credits (NO HARDCODED FALLBACKS)
  // INV-NO-CLIENT-INVENTED-MODEL-IDS: UI must NEVER invent model IDs
  const uiDefaultModelId =
    balance <= 0 ? defaultFreeModelId : defaultPreferredModelId;

  // Invariant: selectedModel is guaranteed non-null after initialization gate
  // If this assertion fails, initialization logic has a bug
  if (!selectedModel) {
    throw new Error(
      "INV-VIOLATION: selectedModel is null after initialization gate"
    );
  }

  // Invariant: uiDefaultModelId must exist (server provides valid default)
  // If this fails, server config is broken (catalog defaults missing)
  if (!uiDefaultModelId) {
    throw new Error(
      "INV-VIOLATION: server returned no valid default model for credit state"
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ChatRuntimeProvider
        selectedModel={selectedModel}
        defaultModelId={uiDefaultModelId}
        onAuthExpired={() => signOut()}
        onError={handleError}
      >
        <Thread
          welcomeMessage={<ChatWelcomeWithHint />}
          composerLeft={
            <ChatComposerExtras
              selectedModel={selectedModel}
              onModelChange={handleModelChange}
              defaultModelId={uiDefaultModelId}
              balance={balance}
            />
          }
          errorMessage={
            errorAlertProps ? (
              <ChatErrorBubble
                message={errorAlertProps.message}
                showRetry={errorAlertProps.showRetry}
                showSwitchFree={errorAlertProps.showSwitchFree}
                showAddCredits={errorAlertProps.showAddCredits}
                onRetry={handleRetry}
                onSwitchFreeModel={handleSwitchFreeModel}
                onAddCredits={handleAddCredits}
              />
            ) : undefined
          }
        />
      </ChatRuntimeProvider>
    </div>
  );
}
