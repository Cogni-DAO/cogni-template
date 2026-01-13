// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@shared/observability/logging/events`
 * Purpose: Event name registry for structured logging - prevents ad-hoc strings and schema drift.
 * Scope: Define valid event names as const registry. Does not define full payload schemas (for now).
 * Invariants: All event names registered here; logEvent() enforces base fields (reqId always).
 * Side-effects: none
 * Notes: Use EVENT_NAMES.* constants when logging. Later: add strict payload types if needed.
 * Links: Used by logEvent() in logger.ts; consumed by all logging callsites.
 * @public
 */

// ============================================================================
// Event Name Registry (as const)
// ============================================================================

export const EVENT_NAMES = {
  // AI Domain - Server
  AI_COMPLETION: "ai.completion",
  AI_LLM_CALL: "ai.llm_call",
  AI_LLM_CALL_COMPLETED: "ai.llm_call_completed",
  AI_CHAT_RECEIVED: "ai.chat_received",
  AI_CHAT_RESPONSE_STARTED: "ai.chat_response_started",
  AI_CHAT_STREAM_CLOSED: "ai.chat_stream_closed",
  AI_CHAT_CLIENT_ABORTED: "ai.chat_client_aborted",
  AI_MODELS_LIST_SUCCESS: "ai.models_list_success",
  AI_ACTIVITY_QUERY_COMPLETED: "ai.activity.query_completed",
  AI_BILLING_COMMIT_COMPLETE: "ai.billing.commit_complete",
  AI_RELAY_PUMP_ERROR: "ai.relay.pump_error",

  // AI Domain - Client
  CLIENT_CHAT_MODEL_INVALID_RETRY: "client.chat.model_invalid_retry",
  CLIENT_CHAT_STREAM_ERROR: "client.chat.stream_error",
  CLIENT_CHAT_STREAM_CHUNK_PARSE_FAIL: "client.chat.stream_chunk_parse_fail",
  CLIENT_AI_MODEL_PREF_READ_FAIL: "client.ai.model_pref_read_fail",
  CLIENT_AI_MODEL_PREF_WRITE_FAIL: "client.ai.model_pref_write_fail",
  CLIENT_AI_MODEL_PREF_CLEAR_FAIL: "client.ai.model_pref_clear_fail",
  CLIENT_AI_MODEL_PREF_INVALID: "client.ai.model_pref_invalid",

  // Payments Domain - Server
  PAYMENTS_INTENT_CREATED: "payments.intent_created",
  PAYMENTS_STATE_TRANSITION: "payments.state_transition",
  PAYMENTS_VERIFIED: "payments.verified",
  PAYMENTS_CONFIRMED: "payments.confirmed",
  PAYMENTS_STATUS_READ: "payments.status_read",

  // Payments Domain - Client
  CLIENT_PAYMENTS_CREDITS_SUMMARY_HTTP_ERROR:
    "client.payments.credits_summary_http_error",
  CLIENT_PAYMENTS_CREDITS_SUMMARY_NETWORK_ERROR:
    "client.payments.credits_summary_network_error",
  CLIENT_PAYMENTS_HTTP_ERROR: "client.payments.http_error",
  CLIENT_PAYMENTS_FLOW_WALLET_WRITE_ERROR:
    "client.payments.flow_wallet_write_error",
  CLIENT_PAYMENTS_FLOW_RECEIPT_ERROR: "client.payments.flow_receipt_error",

  // Setup Domain - Server
  SETUP_DAO_VERIFY_COMPLETE: "setup.dao_verify_complete",

  // Adapter Events
  ADAPTER_LITELLM_COMPLETION_RESULT: "adapter.litellm.completion_result",
  ADAPTER_LITELLM_STREAM_RESULT: "adapter.litellm.stream_result",
  ADAPTER_LITELLM_USAGE_ERROR: "adapter.litellm.usage_error",

  // Invariant Warnings
  INV_PROVIDER_META_MODEL_MISSING: "inv_provider_meta_model_missing",
  INV_MODELS_CONTRACT_VALIDATION_FAILED:
    "inv_models_contract_validation_failed",

  // Error Codes
  AI_MODELS_CACHE_FETCH_FAILED: "ai.models_cache_fetch_failed",
  AI_CHAT_STREAM_FINALIZATION_LOST: "ai.chat_stream_finalization_lost",
  MODEL_VALIDATION_FAILED: "model_validation_failed",

  // Test Events
  TEST_EVENT: "TEST_EVENT",

  // Langfuse Lifecycle (per OBSERVABILITY.md#langfuse-integration)
  LANGFUSE_TRACE_CREATED: "langfuse.trace_created",
  LANGFUSE_TRACE_COMPLETED: "langfuse.trace_completed",
} as const;

export type EventName = (typeof EVENT_NAMES)[keyof typeof EVENT_NAMES];

// ============================================================================
// Base Field Enforcement (for logEvent() helper)
// ============================================================================

/**
 * Required base fields for all events.
 * reqId is ALWAYS required; routeId required for HTTP request events.
 */
export interface EventBase {
  reqId: string;
  routeId?: string;
}
