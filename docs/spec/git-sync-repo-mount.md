---
id: git-sync-repo-mount-spec
type: spec
title: Git-Sync Repo Mount
status: active
spec_state: draft
trust: draft
summary: How the app container gets a read-only clone of the repo at runtime via init containers, UID alignment, and named volumes.
read_when: Debugging repo mount issues, UID mismatches, stale volumes, or modifying the git-sync boot sequence.
owner: derekg1729
created: 2026-02-06
verified: 2026-02-06
tags: [deployment]
---

# Git-Sync Repo Mount

## Context

The app container needs read-only access to the repository at runtime (for repo-spec validation, agent context, etc.). This is provided by a three-container init sequence that clones the repo into a shared named volume with correct ownership.

## Goal

Provide the app container with a read-only, correctly-owned clone of the repository at a deterministic path (`/repo/current`), validated by CI before the app starts serving traffic.

## Non-Goals

- Live repo syncing / polling (one-shot clone only; `GITSYNC_ONE_TIME=true`)
- Write access to the repo from the app container (mount is read-only)
- Submodule support (shallow clone of main repo only)

## Core Invariants

1. **UID_ALIGNMENT**: All three containers (repo-init, git-sync, app) must agree on UID 1001 for the shared volume. Git 2.35.2+ rejects repos owned by a different user ("dubious ownership").

2. **READ_ONLY_MOUNT**: The app container mounts `repo_data:/repo:ro`. The app never writes to the repo volume.

3. **ONE_SHOT_CLONE**: git-sync runs with `GITSYNC_ONE_TIME=true` — clones once and exits. No polling, no background syncing.

4. **CI_PROBE_BEFORE_TRAFFIC**: CI validates the repo mount after `docker compose up` via `probe-repo-volume.sh` before any traffic is served.

## Design

### Boot Sequence

```
repo-init (root)          git-sync (1001:1001)          app (1001:1001)
    │                          │                             │
    ├─ chown 1001:1001 /repo   │                             │
    ├─ exit 0                  │                             │
    │                          ├─ clone → /repo/<sha>        │
    │                          ├─ symlink /repo/current → …  │
    │                          ├─ exit 0                     │
    │                          │                             ├─ mount /repo:ro
    │                          │                             ├─ read /repo/current
```

1. **repo-init** — busybox, runs as root (`0:0`). `chown -R 1001:1001 /repo` on the named volume. Exits.
2. **git-sync** — runs as `1001:1001` (matches app). Shallow-clones `COGNI_REPO_URL` at `COGNI_REPO_REF` into `/repo`, symlinks `/repo/current`. One-shot. Exits.
3. **app** — runs as `nextjs` (UID 1001). Mounts `repo_data:/repo:ro`. Reads via `COGNI_REPO_PATH=/repo/current`.

### Why UID 1001

The app image creates `nextjs` as UID 1001 (`Dockerfile:70-71`). Git 2.35.2+ rejects repos owned by a different user ("dubious ownership"). All three containers must agree on UID for the volume.

### Environment Variables

| Var               | Set where                             | Purpose                           |
| ----------------- | ------------------------------------- | --------------------------------- |
| `COGNI_REPO_PATH` | compose env (default `/repo/current`) | App reads repo from here          |
| `COGNI_REPO_SHA`  | compose env (from `COGNI_REPO_REF`)   | Optional sha override for adapter |
| `COGNI_REPO_URL`  | host env → compose                    | HTTPS clone URL for git-sync      |
| `COGNI_REPO_REF`  | host env → compose                    | Branch/tag/sha to clone           |
| `GIT_READ_TOKEN`  | host env → compose                    | Auth for private repos            |

### CI Validation

After `docker compose up`, CI runs `platform/ci/scripts/probe-repo-volume.sh`:

```bash
docker exec app sh -lc 'git -C /repo/current rev-parse HEAD | grep -Eq "^[0-9a-f]{40}$"'
docker exec app sh -lc 'git -C /repo/current ls-files -- LICENSE* | grep -q LICENSE'
docker exec app sh -lc 'rg --version | head -n1 | grep -q "^ripgrep "'
```

Fails CI immediately if UID mismatch, volume mount, or missing binary.

### Stale Volumes

`docker compose down` does **not** remove named volumes. A stale `repo_data` with wrong ownership persists across restarts. Use `docker compose down -v` (or `pnpm docker:nuke`) to force a fresh clone.

### File Pointers

| File                                                     | Role                                |
| -------------------------------------------------------- | ----------------------------------- |
| `Dockerfile`                                             | `nextjs` user UID 1001 (line 70-71) |
| `platform/infra/services/runtime/docker-compose.dev.yml` | repo-init + git-sync (dev)          |
| `platform/infra/services/runtime/docker-compose.yml`     | repo-init + git-sync (prod)         |
| `src/shared/env/server.ts`                               | `COGNI_REPO_PATH` schema (required) |
| `src/bootstrap/capabilities/repo.ts`                     | Factory wiring shaOverride          |
| `platform/ci/scripts/probe-repo-volume.sh`               | CI container-boundary probe         |
| `.github/workflows/ci.yaml`                              | CI step invoking probe              |

## Acceptance Checks

**Automated:**

- CI `probe-repo-volume.sh` validates: valid git SHA at `/repo/current`, LICENSE file present, `rg` binary available

**Manual:**

1. Verify `docker compose down && docker compose up` succeeds (stale volume with correct UID)
2. Verify `docker compose down -v && docker compose up` succeeds (clean volume)
3. Verify app cannot write to `/repo` (read-only mount)

## Open Questions

_(none)_

## Related

- [CI/CD](./ci-cd.md) — CI probe step
- [Environments](./environments.md) — Docker Compose deployment modes
