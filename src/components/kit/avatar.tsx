// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0

/**
 * Purpose: Avatar component wrapper with CVA styling API and design token enforcement.
 * Scope: Provides typed Avatar variants wrapping shadcn/ui primitives. Does not modify underlying UI components.
 * Invariants: Forwards all props to ui components; maintains ref forwarding; provides size variants via CVA.
 * Side-effects: none
 * Notes: Wraps src/components/ui/avatar to keep shadcn components pure and updatable.
 * Links: src/styles/ui.ts, docs/STYLEGUIDE_UI.md
 * @public
 */

"use client";

import type { VariantProps } from "class-variance-authority";
import * as React from "react";

import {
  Avatar as AvatarRoot,
  AvatarFallback as AvatarFb,
  AvatarImage as AvatarImg,
} from "@/components/ui/avatar";
import { avatar, avatarFallback, avatarImage } from "@/styles/ui";

export interface AvatarProps
  extends React.ComponentPropsWithoutRef<typeof AvatarRoot>,
    VariantProps<typeof avatar> {}

export const Avatar = React.forwardRef<
  React.ElementRef<typeof AvatarRoot>,
  AvatarProps
>(({ size, ...props }, ref) => (
  <AvatarRoot ref={ref} className={avatar({ size })} {...props} />
));
Avatar.displayName = "Avatar";

export const AvatarImage = React.forwardRef<
  React.ElementRef<typeof AvatarImg>,
  React.ComponentPropsWithoutRef<typeof AvatarImg>
>((props, ref) => <AvatarImg ref={ref} className={avatarImage()} {...props} />);
AvatarImage.displayName = "AvatarImage";

export const AvatarFallback = React.forwardRef<
  React.ElementRef<typeof AvatarFb>,
  React.ComponentPropsWithoutRef<typeof AvatarFb>
>((props, ref) => (
  <AvatarFb ref={ref} className={avatarFallback()} {...props} />
));
AvatarFallback.displayName = "AvatarFallback";
