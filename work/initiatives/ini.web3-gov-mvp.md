---
work_item_id: ini.web3-gov-mvp
work_item_type: initiative
title: Web3 Governance MVP — Proposal Launcher Integration
state: Active
priority: 1
estimate: 3
summary: Integrate deep-linked DAO proposal creation into cogni-template via /merge-change page
outcome: Users can launch Aragon proposals from deep links with wallet auth, contract validation, and chain matching
assignees: derekg1729
created: 2026-02-07
updated: 2026-02-07
labels: [web3, governance]
---

# Web3 Governance MVP — Proposal Launcher Integration

> Source: docs/PROPOSAL_LAUNCHER.md

## Goal

Integrate deep-linked DAO proposal creation as one page in cogni-template. One new page at `/merge-change` (legacy path for backcompat with `proposal.cognidao.org`) accepts URL query params and launches Aragon proposals via the user's connected wallet.

**Deep link example:**

```
/merge-change?dao=0xF480b...&plugin=0xDD5bB...&signal=0x804CB...&chainId=11155111&repoUrl=https%3A//github.com/Cogni-DAO/repo&pr=56&action=merge&target=change
```

**Source:** `cogni-proposal-launcher` (reference implementation)

## Roadmap

### Crawl (P0)

**Goal:** Core proposal launch page with validation and auth gate.

| Deliverable                                                            | Status      | Est | Work Item |
| ---------------------------------------------------------------------- | ----------- | --- | --------- |
| Create `src/features/governance/lib/deeplink.ts` (hardened validation) | Not Started | 1   | —         |
| Create `src/shared/web3/abis/governance.ts` (ABIs)                     | Not Started | 1   | —         |
| Create `src/app/(app)/merge-change/page.tsx` (server auth gate)        | Not Started | 1   | —         |
| Create `src/app/(app)/merge-change/MergeChangeClient.tsx` (client)     | Not Started | 2   | —         |
| Test with Sepolia deep link                                            | Not Started | 1   | —         |

### Walk (P1)

**Goal:** Production routing and backcompat.

| Deliverable                                                    | Status      | Est | Work Item            |
| -------------------------------------------------------------- | ----------- | --- | -------------------- |
| Update Caddy to route `proposal.cognidao.org` → cogni-template | Not Started | 1   | (create at P1 start) |

### Run (P2+)

**Goal:** Expanded governance actions beyond merge proposals.

| Deliverable                                       | Status      | Est | Work Item            |
| ------------------------------------------------- | ----------- | --- | -------------------- |
| Extend `action`/`target` enums for new operations | Not Started | 2   | (create at P2 start) |

## Constraints

- **Server-side auth gate** — Redirect unauthenticated users to `/login?returnTo=<full-url>` preserving query string
- **Legacy path backcompat** — Use `/merge-change` to match `cogni-git-review` generated links
- **Hardened validation** — Whitelist `action`/`target` values, require `https://github.com` for `repoUrl`
- **Contract safety** — Verify `getCode()` returns non-empty for dao/plugin/signal before enabling submit
- **Chain match** — Disable submit if connected wallet chain ≠ `chainId` param

## Dependencies

- [ ] WalletProvider (`src/app/providers/wallet.client.tsx`) — wagmi + RainbowKit configured
- [ ] Chain config (`src/shared/web3/chain.ts`) — Sepolia set up
- [ ] Auth (`src/auth.ts`) — SIWE session via `auth()`

## As-Built Specs

- (none yet — specs created when code merges)

## Design Notes

### Deep Link Parameters (mergeSpec)

| Param     | Kind      | Description                          |
| --------- | --------- | ------------------------------------ |
| `dao`     | addr      | DAO contract address (0x + 40 hex)   |
| `plugin`  | addr      | Aragon TokenVoting plugin address    |
| `signal`  | addr      | CogniSignal contract address         |
| `chainId` | int       | Target chain ID (e.g., 11155111)     |
| `repoUrl` | githubUrl | GitHub repo URL (https://github.com) |
| `pr`      | int       | Pull request number                  |
| `action`  | enum      | Allowed: `merge`                     |
| `target`  | enum      | Allowed: `change`                    |

### Validation Kinds

| Kind        | Rule                                     |
| ----------- | ---------------------------------------- |
| `addr`      | Regex: `/^0x[0-9a-fA-F]{40}$/`           |
| `int`       | Regex: `/^\d+$/`                         |
| `githubUrl` | URL parse + `https:` + `github.com` host |
| `action`    | Whitelist: `["merge"]`                   |
| `target`    | Whitelist: `["change"]`                  |

### Contract ABIs Required

| ABI              | Source Contract    | Functions Used     |
| ---------------- | ------------------ | ------------------ |
| COGNI_SIGNAL_ABI | CogniSignal        | `signal()`         |
| TOKEN_VOTING_ABI | Aragon TokenVoting | `createProposal()` |

### File Pointers

| File                                               | Purpose                         |
| -------------------------------------------------- | ------------------------------- |
| `src/features/governance/lib/deeplink.ts`          | Validation function + mergeSpec |
| `src/shared/web3/abis/governance.ts`               | Contract ABIs                   |
| `src/app/(app)/merge-change/page.tsx`              | Server component (auth gate)    |
| `src/app/(app)/merge-change/MergeChangeClient.tsx` | Client component (wagmi + tx)   |

### Reference Implementation (proposal-launcher)

| File                                                                  | What to copy                  |
| --------------------------------------------------------------------- | ----------------------------- |
| `/Users/derek/dev/cogni-proposal-launcher/src/lib/deeplink.ts`        | `validate()` function pattern |
| `/Users/derek/dev/cogni-proposal-launcher/src/lib/deeplinkSpecs.ts`   | Spec structure                |
| `/Users/derek/dev/cogni-proposal-launcher/src/lib/abis.ts`            | ABI definitions               |
| `/Users/derek/dev/cogni-proposal-launcher/src/pages/merge-change.tsx` | Page logic pattern            |

### Reused Infrastructure

| Existing       | Location                              | Notes                         |
| -------------- | ------------------------------------- | ----------------------------- |
| WalletProvider | `src/app/providers/wallet.client.tsx` | wagmi + RainbowKit configured |
| Chain config   | `src/shared/web3/chain.ts`            | Sepolia set up                |
| Auth           | `src/auth.ts`                         | SIWE session via `auth()`     |

### Routing / Backcompat

| Domain                  | Path            | Behavior                          |
| ----------------------- | --------------- | --------------------------------- |
| `proposal.cognidao.org` | `/merge-change` | Route to cogni-template via Caddy |
| `app.cognidao.org`      | `/merge-change` | Same page, same logic             |

### Safety Checks (before submit enabled)

- Auth — Server-side redirect to login if no session
- Chain match — `chainId` param vs connected wallet chain
- Contract existence — `getCode()` for dao/plugin/signal (must be non-empty)
- Param validation — Whitelist actions/targets, require GitHub https URL
