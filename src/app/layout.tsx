// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0

/**
 * Purpose: Root layout component for Next.js App Router with Geist font configuration and global styles.
 * Scope: Provides HTML structure and font loading for entire application. Does not handle routing or content.
 * Invariants: Renders valid HTML5 structure; applies consistent font variables; includes global CSS.
 * Side-effects: none
 * Notes: Geist fonts loaded with CSS variables for theme consistency.
 * Links: Next.js App Router layout specification
 * @public
 */

import "./globals.css";

import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import type { ReactNode } from "react";

import { pageShell } from "@/styles/ui";

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
    <html lang="en" className={manrope.className}>
      <body className={pageShell()}>{children}</body>
    </html>
  );
}
