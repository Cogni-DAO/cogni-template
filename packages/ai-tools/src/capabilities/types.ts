// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/ai-tools/capabilities/types`
 * Purpose: Capability interfaces for tool execution.
 * Scope: Defines tool-facing capability interfaces. Does NOT depend on ai-core (ai-core treats these as opaque).
 * Invariants:
 *   - AUTH_VIA_CAPABILITY_INTERFACE: Tools receive auth via capabilities, not context
 *   - NO_SECRETS_IN_CONTEXT: Capabilities resolve secrets, never stored in context
 *   - FIX_LAYERING_CAPABILITY_TYPES: Capability interfaces live here, NOT in ai-core
 * Side-effects: none
 * Links: TOOL_USE_SPEC.md #29, TENANT_CONNECTIONS_SPEC.md #9
 * @public
 */

/**
 * Authentication capability for tools requiring external auth.
 *
 * Per AUTH_VIA_CAPABILITY_INTERFACE (TOOL_USE_SPEC.md #29):
 * Tools receive credentials through capability interfaces, NOT via context fields.
 * This prevents secret leakage into logs/traces/exceptions.
 *
 * Implementations are provided by composition root (src/bootstrap/ai/tool-bindings.ts)
 * and backed by ConnectionBroker.
 */
export interface AuthCapability {
  /**
   * Get access token for the given connection.
   * Resolves via ConnectionBroker at invocation time.
   *
   * @param connectionId - Connection reference (must match ctx.connectionId)
   * @returns Access token string
   * @throws If connectionId invalid or resolution fails
   */
  getAccessToken(connectionId: string): Promise<string>;

  /**
   * Get auth headers for the given connection.
   * Useful for APIs that need Authorization headers.
   *
   * @param connectionId - Connection reference
   * @returns Headers object (e.g., { Authorization: "Bearer ..." })
   */
  getAuthHeaders(connectionId: string): Promise<Record<string, string>>;
}

/**
 * Clock capability for time-dependent tools.
 * Allows testing with deterministic time.
 */
export interface ClockCapability {
  /** Get current timestamp in milliseconds */
  now(): number;
  /** Get current date/time as ISO string */
  nowIso(): string;
}

/**
 * Capabilities injected into tool execution by toolRunner.
 * Backed by broker/adapter implementations.
 *
 * Per AUTH_VIA_CAPABILITY_INTERFACE: tools receive auth via capabilities,
 * never via raw secrets in context.
 *
 * Per FIX_LAYERING_CAPABILITY_TYPES: This interface is defined in ai-tools,
 * and ai-core treats it as opaque (unknown) in its generic signatures.
 */
export interface ToolCapabilities {
  /** Auth capability for authenticated tools (optional) */
  readonly auth?: AuthCapability;
  /** Clock capability for time-dependent tools (optional) */
  readonly clock?: ClockCapability;
  // Extensible for future capabilities
}
