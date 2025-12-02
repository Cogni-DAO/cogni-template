// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@features/home/components/NewHomeHero`
 * Purpose: Hero section for the homepage with sparkles effect.
 * Scope: Homepage only. Does not handle global layout.
 * Invariants: None.
 * Side-effects: none
 * Links: src/components/vendor/shadcn-io/sparkles.tsx
 */

import { ArrowRight, Github } from "lucide-react";
import Link from "next/link";
import type { ReactElement } from "react";

import { Button } from "@/components";
// eslint-disable-next-line no-restricted-imports
import { SparklesCore } from "@/components/vendor/shadcn-io/sparkles";

export function NewHomeHero(): ReactElement {
  return (
    <>
      {/* eslint-disable-next-line ui-governance/no-arbitrary-non-token-values */}
      <section className="relative flex h-[25rem] w-full flex-col items-center justify-center overflow-hidden bg-background md:h-[40rem]">
        {/* Hero Title with Sparkles */}
        {/* eslint-disable-next-line ui-governance/token-classname-patterns */}
        <h1 className="relative z-20 whitespace-nowrap text-center font-bold text-2xl text-foreground md:text-5xl lg:text-6xl">
          Build{" "}
          <span className="relative inline-block text-gradient-accent">
            community-owned
            {/* Sparkles Effect Container */}
            <div className="absolute top-full left-0 h-28 w-full md:h-40">
              {/* Gradients */}
              {/* eslint-disable-next-line ui-governance/no-raw-colors, ui-governance/no-arbitrary-non-token-values */}
              <div className="absolute top-0 left-0 h-[2px] w-full bg-indigo-500 blur-sm [mask-image:linear-gradient(to_right,transparent,white_10%,white_90%,transparent)]" />
              {/* eslint-disable-next-line ui-governance/no-raw-colors */}
              <div className="absolute top-0 left-0 h-px w-full bg-indigo-500 [mask-image:linear-gradient(to_right,transparent,white_10%,white_90%,transparent)]" />
              {/* eslint-disable-next-line ui-governance/no-raw-colors, ui-governance/no-arbitrary-non-token-values */}
              <div className="absolute top-0 left-0 h-[5px] w-full bg-sky-500 blur-sm [mask-image:linear-gradient(to_right,transparent,white_10%,white_90%,transparent)]" />
              {/* eslint-disable-next-line ui-governance/no-raw-colors */}
              <div className="absolute top-0 left-0 h-px w-full bg-sky-500 [mask-image:linear-gradient(to_right,transparent,white_10%,white_90%,transparent)]" />

              {/* Core component - Mobile */}
              <SparklesCore
                id="tsparticles-mobile"
                background="transparent"
                minSize={0.1}
                maxSize={0.9}
                particleDensity={4000}
                className="h-full w-full md:hidden"
                particleColor={[
                  "#A855F7",
                  "#22C55E",
                  "#EAB308",
                  "#EF4444",
                  "#00C9FF",
                ]}
              />

              {/* Core component - Desktop */}
              <SparklesCore
                id="tsparticles-desktop"
                background="transparent"
                minSize={0.4}
                maxSize={1}
                particleDensity={1200}
                className="hidden h-full w-full md:block"
                particleColor={[
                  "#A855F7",
                  "#22C55E",
                  "#EAB308",
                  "#EF4444",
                  "#00C9FF",
                ]}
              />

              {/* Radial Gradient to prevent sharp edges */}
              <div className="absolute inset-0 h-full w-full bg-background [mask-image:radial-gradient(250px_100px_at_top,transparent_20%,white)] md:[mask-image:radial-gradient(350px_200px_at_top,transparent_20%,white)]" />
            </div>
          </span>{" "}
          AI apps.
        </h1>

        {/* Content Below Sparkles */}
        <div className="relative z-20 mx-auto mt-20 max-w-7xl px-4 sm:px-6 md:mt-44">
          {/* eslint-disable-next-line ui-governance/token-classname-patterns */}
          <div className="flex flex-col items-center justify-center text-center">
            <div className="mt-6 flex flex-col gap-4 sm:flex-row">
              <Button size="lg" asChild>
                <Link href="/chat">
                  Try the demo
                  <ArrowRight className="ml-2 size-4" />
                </Link>
              </Button>
              <Button variant="outline" size="lg" asChild>
                <Link href="https://github.com/cogni-dao/cogni-template">
                  <Github className="mr-2 size-4" />
                  Start your own
                </Link>
              </Button>
            </div>

            <p className="mt-8 max-w-3xl text-lg text-muted-foreground sm:text-xl">
              Web3 Gov + Web2 AI
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
