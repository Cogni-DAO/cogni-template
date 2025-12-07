// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@components`
 * Purpose: Public surface for components module via re-exports of shared UI components.
 * Scope: Re-exports components only. Does not export internal utilities or development helpers.
 * Invariants: Only re-exports from component files; no circular dependencies; maintains type exports.
 * Side-effects: none
 * Notes: Changes here affect components public API contract; follows barrel export pattern.
 * Links: ARCHITECTURE.md#public-surface
 * @public
 */

export {
  chatContainer,
  chatDivider,
  chatForm,
  chatMessage,
  chatMessages,
  container,
  grid,
  heroButtons,
  heroText,
  heroVisual,
  section,
} from "@/styles/ui";
export { Reveal } from "./kit/animation/Reveal";
export { WalletConnectButton } from "./kit/auth/WalletConnectButton";
export * from "./kit/chat";
export { Avatar, AvatarFallback, AvatarImage } from "./kit/data-display/Avatar";
export { Badge } from "./kit/data-display/Badge";
export { GithubButton } from "./kit/data-display/GithubButton";
export { TerminalFrame } from "./kit/data-display/TerminalFrame";
export { Alert, AlertDescription, AlertTitle } from "./kit/feedback/Alert";
export {
  ErrorAlert,
  type ErrorAlertProps,
  type ErrorAlertRef,
} from "./kit/feedback/ErrorAlert";
export { HintText } from "./kit/feedback/HintText";
export { Progress } from "./kit/feedback/Progress";
export { Button } from "./kit/inputs/Button";
export { Input } from "./kit/inputs/Input";
export { ModeToggle } from "./kit/inputs/ModeToggle";
export { SplitInput } from "./kit/inputs/SplitInput";
export {
  type TimeRange,
  TimeRangeSelector,
} from "./kit/inputs/TimeRangeSelector";
export {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./kit/layout/Card";
export { Container } from "./kit/layout/Container";
export { Header } from "./kit/layout/Header";
export { PageContainer } from "./kit/layout/PageContainer";
export { SectionCard } from "./kit/layout/SectionCard";
export { MobileNav } from "./kit/navigation/MobileNav";
export { NavigationLink } from "./kit/navigation/NavigationLink";
export { UsdcPaymentFlow } from "./kit/payments/UsdcPaymentFlow";
export { Hero } from "./kit/sections";
export {
  type CodeToken,
  CodeTokenLine,
  HeroActionContainer,
  HeroCodeBlock,
} from "./kit/typography/CodeHero";
export { HeroActionWords } from "./kit/typography/HeroActionWords";
export { Prompt } from "./kit/typography/Prompt";
