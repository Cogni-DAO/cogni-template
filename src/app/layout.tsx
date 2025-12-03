// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/layout`
 * Purpose: Root layout component for Next.js App Router with font configuration and global styles.
 * Scope: Provides HTML structure and font loading for entire application. Does not handle routing or content.
 * Invariants: Renders valid HTML5 structure; applies consistent font variables; includes global CSS.
 * Side-effects: none
 * Notes: Geist fonts loaded with CSS variables for theme consistency.
 * Links: Next.js App Router layout specification
 * @public
 */

import "@/styles/tailwind.css";
import "@rainbow-me/rainbowkit/styles.css";

import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import Script from "next/script";
import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";

import { Header } from "@/components";

import { AppProviders } from "./providers/app-providers.client";

const manrope = Manrope({
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Cogni Template",
  description: "Open-source foundation for autonomous AI-powered organizations",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>): ReactNode {
  return (
    <html lang="en" className={manrope.className} suppressHydrationWarning>
      <head>
        <Script src="/theme-init.js" strategy="beforeInteractive" />
      </head>
      <body className="min-h-dvh bg-background text-foreground antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <AppProviders>
            <Header />
            <main id="main">{children}</main>
          </AppProviders>
        </ThemeProvider>
      </body>
    </html>
  );
}
