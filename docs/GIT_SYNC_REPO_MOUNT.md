# Git-Sync Repo Mount

How the app container gets a read-only clone of the repo at runtime.

## Boot sequence

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
2. **git-sync** — runs as `1001:1001` (matches app). Shallow-clones `COGNI_REPO_URL` at `COGNI_REPO_REF` into `/repo`, symlinks `/repo/current`. One-shot (`GITSYNC_ONE_TIME=true`). Exits.
3. **app** — runs as `nextjs` (UID 1001). Mounts `repo_data:/repo:ro`. Reads via `COGNI_REPO_PATH=/repo/current`.

## Why UID 1001

The app image creates `nextjs` as UID 1001 (`Dockerfile:70-71`). Git 2.35.2+ rejects repos owned by a different user ("dubious ownership"). All three containers must agree on UID for the volume.

## Env vars

| Var               | Set where                             | Purpose                           |
| ----------------- | ------------------------------------- | --------------------------------- |
| `COGNI_REPO_PATH` | compose env (default `/repo/current`) | App reads repo from here          |
| `COGNI_REPO_SHA`  | compose env (from `COGNI_REPO_REF`)   | Optional sha override for adapter |
| `COGNI_REPO_URL`  | host env → compose                    | HTTPS clone URL for git-sync      |
| `COGNI_REPO_REF`  | host env → compose                    | Branch/tag/sha to clone           |
| `GIT_READ_TOKEN`  | host env → compose                    | Auth for private repos            |

## CI validation

After `docker compose up`, CI runs `platform/ci/scripts/probe-repo-volume.sh`:

```bash
docker exec app sh -lc 'git -C /repo/current rev-parse HEAD | grep -Eq "^[0-9a-f]{40}$"'
docker exec app sh -lc 'git -C /repo/current ls-files -- LICENSE* | grep -q LICENSE'
docker exec app sh -lc 'rg --version | head -n1 | grep -q "^ripgrep "'
```

Fails CI immediately if UID mismatch, volume mount, or missing binary.

## Stale volumes

`docker compose down` does **not** remove named volumes. A stale `repo_data` with wrong ownership persists across restarts. Use `docker compose down -v` (or `pnpm docker:nuke`) to force a fresh clone.

## Key files

| File                                                     | Lines   | What                                |
| -------------------------------------------------------- | ------- | ----------------------------------- |
| `Dockerfile`                                             | 70-71   | `nextjs` user UID 1001              |
| `platform/infra/services/runtime/docker-compose.dev.yml` | 200-229 | repo-init + git-sync (dev)          |
| `platform/infra/services/runtime/docker-compose.yml`     | 160-187 | repo-init + git-sync (prod)         |
| `src/shared/env/server.ts`                               | 159     | `COGNI_REPO_PATH` schema (required) |
| `src/bootstrap/capabilities/repo.ts`                     | —       | Factory wiring shaOverride          |
| `platform/ci/scripts/probe-repo-volume.sh`               | —       | CI container-boundary probe         |
| `.github/workflows/ci.yaml`                              | 351-352 | CI step invoking probe              |
