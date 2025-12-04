# check:full - CI-Parity Test Gate

## Purpose

Local convenience wrapper that runs the exact same test suite CI runs, with full infrastructure. Solves the "works locally, fails in CI" problem by providing deterministic, reproducible test execution.

## Usage

```bash
# Full run (rebuild Docker images)
pnpm check:full

# Fast run (reuse existing images)
pnpm check:full:fast
```

## What It Does

```
1. Pre-flight checks (port 55432, 4000)
2. docker:test:stack (--build or :fast)
3. docker:test:stack:setup (provision + migrate)
4. pnpm test:unit
5. pnpm test:int
6. pnpm test:contract
7. pnpm test:stack:docker
8. docker:test:stack:down (always via trap)
```

## Key Features

- **Trap-based cleanup**: `EXIT INT TERM` ensures teardown even on Ctrl-C
- **Port conflict detection**: Fails fast if ports already in use
- **Deterministic env**: Uses `.env.test`, never reads `.env.local`
- **Same commands as CI**: No divergence between local and CI behavior

## Architecture

```
scripts/check-full.sh        # Orchestrator
├── Pre-flight checks
├── Stack lifecycle management
├── Sequential test execution (same order as CI)
└── Guaranteed teardown (trap)

package.json
├── check:full               # Full build + all tests
├── check:full:fast          # Skip Docker rebuild
├── test:contract            # NEW: Contract tests
├── docker:test:stack:down   # NEW: Teardown command
└── (reuses existing test:* commands)
```

## CI Integration

**CI workflows remain unchanged** - they continue to use granular steps for:

- Caching per step
- Parallel execution where possible
- Fine-grained rerun control
- Clear failure logs

`check:full` is purely a **local convenience tool** that mirrors CI behavior.

## Comparison with `check`

| Command      | Time  | Infrastructure | Purpose                                 |
| ------------ | ----- | -------------- | --------------------------------------- |
| `check`      | ~30s  | None           | Fast feedback (lint+type+unit)          |
| `check:full` | ~2min | Full stack     | CI-parity gate (all tests)              |
| `check:ci`   | ~3min | Full stack     | CI + e2e (legacy, consider deprecating) |

## Troubleshooting

### Port already in use

```bash
# Teardown any running test stack
pnpm docker:test:stack:down

# Or force remove all containers
docker compose -f platform/infra/services/runtime/docker-compose.dev.yml down -v
```

### Tests fail but CI passes

- Verify you're on latest main: `git pull origin main`
- Verify `.env.test` matches `.env.test.example`
- Try full rebuild: `pnpm check:full` (not `:fast`)

### Tests pass but CI fails

- Check if you have uncommitted changes
- Verify all dependencies in `package.json` are committed
- Check if `.env.test` in your branch differs from main

## Implementation Details

- Script: `scripts/check-full.sh`
- Test configs: `vitest.config.mts`, `vitest.integration.config.mts`, `vitest.stack.config.mts`
- Compose file: `platform/infra/services/runtime/docker-compose.dev.yml`
- Env file: `.env.test` (never `.env.local`)

## Future Enhancements (Not MVP)

- `--only-stack`: Skip unit/int, only run stack tests
- `--watch`: Re-run on file changes
- `--verbose`: Show container logs on failure
- Parallel test execution (once isolation is proven stable)
