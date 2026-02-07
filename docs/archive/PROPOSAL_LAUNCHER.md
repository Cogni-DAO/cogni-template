# Proposal Launcher Integration

> Integrate deep-linked DAO proposal creation as one page in cogni-template.

**Status:** Design Ready
**Source:** `cogni-proposal-launcher` (reference implementation)

---

## Scope

One new page at `/merge-change` (legacy path for backcompat with `proposal.cognidao.org`) that accepts URL query params and launches Aragon proposals via the user's connected wallet.

**Deep link example:**

```
/merge-change?dao=0xF480b...&plugin=0xDD5bB...&signal=0x804CB...&chainId=11155111&repoUrl=https%3A//github.com/Cogni-DAO/repo&pr=56&action=merge&target=change
```

---

## Invariants

1. **Server-side auth gate** — Redirect unauthenticated users to `/login?returnTo=<full-url>` preserving query string
2. **Legacy path backcompat** — Use `/merge-change` to match `cogni-git-review` generated links
3. **Hardened validation** — Whitelist `action`/`target` values, require `https://github.com` for `repoUrl`
4. **Contract safety** — Verify `getCode()` returns non-empty for dao/plugin/signal before enabling submit
5. **Chain match** — Disable submit if connected wallet chain ≠ `chainId` param

---

## Definitions

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

---

## File Pointers

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

---

## Reused Infrastructure

| Existing       | Location                              | Notes                         |
| -------------- | ------------------------------------- | ----------------------------- |
| WalletProvider | `src/app/providers/wallet.client.tsx` | wagmi + RainbowKit configured |
| Chain config   | `src/shared/web3/chain.ts`            | Sepolia set up                |
| Auth           | `src/auth.ts`                         | SIWE session via `auth()`     |

---

## Routing / Backcompat

| Domain                  | Path            | Behavior                          |
| ----------------------- | --------------- | --------------------------------- |
| `proposal.cognidao.org` | `/merge-change` | Route to cogni-template via Caddy |
| `app.cognidao.org`      | `/merge-change` | Same page, same logic             |

---

## Implementation Checklist

- [ ] Create `src/features/governance/lib/deeplink.ts` (hardened validation)
- [ ] Create `src/shared/web3/abis/governance.ts` (ABIs)
- [ ] Create `src/app/(app)/merge-change/page.tsx` (server auth gate with returnTo)
- [ ] Create `src/app/(app)/merge-change/MergeChangeClient.tsx` (client component)
- [ ] Update Caddy to route `proposal.cognidao.org` → cogni-template
- [ ] Test with Sepolia deep link

---

## Safety Checks (before submit enabled)

- [ ] Auth — Server-side redirect to login if no session
- [ ] Chain match — `chainId` param vs connected wallet chain
- [ ] Contract existence — `getCode()` for dao/plugin/signal (must be non-empty)
- [ ] Param validation — Whitelist actions/targets, require GitHub https URL

---

**Last Updated:** 2025-12-08
