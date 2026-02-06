# Handoff: Wallet Connect Button Stability

## Problem Statement

**Current behavior:** WalletConnectButton causes layout instability on page refresh:

1. **Duplicate flash**: Two wallet buttons briefly appear during hydration (placeholder + real)
2. **Text flash on mobile**: "Connect Wallet" label shows full text even in compact variant, then shifts
3. **Layout shift**: Header reflows 2-3 times as wallet state hydrates (SSR → loading → connected/disconnected)

**Expected behavior:** Stable wallet slot with no layout shift across SSR → hydration → state changes.

## Guiding Principle

> **Invariant:** The header must not change layout when wallet state hydrates.

Render a single component with fixed dimensions that reserves space up-front. Only swap inner content after mount.

---

## Implementation Plan

### 1. Stable Shell (`WalletConnectButton.tsx`)

**Change:**

- Wrap all RainbowKit rendering in a stable outer shell with fixed dimensions
- **Compact variant**: Force constant size `h-11 w-[8.5rem] shrink-0`
- **Default variant**: Use consistent dimensions (e.g., `h-10 w-36`)
- Ensure inner label container uses `min-w-0 truncate` so text cannot expand the button

**Acceptance:**

- At 360/390px, header does not shift when loading/hydrating wallet state
- No momentary duplicate wallet buttons appear

### 2. Mount Gate (`WalletConnectButton.tsx`)

**Change:**

- Add `useIsMounted()` hook that returns `false` until first client effect runs
- **Before mounted**: Render SAME outer shell with placeholder/skeleton content that reserves width
- **After mounted**: Render RainbowKit `ConnectButton` content inside the shell

**Placeholder spec:**

- Use visually neutral placeholder (shimmer bar or muted text)
- Keep exact same height/width as real button
- If rendering text placeholder, use `opacity-0` (not `hidden`) to reserve width without flashing

**Acceptance:**

- On refresh, wallet slot is always present immediately (no missing button gap)
- No visible flash from "Connect Wallet" → "Connect" → address
- Only content changes inside a stable box

### 3. Compact Label Contract (`WalletConnectButton.tsx`)

**Change:**

- **Disconnected + compact**: Label must be "Connect" (NEVER "Connect Wallet")
- **Connected + compact**: Show short address ONLY (e.g., `0x12…89ab`) and/or small icon
  - No balance
  - No ENS
  - No variable-length text
- Keep `aria-label` constant and descriptive:
  - Disconnected: `"Connect wallet"`
  - Connected: `"Wallet menu"` or `"Wallet connected"`

**Acceptance:**

- Button width remains constant across disconnected/connected
- Text always truncates within `w-[8.5rem]` without wrapping

### 4. Single Render Path - No Duplication

**Change:**

- Remove any logic that conditionally renders a separate placeholder component alongside the RainbowKit button
- There must be exactly ONE `WalletConnectButton` instance in the header
- It must NOT unmount/remount during hydration

**Acceptance:**

- No DOM duplication on refresh (verify via React DevTools)

### 5. RainbowKit Custom Usage (`WalletConnectButton.tsx`)

**Change:**

- Use `ConnectButton.Custom` for full control over rendered markup
- Keep button structure identical in all states (only inner text/icon changes)
- Avoid rendering different subtrees for connected vs disconnected that change measured width

**Example structure:**

```tsx
<ConnectButton.Custom>
  {({ account, chain, openAccountModal, openConnectModal, mounted }) => {
    const ready = mounted;
    const connected = ready && account && chain;

    return (
      <div className="h-11 w-[8.5rem] shrink-0">
        {" "}
        {/* Stable shell */}
        <button
          onClick={connected ? openAccountModal : openConnectModal}
          className="h-full w-full ..."
        >
          {!ready && <span className="opacity-0">Connect</span>}
          {ready && !connected && "Connect"}
          {ready && connected && (
            <span className="truncate">{shortAddress(account.address)}</span>
          )}
        </button>
      </div>
    );
  }}
</ConnectButton.Custom>
```

**Acceptance:**

- Connected state hydration does not cause multiple layout shifts

### 6. Header Integration (`Header.tsx`)

**Change:**

- Ensure wallet slot in action cluster is `shrink-0` (already implemented)
- On mobile: Render ONLY compact variant in header
- On sm+: Render ONLY full variant
- **Critical**: Each breakpoint renders exactly ONE instance (no hidden duplicates)

**Current issue to fix:**

```tsx
{/* WRONG - renders TWO instances */}
<WalletConnectButton variant="compact" className="sm:hidden" />
<WalletConnectButton className="hidden sm:flex" />

{/* BETTER - single instance with responsive props if possible */}
{/* OR ensure only one mounts at a time */}
```

**Acceptance:**

- Header cluster does not reflow when wallet mounts
- No overflow at 360/390

---

## QA Steps

### Scenario 1: Refresh Disconnected (Mobile)

1. Viewport: 360x640
2. Load `/` (hard refresh)
3. **Observe:** Wallet slot present immediately, no text flash, no layout shift

### Scenario 2: Refresh Connected (Mobile)

1. Connect wallet once
2. Viewport: 360x640
3. Hard refresh
4. **Observe:** Wallet slot stable; text/icon updates inside without shifting header 2-3 times

### Scenario 3: No Duplication Regression

1. Refresh repeatedly 5x on mobile
2. **Confirm:** No frame shows two wallet buttons or placeholder+real at once

---

## Files to Modify

| File                                              | Current State                                      | Change Required                              |
| ------------------------------------------------- | -------------------------------------------------- | -------------------------------------------- |
| `src/components/kit/auth/WalletConnectButton.tsx` | Uses `ConnectButton` with props                    | Use `ConnectButton.Custom` with stable shell |
| `src/components/kit/layout/Header.tsx`            | Renders two instances (sm:hidden / hidden sm:flex) | Consider single responsive instance          |

---

## Definition of Done

- [ ] Wallet button area is stable on first paint and during hydration
- [ ] No duplicate wallet UI appears on refresh
- [ ] Mobile label is "Connect" when disconnected (not "Connect Wallet")
- [ ] No horizontal overflow at 360/390
- [ ] `pnpm check` passes
- [ ] Manual verification: 5 hard refreshes on mobile show no layout shift

---

## Context Links

- **RainbowKit ConnectButton docs**: https://rainbowkit.com/docs/connect-button
- **RainbowKit Custom ConnectButton**: https://rainbowkit.com/docs/custom-connect-button
- **Current implementation**: `src/components/kit/auth/WalletConnectButton.tsx:39-45`
- **Header usage**: `src/components/kit/layout/Header.tsx:79-80`

---

## Optional Follow-up Enforcement

**Playwright CLS Guard** (deferred):

- Add scrollWidth assertion (already planned)
- Add bounding-box stability check across short time window
- Keep tolerant to font loading edge cases
