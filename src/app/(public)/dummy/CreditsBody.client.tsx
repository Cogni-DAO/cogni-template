"use client";

import { ExternalLink, Info } from "lucide-react";
import { useState } from "react";

import {
  Button,
  Card,
  HintText,
  PageContainer,
  SectionCard,
  SplitInput,
} from "@/components";

export function CreditsBody() {
  const [amount, setAmount] = useState("");

  const isValidAmount =
    amount !== "" && Number(amount) >= 1 && Number(amount) <= 100000;
  const showError = !isValidAmount;

  return (
    <PageContainer maxWidth="2xl">
      {/* Balance - just shadcn Card, no special component */}
      <Card className="flex items-center justify-between p-6">
        <span className="font-bold text-4xl">$ 30.64</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-9 w-9 rounded-full border border-slate-700"
        >
          <Info size={20} />
        </Button>
      </Card>

      {/* Buy Credits Section */}
      <SectionCard title="Buy Credits">
        <SplitInput
          label="Amount"
          value={amount}
          onChange={(val) => setAmount(val.replace(/[^0-9]/g, ""))}
          placeholder="1 - 100000"
        />

        {showError ? (
          <div className="flex h-11 items-center justify-center rounded-lg border border-slate-800 bg-slate-900 px-4">
            <p className="text-slate-500 text-sm">Invalid amount</p>
          </div>
        ) : (
          <Button variant="default" size="lg" className="w-full">
            Purchase
          </Button>
        )}

        <HintText icon={<Info size={16} />}>
          Transactions may take many minutes to confirm
        </HintText>

        <a
          href="/usage"
          className="flex items-center gap-2 font-semibold text-primary text-sm hover:text-primary/80"
        >
          View Usage <ExternalLink size={16} />
        </a>
      </SectionCard>
    </PageContainer>
  );
}
