// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@components/kit/navigation/NavigationLink`
 * Purpose: Navigation link with active route detection and current page semantics.
 * Scope: Provides Link wrapper with pathname normalization and match modes. Does not handle external URLs or routing.
 * Invariants: Normalizes paths; supports exact/prefix matching; sets active state via CVA factory.
 * Side-effects: global
 * Notes: Client component for usePathname; handles basePath and locale prefixes; never for external URLs.
 * Links: docs/UI_IMPLEMENTATION_GUIDE.md, Next.js usePathname
 * @public
 */

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactElement, ReactNode } from "react";

import type { VariantProps } from "@/styles/ui";
import { navLink } from "@/styles/ui";

type MatchMode = "exact" | "prefix";

interface NavigationLinkProps extends VariantProps<typeof navLink> {
  readonly href: string;
  readonly children: ReactNode;
  readonly match?: MatchMode;
  readonly localePrefix?: string;
  readonly basePath?: string;
}

function norm(path: string): string {
  const parts = path.split(/[?#]/);
  const u = parts[0] ?? "";
  return u !== "/" ? u.replace(/\/+$/, "") : "/";
}

function stripPrefix(path: string, prefix?: string): string {
  if (!prefix) return path;
  return path.startsWith(prefix) ? path.slice(prefix.length) || "/" : path;
}

export function NavigationLink({
  href,
  children,
  size = "sm",
  match = "exact",
  localePrefix,
  basePath,
}: NavigationLinkProps): ReactElement {
  const pathname = usePathname() || "/";
  // Normalize current and target
  const current = norm(
    stripPrefix(stripPrefix(pathname, basePath), localePrefix)
  );
  const target = norm(stripPrefix(stripPrefix(href, basePath), localePrefix));

  const isActive =
    match === "exact"
      ? current === target
      : current === target || current.startsWith(target + "/");

  return (
    <Link
      href={href}
      className={navLink({ size, state: isActive ? "active" : "default" })}
      aria-current={isActive ? "page" : undefined}
    >
      {children}
    </Link>
  );
}
