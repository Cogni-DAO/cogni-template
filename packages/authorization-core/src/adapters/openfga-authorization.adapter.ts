// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@cogni/authorization-core/adapters/openfga-authorization`
 * Purpose: AuthorizationPort implementation backed by OpenFGA check calls.
 * Scope: Maps Cogni authz actions to OpenFGA relations and performs direct or actor/subject dual checks. Resolves a stable store name to OpenFGA's generated store id when configured. Does not read env vars.
 * Invariants: AUTHZ_FAIL_CLOSED_WITH_DISTINCTION; OpenFGA is the sole permission/delegation source; no local role policy.
 * Side-effects: IO (OpenFGA SDK check calls)
 * Links: docs/spec/rbac.md, https://openfga.dev/docs/getting-started/setup-sdk-client
 * @public
 */

import { CredentialsMethod, OpenFgaClient } from "@openfga/sdk";

import {
  type AuthorizationPort,
  type AuthzCheckParams,
  type AuthzDecision,
  type AuthzRelationTuple,
  type AuthzSubcheck,
  type AuthzWriteDecision,
  authzUserResource,
  relationForAuthzAction,
} from "../index";

export interface OpenFgaCheckRequest {
  readonly user: string;
  readonly relation: string;
  readonly object: string;
}

export interface OpenFgaCheckResponse {
  readonly allowed?: boolean;
}

export interface OpenFgaCheckClient {
  check(request: OpenFgaCheckRequest): Promise<OpenFgaCheckResponse>;
}

export interface OpenFgaWriteClient extends OpenFgaCheckClient {
  writeTuples(
    tuples: AuthzRelationTuple[],
    options?: {
      readonly conflict?: {
        readonly onDuplicateWrites?: "error" | "ignore";
      };
    }
  ): Promise<unknown>;
  deleteTuples(
    tuples: AuthzRelationTuple[],
    options?: {
      readonly conflict?: {
        readonly onMissingDeletes?: "error" | "ignore";
      };
    }
  ): Promise<unknown>;
}

export interface OpenFgaStore {
  readonly id: string;
  readonly name: string;
}

export interface OpenFgaStoreClient extends OpenFgaCheckClient {
  listStores(options?: {
    readonly name?: string;
    readonly pageSize?: number;
    readonly continuationToken?: string;
  }): Promise<{ readonly stores?: readonly OpenFgaStore[] }>;
  createStore(request: {
    readonly name: string;
  }): Promise<{ readonly id: string }>;
}

export interface OpenFgaAuthorizationAdapterConfig {
  readonly apiUrl: string;
  readonly storeId?: string;
  readonly storeName?: string;
  readonly authorizationModelId?: string;
  readonly apiToken?: string;
  readonly timeoutMs?: number;
  /** Retries for idempotent write/delete on a transient failure (default 2). */
  readonly writeMaxRetries?: number;
  /** Fixed backoff between write retries, ms (default 100 — matches OpenFGA SDK). */
  readonly writeRetryBackoffMs?: number;
  readonly client?: OpenFgaCheckClient;
  readonly storeClient?: OpenFgaStoreClient;
}

interface PlannedSubcheck {
  readonly name: "permission" | "delegation";
  readonly user: string;
  readonly relation: string;
  readonly object: string;
}

const DEFAULT_TIMEOUT_MS = 1_500;
// Writes (approve/deny/revoke) are deliberate, low-frequency, and idempotent
// (onDuplicateWrites/onMissingDeletes: ignore) — safe to retry. Checks are hot-path
// and stay fail-closed-fast (no retry). Default 2 retries ≈ OpenFGA SDK's 3-attempt
// policy; 100ms backoff = its min_wait_in_ms.
const DEFAULT_WRITE_MAX_RETRIES = 2;
const DEFAULT_WRITE_RETRY_BACKOFF_MS = 100;

function openFgaClientConfig(
  config: OpenFgaAuthorizationAdapterConfig,
  storeId?: string
): ConstructorParameters<typeof OpenFgaClient>[0] {
  return {
    apiUrl: config.apiUrl,
    ...(storeId !== undefined ? { storeId } : {}),
    ...(config.apiToken !== undefined
      ? {
          credentials: {
            method: CredentialsMethod.ApiToken,
            config: { token: config.apiToken },
          },
        }
      : {}),
    ...(config.authorizationModelId !== undefined
      ? { authorizationModelId: config.authorizationModelId }
      : {}),
  };
}

class StoreNameResolvingOpenFgaClient implements OpenFgaWriteClient {
  private resolvedClient: Promise<OpenFgaCheckClient> | undefined;

  constructor(
    private readonly config: OpenFgaAuthorizationAdapterConfig,
    private readonly storeName: string
  ) {}

  async check(request: OpenFgaCheckRequest): Promise<OpenFgaCheckResponse> {
    const client = await this.resolveClient();
    return client.check(request);
  }

  async writeTuples(
    tuples: AuthzRelationTuple[],
    options?: {
      readonly conflict?: {
        readonly onDuplicateWrites?: "error" | "ignore";
      };
    }
  ): Promise<unknown> {
    const client = await this.resolveClient();
    if (!isOpenFgaWriteClient(client)) {
      throw new Error("OpenFGA write client unavailable");
    }
    return client.writeTuples(tuples, options);
  }

  async deleteTuples(
    tuples: AuthzRelationTuple[],
    options?: {
      readonly conflict?: {
        readonly onMissingDeletes?: "error" | "ignore";
      };
    }
  ): Promise<unknown> {
    const client = await this.resolveClient();
    if (!isOpenFgaWriteClient(client)) {
      throw new Error("OpenFGA write client unavailable");
    }
    return client.deleteTuples(tuples, options);
  }

  private resolveClient(): Promise<OpenFgaCheckClient> {
    this.resolvedClient ??= this.createResolvedClient();
    return this.resolvedClient;
  }

  private async createResolvedClient(): Promise<OpenFgaCheckClient> {
    const rootClient =
      this.config.storeClient ??
      (new OpenFgaClient(
        openFgaClientConfig(this.config)
      ) as OpenFgaStoreClient);
    const { stores = [] } = await rootClient.listStores({
      name: this.storeName,
      pageSize: 1,
    });
    const store = stores.find((candidate) => candidate.name === this.storeName);
    const storeId =
      store?.id ?? (await rootClient.createStore({ name: this.storeName })).id;

    if (this.config.storeClient !== undefined) return this.config.storeClient;

    return new OpenFgaClient(openFgaClientConfig(this.config, storeId));
  }
}

function unavailableCheck(check: PlannedSubcheck): AuthzSubcheck {
  return {
    ...check,
    decision: "deny",
    code: "authz_unavailable",
  };
}

function deniedDecision(
  code: "authz_denied" | "authz_unavailable",
  checks: readonly AuthzSubcheck[],
  reason?: string
): AuthzDecision {
  return {
    decision: "deny",
    code,
    checks,
    ...(reason !== undefined ? { reason } : {}),
  };
}

/**
 * Extract a stable, log-safe cause from an OpenFGA client error. Prefers the HTTP
 * status when present (distinguishes a 4xx model/validation reject from a transport
 * failure), else the error message (e.g. the withTimeout message, ECONNREFUSED).
 */
function errorMessage(error: unknown): string {
  if (error && typeof error === "object") {
    const status =
      (error as { statusCode?: unknown; status?: unknown }).statusCode ??
      (error as { status?: unknown }).status;
    if (typeof status === "number") {
      const msg = error instanceof Error ? error.message : String(error);
      return `status=${status} ${msg}`;
    }
  }
  return error instanceof Error ? error.message : String(error);
}

class OpenFgaTimeoutError extends Error {}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operation = "request"
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(
        new OpenFgaTimeoutError(
          `OpenFGA ${operation} timed out after ${timeoutMs}ms`
        )
      );
    }, timeoutMs);
  });

  // If the timeout wins, the underlying SDK promise stays pending and may reject
  // later (the slow request usually errors during an outage) — with nothing awaiting
  // it that becomes an unhandledRejection, multiplied per retry attempt. Swallow the
  // loser explicitly.
  promise.catch(() => {});

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Whether an OpenFGA failure is worth retrying. Transient = our own timeout, a
 * 5xx, a 429, or a bare transport error (no HTTP status). A 4xx (model/validation
 * reject, e.g. an unknown relation) is deterministic — retrying only wastes the
 * caller's latency budget, so it fails fast.
 */
function isTransientError(error: unknown): boolean {
  if (error instanceof OpenFgaTimeoutError) return true;
  if (error && typeof error === "object") {
    const status =
      (error as { statusCode?: unknown; status?: unknown }).statusCode ??
      (error as { status?: unknown }).status;
    if (typeof status === "number") return status >= 500 || status === 429;
  }
  // No HTTP status → transport-level failure (ECONNREFUSED/RESET, DNS) → transient.
  return true;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Retry a transient-failing async op with fixed backoff. OpenFGA's own SDKs retry
 * 3× on 429/5xx (min 100ms wait); our hand-rolled `withTimeout` race pre-empts that
 * built-in retry, so we restore it here for idempotent writes. A single cold-path
 * latency spike (connection re-establish — OpenFGA's documented p99 factor) that
 * crosses the per-attempt deadline is masked instead of surfacing a user-facing 503.
 * Only retries when `isTransientError`; deterministic 4xx fail on the first attempt.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number,
  backoffMs: number
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === maxRetries || !isTransientError(error)) throw error;
      await sleep(backoffMs);
    }
  }
  throw lastError;
}

export class OpenFgaAuthorizationAdapter implements AuthorizationPort {
  private readonly client: OpenFgaCheckClient;
  private readonly timeoutMs: number;
  private readonly writeMaxRetries: number;
  private readonly writeRetryBackoffMs: number;

  constructor(config: OpenFgaAuthorizationAdapterConfig) {
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.writeMaxRetries = config.writeMaxRetries ?? DEFAULT_WRITE_MAX_RETRIES;
    this.writeRetryBackoffMs =
      config.writeRetryBackoffMs ?? DEFAULT_WRITE_RETRY_BACKOFF_MS;
    if (config.client !== undefined) {
      this.client = config.client;
    } else if (config.storeId !== undefined) {
      this.client = new OpenFgaClient(
        openFgaClientConfig(config, config.storeId)
      );
    } else if (config.storeName !== undefined) {
      this.client = new StoreNameResolvingOpenFgaClient(
        config,
        config.storeName
      );
    } else {
      throw new Error("OpenFGA storeId or storeName is required");
    }
  }

  async check(params: AuthzCheckParams): Promise<AuthzDecision> {
    const checks = this.planChecks(params);
    const results = await Promise.all(
      checks.map((check) => this.runCheck(check))
    );

    if (results.some((result) => result.code === "authz_unavailable")) {
      return deniedDecision(
        "authz_unavailable",
        results,
        "OpenFGA unavailable"
      );
    }

    if (results.every((result) => result.decision === "allow")) {
      return {
        decision: "allow",
        code: "authz_allowed",
        checks: results,
      };
    }

    return deniedDecision("authz_denied", results, "OpenFGA denied");
  }

  async writeRelation(tuple: AuthzRelationTuple): Promise<AuthzWriteDecision> {
    const client = this.client;
    if (!isOpenFgaWriteClient(client)) {
      return {
        decision: "failure",
        code: "authz_write_unavailable",
        reason: "OpenFGA write client unavailable",
      };
    }

    try {
      await withRetry(
        () =>
          withTimeout(
            client.writeTuples([tuple], {
              conflict: { onDuplicateWrites: "ignore" },
            }),
            this.timeoutMs,
            "write"
          ),
        this.writeMaxRetries,
        this.writeRetryBackoffMs
      );
      return { decision: "success", code: "authz_write_success" };
    } catch (error) {
      // Surface the underlying cause (timeout vs connection-refused vs OpenFGA 4xx).
      // A bare `catch {}` here turns every write failure into an indistinguishable
      // `authz_write_unavailable`, which forces deep spelunking during an outage.
      return {
        decision: "failure",
        code: "authz_write_unavailable",
        reason: `OpenFGA write unavailable: ${errorMessage(error)}`,
      };
    }
  }

  async deleteRelation(tuple: AuthzRelationTuple): Promise<AuthzWriteDecision> {
    const client = this.client;
    if (!isOpenFgaWriteClient(client)) {
      return {
        decision: "failure",
        code: "authz_write_unavailable",
        reason: "OpenFGA write client unavailable",
      };
    }

    try {
      await withRetry(
        () =>
          withTimeout(
            client.deleteTuples([tuple], {
              conflict: { onMissingDeletes: "ignore" },
            }),
            this.timeoutMs,
            "delete"
          ),
        this.writeMaxRetries,
        this.writeRetryBackoffMs
      );
      return { decision: "success", code: "authz_write_success" };
    } catch (error) {
      return {
        decision: "failure",
        code: "authz_write_unavailable",
        reason: `OpenFGA delete unavailable: ${errorMessage(error)}`,
      };
    }
  }

  private planChecks(params: AuthzCheckParams): readonly PlannedSubcheck[] {
    const permission = {
      name: "permission" as const,
      user: params.subjectId ?? params.actorId,
      relation: relationForAuthzAction(params.action),
      object: params.resource,
    };

    if (!params.subjectId) return [permission];

    return [
      permission,
      {
        name: "delegation",
        user: params.actorId,
        relation: relationForAuthzAction("user.act_as"),
        object: authzUserResource(params.subjectId),
      },
    ];
  }

  private async runCheck(check: PlannedSubcheck): Promise<AuthzSubcheck> {
    try {
      const response = await withTimeout(
        this.client.check({
          user: check.user,
          relation: check.relation,
          object: check.object,
        }),
        this.timeoutMs,
        "check"
      );

      return {
        ...check,
        decision: response.allowed === true ? "allow" : "deny",
        code: response.allowed === true ? "authz_allowed" : "authz_denied",
      };
    } catch {
      return unavailableCheck(check);
    }
  }
}

function isOpenFgaWriteClient(
  client: OpenFgaCheckClient
): client is OpenFgaWriteClient {
  return "writeTuples" in client && "deleteTuples" in client;
}
