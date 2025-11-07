// SPDX-License-Identifier: Polyform-Shield-1.0.0

/**
 * Purpose: Home page component showcasing design system features and Cogni Template capabilities.
 * Scope: Renders landing page with design tokens, components preview, and architecture info. Does not handle routing.
 * Invariants: Displays consistent branding; showcases UI components; provides external links with security attributes.
 * Side-effects: none
 * Notes: Uses shadcn/ui components for consistent styling and theme integration.
 * Links: Route /
 * @public
 */

import Image from "next/image";
import type { ReactNode } from "react";

import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui";

export default function Home(): ReactNode {
  return (
    <div className="bg-background text-foreground min-h-screen">
      <main className="container mx-auto flex min-h-screen max-w-4xl flex-col items-center justify-center gap-8 px-4 py-16">
        <div className="text-center">
          <Image
            className="mx-auto mb-8 dark:invert"
            src="/next.svg"
            alt="Next.js logo"
            width={120}
            height={24}
            priority
          />
          <h1 className="mb-4 text-4xl font-bold tracking-tight">
            Cogni Template
          </h1>
          <p className="text-muted-foreground text-xl">
            Design System with Tailwind v4 + shadcn/ui
          </p>
        </div>

        <div className="grid w-full max-w-2xl grid-cols-1 gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Design Tokens</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                CSS-first design system with light/dark themes and semantic
                color tokens.
              </p>
              <div className="mt-4 flex gap-2">
                <div className="bg-primary h-6 w-6 rounded"></div>
                <div className="bg-secondary h-6 w-6 rounded"></div>
                <div className="bg-accent h-6 w-6 rounded"></div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Components</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                shadcn/ui components with Radix primitives and proper TypeScript
                types.
              </p>
              <div className="mt-4 flex gap-2">
                <Button size="sm">Primary</Button>
                <Button variant="secondary" size="sm">
                  Secondary
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Architecture</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Hexagonal architecture with strict layer boundaries and import
                enforcement.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Validation</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Comprehensive linting with arbitrary value blocking and type
                safety.
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row">
          <Button asChild>
            <a
              href="https://vercel.com/new?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
              target="_blank"
              rel="noopener noreferrer"
            >
              Deploy Now
            </a>
          </Button>
          <Button variant="outline" asChild>
            <a
              href="https://nextjs.org/docs?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app"
              target="_blank"
              rel="noopener noreferrer"
            >
              Documentation
            </a>
          </Button>
        </div>
      </main>
    </div>
  );
}
