# Proposal Launcher Integration

> Integrate deep-linked DAO proposal creation as one page in cogni-template.

**Status:** Design Ready
**Source:** `cogni-proposal-launcher` (reference implementation)

---

## Scope

One new page at `/governance` that accepts URL query params and launches Aragon proposals via the user's connected wallet.

**Deep link example:**

```
/governance?dao=0xF480b...&plugin=0xDD5bB...&signal=0x804CB...&chainId=11155111&repoUrl=https%3A//github.com/Cogni-DAO/repo&pr=56&action=merge&target=change
```

---

## Files to Create

### 1. Deep Link Validation (copy from proposal-launcher)

**`src/features/governance/lib/deeplink.ts`**

```typescript
type Kind = "addr" | "int" | "dec" | "str";

const addrRe = /^0x[0-9a-fA-F]{40}$/;
const intRe = /^\d+$/;
const decRe = /^\d+(\.\d+)?$/;

export function validate<T extends Record<string, Kind>>(
  query: Record<string, unknown>,
  spec: T
): Record<keyof T, string> | null {
  const out: Record<string, string> = {};
  for (const k in spec) {
    const raw = String(
      Array.isArray(query[k]) ? query[k][0] : (query[k] ?? "")
    );
    if (!raw) return null;
    const ok =
      spec[k] === "addr"
        ? addrRe.test(raw)
        : spec[k] === "int"
          ? intRe.test(raw)
          : spec[k] === "dec"
            ? decRe.test(raw)
            : true;
    if (!ok) return null;
    out[k] = raw;
  }
  return out;
}

export const mergeSpec = {
  dao: "addr",
  plugin: "addr",
  signal: "addr",
  chainId: "int",
  repoUrl: "str",
  pr: "int",
  action: "str",
  target: "str",
} as const;
```

### 2. Contract ABIs (copy from proposal-launcher)

**`src/shared/web3/abis/governance.ts`**

```typescript
export const COGNI_SIGNAL_ABI = [
  {
    type: "function",
    name: "signal",
    stateMutability: "nonpayable",
    inputs: [
      { name: "vcs", type: "string" },
      { name: "repoUrl", type: "string" },
      { name: "action", type: "string" },
      { name: "target", type: "string" },
      { name: "resource", type: "string" },
      { name: "extra", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

export const TOKEN_VOTING_ABI = [
  {
    type: "function",
    name: "createProposal",
    stateMutability: "nonpayable",
    inputs: [
      { name: "_metadata", type: "bytes" },
      {
        name: "_actions",
        type: "tuple[]",
        components: [
          { name: "to", type: "address" },
          { name: "value", type: "uint256" },
          { name: "data", type: "bytes" },
        ],
      },
      { name: "_allowFailureMap", type: "uint256" },
      { name: "_startDate", type: "uint64" },
      { name: "_endDate", type: "uint64" },
      { name: "_voteOption", type: "uint8" },
      { name: "_tryEarlyExecution", type: "bool" },
    ],
    outputs: [{ name: "proposalId", type: "uint256" }],
  },
] as const;
```

### 3. Page (Next.js App Router)

**`src/app/(app)/governance/page.tsx`**

```typescript
"use client"

import { useSearchParams } from "next/navigation"
import { useMemo } from "react"
import { useAccount, useChainId, useWriteContract, usePublicClient } from "wagmi"
import { encodeFunctionData } from "viem"
import { ConnectButton } from "@rainbow-me/rainbowkit"

import { validate, mergeSpec } from "@/features/governance/lib/deeplink"
import { COGNI_SIGNAL_ABI, TOKEN_VOTING_ABI } from "@/shared/web3/abis/governance"

export default function GovernancePage() {
  const searchParams = useSearchParams()
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const client = usePublicClient()
  const { writeContract, isPending, isSuccess, data, error } = useWriteContract()

  const params = useMemo(() => {
    const query = Object.fromEntries(searchParams.entries())
    return validate(query, mergeSpec)
  }, [searchParams])

  const requiredChainId = params ? parseInt(params.chainId) : 0
  const isCorrectChain = chainId === requiredChainId

  const createProposal = async () => {
    if (!params || !client || !address || !isCorrectChain) return

    const signalData = encodeFunctionData({
      abi: COGNI_SIGNAL_ABI,
      functionName: "signal",
      args: ["github", decodeURIComponent(params.repoUrl), params.action, params.target, params.pr, "0x"],
    })

    const actions = [{ to: params.signal as `0x${string}`, value: 0n, data: signalData }]
    const startDate = BigInt(Math.floor(Date.now() / 1000) + 60)
    const endDate = startDate + BigInt(3 * 24 * 60 * 60)

    await writeContract({
      address: params.plugin as `0x${string}`,
      abi: TOKEN_VOTING_ABI,
      functionName: "createProposal",
      args: ["0x" as `0x${string}`, actions, 0n, startDate, endDate, 0, false],
    })
  }

  if (!params) return <div>Invalid or missing parameters</div>

  return (
    <div>
      <h1>Create Merge Proposal</h1>
      <ConnectButton />
      {isConnected && (
        <>
          <p>PR #{params.pr} - {params.action}</p>
          <button onClick={createProposal} disabled={isPending || !isCorrectChain}>
            {isPending ? "Creating..." : "Create Proposal"}
          </button>
          {isSuccess && <p>Success! TX: {data}</p>}
          {error && <p>Error: {error.message}</p>}
        </>
      )}
    </div>
  )
}
```

---

## What We Reuse

| Existing       | Location                              | Notes                                 |
| -------------- | ------------------------------------- | ------------------------------------- |
| WalletProvider | `src/app/providers/wallet.client.tsx` | wagmi + RainbowKit already configured |
| Chain config   | `src/shared/web3/chain.ts`            | Sepolia already set up                |
| SIWE auth      | `src/proxy.ts`                        | Session auth for `/api/v1/*`          |

---

## Implementation Steps

1. Copy `deeplink.ts` + `mergeSpec` to `src/features/governance/lib/`
2. Copy ABIs to `src/shared/web3/abis/governance.ts`
3. Create `src/app/(app)/governance/page.tsx` (client component)
4. Test with Sepolia deep link

---

## Key Pattern (from proposal-launcher)

The deep link pattern is simple:

1. **URL params** → validated via `validate(query, spec)`
2. **Page reads `useSearchParams()`** → extracts validated params
3. **wagmi hooks** → `useWriteContract` to send tx
4. **viem** → `encodeFunctionData` to build calldata

No middleware validation needed for MVP (page handles null params gracefully).

---

**Last Updated:** 2025-12-08
