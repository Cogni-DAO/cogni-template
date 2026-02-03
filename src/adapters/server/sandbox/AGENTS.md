# sandbox · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2025-02-03
- **Status:** draft

## Purpose

Docker-based sandbox adapter for network-isolated command execution. Implements `SandboxRunnerPort` using dockerode for container lifecycle management.

## Pointers

- [Sandbox Spec](../../../../docs/SANDBOXED_AGENTS.md)
- [Sandbox Runtime](../../../../services/sandbox-runtime/)
- [Port Definition](../../../ports/sandbox-runner.port.ts)

## Boundaries

```json
{
  "layer": "adapters/server",
  "may_import": ["ports", "shared", "types"],
  "must_not_import": ["app", "features", "core", "contracts"]
}
```

## Public Surface

- **Exports:** `SandboxRunnerAdapter`
- **Routes:** none
- **CLI:** none
- **Env/Config keys:** none (image name configurable via constructor)
- **Files considered API:** index.ts barrel export

## Ports

- **Uses ports:** none
- **Implements ports:** `SandboxRunnerPort`
- **Contracts:** tests/integration/sandbox/

## Responsibilities

- This directory **does**: Create ephemeral Docker containers; enforce network=none isolation; mount workspace directories; collect stdout/stderr; handle timeouts and OOM; cleanup containers
- This directory **does not**: Manage long-lived containers; handle LLM orchestration; pass credentials to containers; implement business logic

## Usage

```typescript
import { SandboxRunnerAdapter } from "@/adapters/server/sandbox";

const runner = new SandboxRunnerAdapter({
  imageName: "cogni-sandbox-runtime:latest",
});
const result = await runner.runOnce({
  runId: "task-123",
  workspacePath: "/tmp/workspace",
  command: "echo hello",
  limits: { maxRuntimeSec: 30, maxMemoryMb: 256 },
});
```

## Standards

- Containers are one-shot and ephemeral (P0 invariant)
- Network isolation via `NetworkMode: 'none'`
- All capabilities dropped (`CapDrop: ['ALL']`)
- Non-root user execution (`sandboxer`)
- Manual container cleanup in finally block (no AutoRemove)

## Dependencies

- **Internal:** ports/, shared/observability/
- **External:** dockerode

## Change Protocol

- Update this file when **Exports** or **Port implementations** change
- Bump **Last reviewed** date
- Ensure integration tests pass

## Notes

- Requires `cogni-sandbox-runtime:latest` image built from services/sandbox-runtime/
- Log demuxing handles Docker's 8-byte header frames for stdout/stderr separation
