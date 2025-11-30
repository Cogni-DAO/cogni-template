# Services Migration Guide (Phase 1)

This document details the migration from the current `src/`-only structure to the full services + packages architecture described in [ROADMAP.md](../ROADMAP.md).

## Target Directory Structure

```
cogni-template/
├── src/                          # Cogni node app (Next.js) - unchanged
│   ├── app/                      # App router
│   ├── core/                     # Domain logic
│   ├── ports/                    # Port interfaces
│   ├── adapters/                 # Infrastructure
│   ├── features/                 # Vertical slices
│   ├── contracts/                # (LEGACY) Zod API contracts - migrate to packages/contracts-public in Phase 5
│   └── ...
│
├── services/
│   ├── git-review-daemon/
│   │   ├── src/
│   │   │   ├── core/             # Domain logic
│   │   │   ├── ports/            # Port interfaces
│   │   │   ├── adapters/         # Infrastructure (GitHub, LLM, DB)
│   │   │   ├── bootstrap/        # DI container
│   │   │   └── entrypoint.ts     # HTTP server
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── cognicred/
│       ├── src/
│       │   ├── core/             # Scoring algorithms
│       │   ├── ports/            # EventConsumer, ScoreStore
│       │   ├── adapters/         # DB, HTTP
│       │   ├── bootstrap/
│       │   └── entrypoint.ts
│       ├── Dockerfile
│       ├── package.json
│       └── tsconfig.json
│
├── packages/
│   ├── contracts-public/
│   │   ├── src/
│   │   │   ├── manifest/         # repo-spec.yml schema
│   │   │   ├── git-review/       # Public API DTOs
│   │   │   ├── cognicred/        # Public API DTOs
│   │   │   └── webhooks/         # Webhook payload schemas
│   │   ├── COMPATIBILITY.md      # Version compatibility matrix
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── schemas-internal/
│   │   ├── src/
│   │   │   ├── events/           # contribution_event schema
│   │   │   └── billing/          # Internal billing types
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── clients-internal/
│   │   ├── src/
│   │   │   ├── billing/          # BillingClient
│   │   │   ├── git-review/       # GitReviewClient
│   │   │   └── cognicred/        # CognicredClient
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── core-primitives/
│       ├── src/
│       │   ├── logging/          # Structured logging
│       │   ├── env/              # Env parsing
│       │   ├── tracing/          # OpenTelemetry
│       │   └── http/             # HTTP client utils
│       ├── package.json
│       └── tsconfig.json
│
└── smart-contracts/              # Solidity DAO contracts (NOT src/contracts which is Zod)
    ├── src/
    │   ├── Token.sol             # DAO token
    │   ├── Governor.sol          # Governance (or Safe module)
    │   └── PaymentReceiver.sol   # USDC receiver
    ├── deploy/
    │   ├── deploy.ts             # Hardhat/Foundry deploy script
    │   └── config/               # Deploy PARAMS (gas, constructor args)
    │       ├── local.json        # Local dev deploy params
    │       ├── sepolia.json      # Testnet deploy params
    │       └── base.json         # Mainnet deploy params (no secrets)
    ├── test/                     # Contract tests
    ├── artifacts/                # Build output (gitignored)
    ├── addresses/                # Deployed ADDRESSES (separate from deploy params)
    │   ├── local.json            # Committed (dev deployed addresses)
    │   ├── sepolia.json          # Committed (testnet deployed addresses)
    │   └── .gitignore            # Excludes prod address files
    ├── hardhat.config.ts
    └── package.json
```

## Disambiguation: contracts/ vs smart-contracts/

| Directory                    | Contents                                                 | Format         |
| ---------------------------- | -------------------------------------------------------- | -------------- |
| `src/contracts/`             | (LEGACY) HTTP API request/response schemas               | Zod TypeScript |
| `packages/contracts-public/` | Public API contracts (replaces src/contracts in Phase 5) | Zod TypeScript |
| `smart-contracts/`           | Solidity DAO contracts for on-chain deployment           | Solidity       |

## Package Responsibilities

| Package            | Purpose                                                    | Consumers                         | Charter                       |
| ------------------ | ---------------------------------------------------------- | --------------------------------- | ----------------------------- |
| `contracts-public` | Versioned public API contracts, manifest schema            | External clients, src/, services/ | Semver, breaking change gates |
| `schemas-internal` | Internal event schemas (contribution_event), billing types | services/ only                    | -                             |
| `clients-internal` | Typed HTTP clients for service-to-service calls            | src/, services/                   | -                             |
| `core-primitives`  | Logging, env, tracing, HTTP utils                          | All packages, services/, src/     | **See charter below**         |

### core-primitives Charter

`packages/core-primitives` is strictly infrastructure-only:

- **Allowed**: logging, env parsing, tracing/telemetry, HTTP client utils, basic DB connection wrappers
- **Forbidden**: domain concepts, DTOs, auth logic, billing logic, tenant logic, business rules
- **Size budget**: If >20 exports or >2000 LOC, split into focused packages
- **Review gate**: Any PR adding exports requires explicit justification

## Dependency Rules

Enforced via dependency-cruiser in `.dependency-cruiser.cjs`:

```javascript
// Add to existing rules array
{
  name: 'services-only-import-packages',
  severity: 'error',
  from: { path: '^services/' },
  to: {
    pathNot: [
      '^packages/',
      '^node_modules/',
      '^services/[^/]+/src/'  // Allow internal imports
    ]
  }
},
{
  name: 'services-no-cross-import',
  severity: 'error',
  from: { path: '^services/([^/]+)/' },
  to: { path: '^services/(?!\\1)' }  // Cannot import other services
},
{
  name: 'src-no-direct-service-import',
  severity: 'error',
  from: { path: '^src/' },
  to: { path: '^services/' }
},
{
  name: 'packages-no-app-import',
  severity: 'error',
  from: { path: '^packages/' },
  to: { path: '^(src|services)/' }
}
```

## smart-contracts/ Structure

```
smart-contracts/
├── src/                    # Solidity sources
├── deploy/
│   ├── deploy.ts          # Main deploy script
│   └── config/            # Deploy PARAMS (gas, constructor args, etc.)
│       ├── local.json     # Local dev deploy params
│       ├── sepolia.json   # Testnet deploy params
│       └── base.json      # Mainnet deploy params (no secrets)
├── scripts/
│   └── dao-init.ts        # Post-deploy initialization
├── test/                   # Contract tests
├── artifacts/              # Build output (gitignored)
├── addresses/             # Deployed ADDRESSES (separate from deploy params)
│   ├── local.json         # Committed (dev deployed addresses)
│   ├── sepolia.json       # Committed (testnet deployed addresses)
│   └── .gitignore         # Excludes prod files
├── hardhat.config.ts
└── package.json
```

**Separation of concerns**:

- `deploy/config/*.json` — deployment parameters (gas, constructor args, etc.)
- `addresses/*.json` — deployed contract addresses only

**Runtime address precedence** (highest to lowest):

1. `ENV_OVERRIDE` (e.g., `CONTRACT_TOKEN_ADDRESS`)
2. Secure prod config/secret (e.g., Vault, sealed secret)
3. Committed dev/testnet file (`addresses/local.json`, `addresses/sepolia.json`)

**Key principles**:

- App-template owns DAO contracts - standalone deploy works without platform
- Address books are **environment-scoped**: only local/testnet addresses committed
- Prod addresses stored in secure config/env, NOT in git

## Migration Checklist

### Phase 1a: Packages Foundation

- [ ] Create `packages/` directory structure
- [ ] Initialize `packages/core-primitives` with logging, env, tracing
- [ ] Initialize `packages/contracts-public` with manifest schema
- [ ] Initialize `packages/schemas-internal` with contribution_event schema
- [ ] Initialize `packages/clients-internal` (empty, ready for Phase 2)
- [ ] Configure pnpm workspaces in root `package.json`
- [ ] Add dependency-cruiser rules
- [ ] Configure Turborepo for task caching (CI must pass without cache: `turbo --no-cache` or plain `pnpm`)

### Phase 1b: Services Scaffold

- [ ] Create `services/git-review-daemon` scaffold (hex structure, no logic)
- [ ] Create `services/cognicred` scaffold (hex structure, no logic)
- [ ] Add Dockerfiles for each service
- [ ] Configure separate `tsconfig.json` per service
- [ ] Verify dependency rules pass

### Phase 1c: Smart Contracts

- [ ] Create `smart-contracts/` directory structure
- [ ] Add placeholder Solidity contracts
- [ ] Configure Hardhat/Foundry
- [ ] Add deploy script scaffold
- [ ] Add environment-scoped address files (local.json, sepolia.json)

### Validation

- [ ] `pnpm check` passes
- [ ] Dependency-cruiser rules enforced
- [ ] All packages build independently
- [ ] Services scaffold builds
- [ ] No circular dependencies
- [ ] Turborepo task graph works

## pnpm Workspace Configuration

Add to root `package.json`:

```json
{
  "workspaces": ["packages/*", "services/*", "smart-contracts"]
}
```

Or create `pnpm-workspace.yaml`:

```yaml
packages:
  - "packages/*"
  - "services/*"
  - "smart-contracts"
```

## Service Internal Structure

Each service follows the same hex architecture as `src/`:

```
services/{name}/src/
├── core/           # Pure domain logic, no I/O
│   ├── model.ts    # Domain entities
│   ├── rules.ts    # Business rules
│   └── errors.ts   # Domain errors
├── ports/          # Interface definitions
│   └── *.port.ts
├── adapters/       # Infrastructure implementations
│   ├── server/     # Production adapters
│   └── test/       # Test fakes
├── bootstrap/      # DI container
│   └── container.ts
└── entrypoint.ts   # HTTP server startup
```

## Required Endpoints (Phase 2/3)

**IMPORTANT**: Every new service MUST implement these endpoints before Phase 4:

```typescript
// Required from Phase 2/3
GET /healthz    → 200 OK if process is alive
GET /readyz     → 200 OK if ready to accept traffic

// Added in Phase 4
GET /metrics    → Prometheus format metrics
```

This enables basic health monitoring even before full K8s deployment.

## Next Steps After Phase 1

- **Phase 2**: Implement git-review-daemon logic, wire to GitHub webhooks, add `/healthz` + `/readyz`
- **Phase 3**: Implement cognicred scoring, wire to event backbone, add `/healthz` + `/readyz`
- **Phase 4**: Add `/metrics`, graceful SIGTERM, migration jobs
- **Phase 5**: Migrate `src/contracts/` → `packages/contracts-public`
