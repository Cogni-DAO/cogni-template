# Database URL Single Source of Truth

> [!CRITICAL]
> `DATABASE_URL` and `DATABASE_SERVICE_URL` are the only authoritative secrets. Component vars exist solely for provisioning; they must never reach runtime containers.

## Core Invariants

1. **DSN-First**: DSNs are authoritative; generating DSNs from component secrets is forbidden
2. **Runtime Isolation**: Only `DATABASE_URL` and `DATABASE_SERVICE_URL` are passed to app containers
3. **Role Isolation**: Usernames in DSNs must differ; forbid `postgres`, `root`, superuser names (deploy-time check)
4. **No Hardcoded Hosts**: Hostname/port come from environment config, not baked into scripts

---

## Implementation Checklist

### P0: DSN-First Enforcement

- [ ] Create `platform/ci/scripts/validate-dsns.sh` (checks: distinct users, no superusers, non-empty, masks outputs)
- [ ] Call validation script from `deploy-production.yml` and `staging-preview.yml`
- [ ] Remove component vars (`APP_DB_USER`, etc.) from deploy env blocks—provisioner only
- [ ] Update INFRASTRUCTURE_SETUP.md: DSNs are authoritative, component secrets are provisioning-only

### P1: Component Secret Cleanup

- [ ] Audit provisioner: does it truly need component secrets, or can it parse DSNs?
- [ ] If provisioner can parse DSNs, delete component secrets from GitHub
- [ ] **Do NOT delete until provisioner is verified**

---

## File Pointers (P0 Scope)

| File                                        | Change                                                        |
| ------------------------------------------- | ------------------------------------------------------------- |
| `platform/ci/scripts/validate-dsns.sh`      | New: validation script (testable, greppable)                  |
| `.github/workflows/deploy-production.yml`   | Call validation script; remove component vars from deploy env |
| `.github/workflows/staging-preview.yml`     | Call validation script; remove component vars from deploy env |
| `platform/runbooks/INFRASTRUCTURE_SETUP.md` | DSNs authoritative; component secrets = provisioning-only     |

---

## Design Decisions

### 1. Source of Truth

**Rule:** DSNs are authoritative now. Component vars (`APP_DB_USER`, etc.) are legacy provisioning-only. Generating DSNs from component secrets is forbidden.

### 2. Per-Container Env Contract

| Container          | Env Vars                               | Notes                                     |
| ------------------ | -------------------------------------- | ----------------------------------------- |
| `app`              | `DATABASE_URL`, `DATABASE_SERVICE_URL` | Both roles available                      |
| `scheduler-worker` | `DATABASE_URL` (= service DSN)         | BYPASSRLS for background jobs             |
| `migrate`          | `DATABASE_URL` (= app DSN)             | RLS-enforced migrations                   |
| `db-provision`     | Component vars only                    | Legacy; only container that receives them |

---

### 3. Validation Flow (P0)

```
┌─────────────────────────────────────────────────────────────────────┐
│ VALIDATE DSNs (platform/ci/scripts/validate-dsns.sh)                │
│ ────────────────────────────────────────────────────                │
│ Inputs: DATABASE_URL, DATABASE_SERVICE_URL                          │
│ Checks:                                                             │
│   1. Both DSNs are non-empty                                        │
│   2. Usernames are distinct (bash parameter expansion)              │
│   3. Usernames ∉ {postgres, root, admin, superuser}                 │
│   4. Mask DSNs in workflow logs (echo "::add-mask::$DSN")           │
│ Output: exit 0 on success, exit 1 with message on failure           │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ DEPLOY (only DSNs in env)                                           │
│ ─────────────────────────                                           │
│ - DATABASE_URL=${{ secrets.DATABASE_URL }}                          │
│ - DATABASE_SERVICE_URL=${{ secrets.DATABASE_SERVICE_URL }}          │
│ - (No APP_DB_USER, APP_DB_PASSWORD, etc.)                           │
└─────────────────────────────────────────────────────────────────────┘
```

**Why a script?** Testable, greppable, reusable across workflows. Inline YAML is none of these.

---

### 4. Hostname Assumptions

| Environment                     | DB Host     | Notes                             |
| ------------------------------- | ----------- | --------------------------------- |
| Local dev (`pnpm dev:stack`)    | `localhost` | Host-network Postgres             |
| Docker dev (`docker:dev:stack`) | `postgres`  | Docker-internal service name      |
| Preview/Production              | `postgres`  | Docker-compose service name on VM |

**Rule:** Hostname is encoded in the DSN secret per-environment. Scripts must not assume any specific host.

---

**Last Updated**: 2026-02-05
**Status**: Draft
