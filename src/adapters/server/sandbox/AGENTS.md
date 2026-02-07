# sandbox · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2026-02-07
- **Status:** draft

## Purpose

Docker-based sandbox adapter for network-isolated command execution with LLM proxy support. Implements `SandboxRunnerPort` using dockerode; delegates proxy lifecycle to `LlmProxyManager`.

## Pointers

- [Sandbox Spec](../../../../docs/SANDBOXED_AGENTS.md)
- [Sandbox Runtime](../../../../services/sandbox-runtime/)
- [Port Definition](../../../ports/sandbox-runner.port.ts)
- [Proxy Config Template](../../../../platform/infra/services/sandbox-proxy/nginx.conf.template)

## Boundaries

```json
{
  "layer": "adapters/server",
  "may_import": ["ports", "shared", "types"],
  "must_not_import": ["app", "features", "core", "contracts"]
}
```

## Public Surface

- **Exports:** `SandboxRunnerAdapter`, `SandboxRunnerAdapterOptions`, `LlmProxyManager`, `LlmProxyConfig`, `LlmProxyHandle`, `SandboxGraphProvider`, `SANDBOX_PROVIDER_ID`, `SandboxAgentCatalogProvider`
- **Routes:** none
- **CLI:** none
- **Env/Config keys:** none (image name, litellmMasterKey configurable via constructor)
- **Files considered API:** index.ts barrel export (not re-exported from parent server barrel — consumers use subpath imports to avoid Turbopack bundling dockerode native addon chain)

## Ports

- **Uses ports:** none (SandboxGraphProvider uses SandboxRunnerPort internally)
- **Implements ports:** `SandboxRunnerPort` (adapter), `GraphProvider` (sandbox-graph.provider), `AgentCatalogProvider` (sandbox-agent-catalog.provider)
- **Contracts:** tests/integration/sandbox/, tests/stack/sandbox/

## Responsibilities

- This directory **does**: Create ephemeral Docker containers; enforce network=none isolation; manage LLM proxy containers (nginx:alpine on sandbox-internal network); share socket via Docker volume at `/llm-sock`; inject billing identity and metadata headers; collect stdout/stderr; handle timeouts and OOM; cleanup containers and volumes; route `sandbox:*` graphIds through the graph execution pipeline (SandboxGraphProvider); list sandbox agents in UI catalog (SandboxAgentCatalogProvider)
- This directory **does not**: Manage long-lived containers; implement agent logic (agent runs inside container); pass credentials to sandbox containers

## Usage

```typescript
import { SandboxRunnerAdapter } from "@/adapters/server/sandbox";

const runner = new SandboxRunnerAdapter({
  imageName: "cogni-sandbox-runtime:latest",
  litellmMasterKey: process.env.LITELLM_MASTER_KEY,
});
const result = await runner.runOnce({
  runId: "task-123",
  workspacePath: "/tmp/workspace",
  argv: ["echo hello"],
  limits: { maxRuntimeSec: 30, maxMemoryMb: 256 },
  llmProxy: { enabled: true, billingAccountId: "acct-1", attempt: 0 },
});
await runner.dispose(); // stop all proxy containers
```

## Standards

- Containers are one-shot and ephemeral (P0 invariant)
- Network isolation via `NetworkMode: 'none'`
- All capabilities dropped (`CapDrop: ['ALL']`)
- Non-root user execution (`sandboxer`)
- Socket sharing via Docker volumes (not bind mounts) to avoid macOS osxfs issues and tmpfs masking
- All dockerode exec streams have bounded timeouts (never await unbounded `stream.on('end')`)
- Proxy containers labeled `cogni.role=llm-proxy` for sweep-based cleanup

## Dependencies

- **Internal:** ports/, shared/observability/
- **External:** dockerode, nginx:alpine image

## Change Protocol

- Update this file when **Exports** or **Port implementations** change
- Bump **Last reviewed** date
- Ensure integration and stack tests pass

## Notes

- Requires `cogni-sandbox-runtime:latest` image built from services/sandbox-runtime/
- Requires `nginx:alpine` image for proxy containers
- Requires `sandbox-internal` Docker network for proxy ↔ LiteLLM connectivity
- `LlmProxyManager.cleanupSweep()` removes orphaned proxy containers by label filter
