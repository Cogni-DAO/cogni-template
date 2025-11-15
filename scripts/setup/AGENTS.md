# setup · AGENTS.md

> Scope: this directory only. Keep ≤150 lines. Do not restate root policies.

## Metadata

- **Owners:** @derekg1729
- **Last reviewed:** 2025-11-15
- **Status:** draft

## Purpose

**Current:** Design docs and planning for future setup automation.  
**Future:** Will contain TypeScript scripts to automate repository setup for contributors and fork owners.

## Pointers

- [SETUP_DESIGN.md](./SETUP_DESIGN.md): Future architecture and implementation plan
- [README.md](../../README.md): Current manual setup instructions

## Boundaries

```json
{
  "layer": "scripts",
  "may_import": [],
  "must_not_import": ["*"]
}
```

## Public Surface

- **Exports:** none (no implementation yet)
- **Routes (if any):** none
- **CLI (if any):** Planned: `pnpm setup local|infra|github|dao`
- **Env/Config keys:** none currently
- **Files considered API:** none (planning phase)

## Responsibilities

- This directory **does**: Contains design docs for future setup automation
- This directory **does not**: Contain any working automation scripts yet

## Usage

**Current:**

```bash
# See README.md for current manual setup steps
```

**Planned:**

```bash
pnpm setup local     # Local development setup
pnpm setup infra     # Infrastructure provisioning
pnpm setup github    # GitHub environments + secrets
pnpm setup dao       # DAO contract deployment
```

## Standards

- Follow existing script conventions in `platform/bootstrap/install/*`
- Use TypeScript for complex logic, bash for simple wrappers
- All operations must be idempotent (safe to re-run)
- Clear error messages with actionable next steps

## Dependencies

- **Current:** None
- **Future:** Will use existing `platform/infra/providers/cherry/base/` Terraform configs

## Change Protocol

- Update this file when actual implementation begins
- Move status from "planning" to "draft" when first scripts are created
- Bump **Last reviewed** date when implementation starts

## Notes

- Currently contains only design documentation
- Implementation help wanted - see README.md for contribution info
- Priority: `pnpm setup local` command for contributors first
