// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

import Link from "next/link";
import type { JSX } from "react";

const mockTransactions = [
  {
    id: "txn-1",
    label: "Payment confirmation pending",
    amount: "$0.00",
    age: "—",
    status: "Pending",
  },
];

export default function CreditsPage(): JSX.Element {
  return (
    <main className="space-y-8 px-6 py-8">
      <header className="space-y-2">
        <div className="flex items-center gap-3">
          <h1 className="text-foreground font-semibold">Credits</h1>
          <span className="text-muted-foreground">
            Wallet-authenticated account credits
          </span>
        </div>
        <p className="text-muted-foreground">
          Buy credits with crypto via Resmic. Auto top-up is not available in
          MVP.
        </p>
      </header>

      <section className="space-y-4">
        <div className="bg-card rounded-xl border p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-muted-foreground">Current balance</p>
              <p className="text-foreground font-semibold tracking-tight">
                $0.00
              </p>
              <p className="text-muted-foreground">
                Balance updates after each confirmed purchase
              </p>
            </div>
            <div className="text-muted-foreground">
              <p>Usage is billed in credits (1 credit = $0.001)</p>
              <Link className="underline" href="/usage">
                View usage
              </Link>
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="bg-card rounded-xl border p-4 md:col-span-2">
            <div className="flex items-center justify-between">
              <h2 className="text-foreground font-semibold">Buy credits</h2>
              <span className="text-muted-foreground">Crypto only</span>
            </div>
            <div className="mt-4 space-y-3">
              <div className="space-y-1">
                <label className="text-foreground font-medium" htmlFor="amount">
                  Amount (USD)
                </label>
                <input
                  id="amount"
                  name="amount"
                  inputMode="decimal"
                  defaultValue="10"
                  className="bg-background text-foreground w-full rounded-lg border px-3 py-2"
                  aria-describedby="amount-help"
                />
                <p id="amount-help" className="text-muted-foreground">
                  Enter the USD value to load. Resmic will collect crypto
                  equivalent on Base/Base Sepolia.
                </p>
              </div>
              <button
                type="button"
                className="bg-primary text-primary-foreground w-full rounded-lg px-4 py-2 font-medium"
              >
                Purchase with Resmic
              </button>
              <p className="text-muted-foreground">
                Transactions may take a few minutes to confirm. Your balance
                updates after the confirm API call.
              </p>
            </div>
          </div>

          <div className="bg-card rounded-xl border p-4">
            <h2 className="text-foreground font-semibold">Notes</h2>
            <ul className="text-muted-foreground mt-3 space-y-2">
              <li>Auto top-up is not supported in MVP.</li>
              <li>Crypto is the only payment method (Resmic widget).</li>
              <li>Keep this tab open until the payment is confirmed.</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="bg-card rounded-xl border p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-foreground font-semibold">Recent transactions</h2>
          <span className="text-muted-foreground">
            Latest credit ledger entries
          </span>
        </div>
        <div className="mt-4 divide-y">
          {mockTransactions.map((txn) => (
            <div
              key={txn.id}
              className="flex items-center justify-between py-3"
            >
              <div className="space-y-1">
                <p className="font-medium">{txn.label}</p>
                <p className="text-muted-foreground">{txn.status}</p>
              </div>
              <div className="text-foreground flex flex-col items-end">
                <p className="font-semibold">{txn.amount}</p>
                <p className="text-muted-foreground">{txn.age}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="text-muted-foreground mt-4 flex items-center justify-between">
          <span>Showing most recent entries</span>
          <Link className="underline" href="/usage">
            View all
          </Link>
        </div>
      </section>
    </main>
  );
}
