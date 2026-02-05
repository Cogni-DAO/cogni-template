# Database Configuration: Single Source of Truth

> [!CRITICAL]
> **Phased Reality:** Runtime containers are DSN-only today. Provisioning is transitioning to DSN-only. Until P1, provisioning uses component vars (`APP_DB_*`, `POSTGRES_ROOT_*`), but these must **never** reach runtime containers.

---

## End State Contract (Target: P2)

Three DSNs are the only database secrets:

| Secret                 | Purpose                          | Consumed By               |
| ---------------------- | -------------------------------- | ------------------------- |
| `DATABASE_ROOT_URL`    | Admin/superuser for provisioning | `db-provision` only       |
| `DATABASE_URL`         | App user (RLS enforced)          | `app`, `migrate`          |
| `DATABASE_SERVICE_URL` | Service user (BYPASSRLS)         | `app`, `scheduler-worker` |

**No `APP_DB_*` or `POSTGRES_ROOT_*` secrets exist in the end state.**

---

## Core Invariants

### INV-1: AUTHORITATIVE_INPUTS_PER_PHASE

| Phase        | Provisioning Inputs                                         | Runtime Inputs                         |
| ------------ | ----------------------------------------------------------- | -------------------------------------- |
| **P0** (now) | Component vars + `POSTGRES_ROOT_*`                          | `DATABASE_URL`, `DATABASE_SERVICE_URL` |
| **P1**       | `DATABASE_ROOT_URL`, `DATABASE_URL`, `DATABASE_SERVICE_URL` | `DATABASE_URL`, `DATABASE_SERVICE_URL` |
| **P2**       | Same as P1                                                  | Same as P1                             |

### INV-2: RUNTIME_DSN_ONLY

Runtime containers (`app`, `scheduler-worker`, `migrate`) receive **only** `DATABASE_URL` and/or `DATABASE_SERVICE_URL`. They never receive:

- `DATABASE_ROOT_URL`
- `APP_DB_*` component vars
- `POSTGRES_ROOT_*` credentials

**Enforcement:** CI validation fails if runtime container env blocks contain forbidden vars.

### INV-3: ROLE_ISOLATION

- `DATABASE_URL.username` ≠ `DATABASE_SERVICE_URL.username`
- Denylist: `{postgres, root, admin, superuser}`
- **Enforcement:** `validate-dsns.sh` in CI; runtime startup invariant check

### INV-4: NO_HARDCODED_HOSTS_IN_CODE

Provisioner and CI scripts must not assume `postgres:5432` or any specific host/port. Host and port are:

- Parsed from DSNs at runtime (using `URL` class or equivalent)
- Injected via environment in provisioning lane

**Enforcement:** Code review; no literal `postgres` or `5432` in scripts except in example `.env` files.

---

## Provisioning Lane vs Runtime Lane

```
┌─────────────────────────────────────────────────────────────────────┐
│ PROVISIONING LANE (db-provision container)                          │
│ ─────────────────────────────────────────                           │
│ Responsibilities:                                                   │
│   - CREATE/ALTER ROLE                                               │
│   - GRANT privileges                                                │
│   - ALTER DATABASE ... OWNER                                        │
│   - ALTER DEFAULT PRIVILEGES                                        │
│                                                                     │
│ Credentials (P0): POSTGRES_ROOT_*, APP_DB_*                         │
│ Credentials (P1+): DATABASE_ROOT_URL, DATABASE_URL,                 │
│                    DATABASE_SERVICE_URL                             │
│                                                                     │
│ Trust boundary: runs once at deploy, before app starts              │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼ provisioning complete
┌─────────────────────────────────────────────────────────────────────┐
│ RUNTIME LANE (app, scheduler-worker, migrate)                       │
│ ─────────────────────────────────────────────                       │
│ Responsibilities:                                                   │
│   - Serve HTTP traffic                                              │
│   - Execute background jobs                                         │
│   - Run migrations (RLS-enforced)                                   │
│                                                                     │
│ Credentials: DATABASE_URL, DATABASE_SERVICE_URL only                │
│                                                                     │
│ Trust boundary: never has admin privileges                          │
└─────────────────────────────────────────────────────────────────────┘
```

**PROVISIONING_TRUST_BOUNDARY:** Provisioning credentials (`DATABASE_ROOT_URL` or `POSTGRES_ROOT_*`) must never cross into runtime containers. This is a hard security boundary.

---

## Per-Container Env Contract

| Container          | P0 (Now)                               | P1+ (Target)                                                |
| ------------------ | -------------------------------------- | ----------------------------------------------------------- |
| `app`              | `DATABASE_URL`, `DATABASE_SERVICE_URL` | Same                                                        |
| `scheduler-worker` | `DATABASE_URL` (= service DSN)         | Same                                                        |
| `migrate`          | `DATABASE_URL` (= app DSN)             | Same                                                        |
| `db-provision`     | `POSTGRES_ROOT_*`, `APP_DB_*`          | `DATABASE_ROOT_URL`, `DATABASE_URL`, `DATABASE_SERVICE_URL` |

**Forbidden in runtime containers (all phases):** `APP_DB_*`, `POSTGRES_ROOT_*`, `DATABASE_ROOT_URL`

---

## Roadmap

### P0: Enforce Runtime Isolation (Current)

- [x] Create `validate-dsns.sh` (distinct users, no superusers, non-empty, masks outputs)
- [x] Call validation script from `deploy-production.yml` and `staging-preview.yml`
- [x] Validate runtime env does NOT include `APP_DB_*` / `POSTGRES_ROOT_*` (enforced by `assertEnvInvariants()` + docker-compose verified)
- [x] Update INFRASTRUCTURE_SETUP.md: document two config surfaces (runtime DSNs + provisioning inputs)

**P0 Outcome:** Runtime is DSN-only; provisioning still uses component vars; drift is prevented by CI.

### P1: DSN-Only Provisioning

- [ ] Add `DATABASE_ROOT_URL` secret (admin DSN for provisioning)
- [ ] Implement Node provisioner (`provision.ts`) that parses all 3 DSNs with `URL()` class
- [ ] Update `db-provision` container env: only `DATABASE_ROOT_URL`, `DATABASE_URL`, `DATABASE_SERVICE_URL`
- [ ] Delete `APP_DB_*` usage from provisioner codepath

**P1 Outcome:** Provisioner consumes only DSNs; component vars are dead code.

### P2: Secret Cleanup

- [ ] Delete `APP_DB_*` secrets from GitHub
- [ ] Delete `POSTGRES_ROOT_USER`, `POSTGRES_ROOT_PASSWORD` secrets
- [ ] Update docs: "Only 3 DSNs exist"
- [ ] Add `DATABASE_ROOT_URL` to INFRASTRUCTURE_SETUP.md secret table

**P2 Outcome:** Single source of truth achieved; 3 DSNs are the only database secrets.

### Future: IaC Lane (Optional)

Terraform/OpenTofu can manage role creation as an alternative to CD-time provisioning. This is the preferred long-term approach for production, but CD-time provisioner remains valid if convergent (idempotent).

---

## File Pointers

| File                                        | P0 Change                                                         |
| ------------------------------------------- | ----------------------------------------------------------------- |
| `platform/ci/scripts/validate-dsns.sh`      | ✅ Created                                                        |
| `.github/workflows/deploy-production.yml`   | ✅ Calls validator; TODO: verify no forbidden vars in runtime env |
| `.github/workflows/staging-preview.yml`     | ✅ Calls validator; TODO: verify no forbidden vars in runtime env |
| `platform/runbooks/INFRASTRUCTURE_SETUP.md` | Document two config surfaces                                      |

---

**Last Updated**: 2026-02-05
**Status**: In Progress (P0)
