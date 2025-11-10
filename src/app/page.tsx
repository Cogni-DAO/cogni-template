// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/page`
 * Purpose: Homepage with hero section and feature showcase.
 * Scope: Renders landing page content. Does not handle routing.
 * Invariants: Responsive design.
 * Side-effects: none
 * Notes: Composes Hero and Terminal components.
 * Links: src/components/kit/sections/Hero.tsx, src/features/home/components/Terminal.tsx
 * @public
 */

import { ArrowRight, CreditCard, Database } from "lucide-react";
import type { ReactElement } from "react";

import { Button, HeroActionWords } from "@/components";
import {
  featureContent,
  featureItem,
  heroButtonContainer,
  heroTextWrapper,
  heroVisualContainer,
  smallIcon,
} from "@/components/kit/sections";
import { Terminal } from "@/features/home/components/Terminal";
import {
  codeSyntax,
  container,
  flex,
  grid,
  heading,
  icon,
  iconBox,
  paragraph,
  section,
} from "@/styles/ui";

const HERO_ACTIONS = [
  "build",
  "code",
  "own",
  "grow",
  "earn",
  "learn",
  "buy",
  "win",
];

export default function HomePage(): ReactElement {
  return (
    <main>
      <section className={section()}>
        <div className={container({ size: "lg", spacing: "xl" })}>
          <div className={grid({ cols: "12", gap: "md" })}>
            <div className={heroTextWrapper({ width: "fixed" })}>
              <h1 className={heading({ level: "h1" })}>
                <span className={codeSyntax({ token: "variable" })}>
                  together
                </span>
                <span className={codeSyntax({ token: "parenthesis" })}>(</span>
                <HeroActionWords actions={HERO_ACTIONS} token="delimiter" />
                <span className={codeSyntax({ token: "parenthesis" })}>)</span>
                <span className={codeSyntax({ token: "delimiter" })}>
                  {"{"}
                </span>
              </h1>
              <h1 className={heading({ level: "h1", tone: "subdued" })}>
                <span className={codeSyntax({ token: "operator" })}>
                  return
                </span>{" "}
                <span className={codeSyntax({ token: "property" })}>
                  community-source
                </span>
                <span className={codeSyntax({ token: "delimiter" })}>
                  {" }"}
                </span>
                <span className={codeSyntax({ token: "punctuation" })}>;</span>
              </h1>
              <div className={heroButtonContainer()}>
                <a
                  href="https://github.com/cogni-template/cogni-template"
                  target="_blank"
                >
                  <Button size="lg" variant="outline">
                    Deploy your own
                    <ArrowRight className={icon({ size: "md" })} />
                  </Button>
                </a>
              </div>
            </div>
            <div className={heroVisualContainer()}>
              <Terminal />
            </div>
          </div>
        </div>
      </section>

      <section className={section({ surface: "default" })}>
        <div className={container({ size: "lg", spacing: "lg" })}>
          <div className={grid({ cols: "3", gap: "md" })}>
            <div>
              <div className={iconBox()}>
                <svg viewBox="0 0 24 24" className={icon({ size: "lg" })}>
                  <path
                    fill="currentColor"
                    d="M14.23 12.004a2.236 2.236 0 0 1-2.235 2.236 2.236 2.236 0 0 1-2.236-2.236 2.236 2.236 0 0 1 2.235-2.236 2.236 2.236 0 0 1 2.236 2.236zm2.648-10.69c-1.346 0-3.107.96-4.888 2.622-1.78-1.653-3.542-2.602-4.887-2.602-.41 0-.783.093-1.106.278-1.375.793-1.683 3.264-.973 6.365C1.98 8.917 0 10.42 0 12.004c0 1.59 1.99 3.097 5.043 4.03-.704 3.113-.39 5.588.988 6.38.32.187.69.275 1.102.275 1.345 0 3.107-.96 4.888-2.624 1.78 1.654 3.542 2.603 4.887 2.603.41 0 .783-.09 1.106-.275 1.374-.792 1.683-3.263.973-6.365C22.02 15.096 24 13.59 24 12.004c0-1.59-1.99-3.097-5.043-4.032.704-3.11.39-5.587-.988-6.38-.318-.184-.688-.277-1.092-.278zm-.005 1.09v.006c.225 0 .406.044.558.127.666.382.955 1.835.73 3.704-.054.46-.142.945-.25 1.44-.96-.236-2.006-.417-3.107-.534-.66-.905-1.345-1.727-2.035-2.447 1.592-1.48 3.087-2.292 4.105-2.295zm-9.77.02c1.012 0 2.514.808 4.11 2.28-.686.72-1.37 1.537-2.02 2.442-1.107.117-2.154.298-3.113.538-.112-.49-.195-.964-.254-1.42-.23-1.868.054-3.32.714-3.707.19-.09.4-.127.563-.132zm4.882 3.05c.455.468.91.992 1.36 1.564-.44-.02-.89-.034-1.345-.034-.46 0-.915.01-1.36.034.44-.572.895-1.096 1.345-1.565zM12 8.1c.74 0 1.477.034 2.202.093.406.582.802 1.203 1.183 1.86.372.64.71 1.29 1.018 1.946-.308.655-.646 1.31-1.013 1.95-.38.66-.773 1.288-1.18 1.87-.728.063-1.466.098-2.21.098-.74 0-1.477-.035-2.202-.093-.406-.582-.802-1.204-1.183-1.86-.372-.64-.71-1.29-1.018-1.946.303-.657.646-1.313 1.013-1.954.38-.66.773-1.286 1.18-1.868.728-.064 1.466-.098 2.21-.098zm-3.635.254c-.24.377-.48.763-.704 1.16-.225.39-.435.782-.635 1.174-.265-.656-.49-1.31-.676-1.947.64-.15 1.315-.283 2.015-.386zm7.26 0c.695.103 1.365.23 2.006.387-.18.632-.405 1.282-.66 1.933-.2-.39-.41-.783-.64-1.174-.225-.392-.465-.774-.705-1.146zm3.063.675c.484.15.944.317 1.375.498 1.732.74 2.852 1.708 2.852 2.476-.005.768-1.125 1.74-2.857 2.475-.42.18-.88.342-1.355.493-.28-.958-.646-1.956-1.1-2.98.45-1.017.81-2.01 1.085-2.964zm-13.395.004c.278.96.645 1.957 1.1 2.98-.45 1.017-.812 2.01-1.086 2.964-.484-.15-.944-.318-1.37-.5-1.732-.737-2.852-1.706-2.852-2.474 0-.768 1.12-1.742 2.852-2.476.42-.18.88-.342 1.356-.494zm11.678 4.28c.265.657.49 1.312.676 1.948-.64.157-1.316.29-2.016.39.24-.375.48-.762.705-1.158.225-.39.435-.788.636-1.18zm-9.945.02c.2.392.41.783.64 1.175.23.39.465.772.705 1.143-.695-.102-1.365-.23-2.006-.386.18-.63.406-1.282.66-1.933zM17.92 16.32c.112.493.2.968.254 1.423.23 1.868-.054 3.32-.714 3.708-.147.09-.338.128-.563.128-1.012 0-2.514-.807-4.11-2.28.686-.72 1.37-1.536 2.02-2.44 1.107-.118 2.154-.3 3.113-.54zm-11.83.01c.96.234 2.006.415 3.107.532.66.905 1.345 1.727 2.035 2.446-1.595 1.483-3.092 2.295-4.11 2.295-.22-.005-.406-.05-.553-.132-.666-.38-.955-1.834-.73-3.703.054-.46.142-.944.25-1.438zm4.56.64c.44.02.89.034 1.345.034.46 0 .915-.01 1.36-.034-.44.572-.895 1.095-1.345 1.565-.455-.47-.91-.993-1.36-1.565z"
                  />
                </svg>
              </div>
              <div className={featureContent()}>
                <h2 className={heading({ level: "h4", tone: "default" })}>
                  Next.js and React
                </h2>
                <p className={paragraph({ spacing: "sm" })}>
                  Leverage the power of modern web technologies for optimal
                  performance and developer experience.
                </p>
              </div>
            </div>

            <div className={featureItem()}>
              <div className={iconBox()}>
                <Database className={smallIcon()} />
              </div>
              <div className={featureContent()}>
                <h2 className={heading({ level: "h4", tone: "default" })}>
                  Hexagonal Architecture
                </h2>
                <p className={paragraph({ spacing: "sm" })}>
                  Clean domain boundaries with ports and adapters for swappable
                  infrastructure and testable business logic.
                </p>
              </div>
            </div>

            <div className={featureItem()}>
              <div className={iconBox()}>
                <CreditCard className={icon({ size: "lg" })} />
              </div>
              <div className={featureContent()}>
                <h2 className={heading({ level: "h4", tone: "default" })}>
                  Crypto-Only Payments
                </h2>
                <p className={paragraph({ spacing: "sm" })}>
                  All infrastructure and AI costs paid via DAO-controlled crypto
                  wallets with full transparency.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={section({ surface: "muted" })}>
        <div className={container({ size: "lg", spacing: "lg" })}>
          <div className={grid({ cols: "2", align: "center", gap: "md" })}>
            <div>
              <h2 className={heading({ level: "h2", tone: "default" })}>
                Ready to build autonomous AI?
              </h2>
              <p className={paragraph({ size: "lg", spacing: "md" })}>
                Our template provides everything you need for crypto-funded,
                AI-powered organizations. Focus on your domain logic, not
                infrastructure.
              </p>
            </div>
            <div className={flex({ justify: "center", spacing: "lg" })}>
              <a
                href="https://github.com/cogni-template/cogni-template"
                target="_blank"
              >
                <Button size="lg" variant="outline">
                  View the code
                  <ArrowRight className={icon({ size: "lg" })} />
                </Button>
              </a>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
