// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

/**
 * Module: `@app/(app)/identity/attest/error`
 * Purpose: Terminal failure surface for the identity broker, so every rejected leg lands
 *   on a page that says what happened instead of a blank redirect.
 * Scope: Renders a known code. Holds no state and never retries.
 * Invariants: NO_LEAK — only a fixed, enumerated reason is shown; never token, code, or
 *   request internals.
 * Side-effects: none
 * @public
 */

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const REASONS: Record<string, string> = {
  attestation_unavailable:
    "This environment is not configured to verify GitHub accounts for nodes.",
  broker_request_expired:
    "The verification request expired. Start again from the node's profile page.",
  cancelled: "Verification was cancelled. Nothing was shared with the node.",
  github_declined:
    "GitHub did not authorize the request. Nothing was shared with the node.",
  github_exchange_failed:
    "GitHub could not complete the sign-in. Please try again.",
  invalid_request: "The node's verification request was malformed.",
  invalid_return_to:
    "The node asked us to return to an address that is not registered for it.",
  unknown_node: "That node is not registered with this operator.",
};

export default async function IdentityAttestationErrorPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const query = await searchParams;
  const raw = query.code;
  const code = typeof raw === "string" ? raw : "";
  const reason = REASONS[code] ?? "The node verification request was rejected.";

  return (
    <main className="mx-auto max-w-xl px-6 py-16">
      <h1 className="font-semibold text-xl">
        GitHub verification could not continue
      </h1>
      <p className="mt-3 text-sm">{reason}</p>
      <p className="mt-4 text-muted-foreground text-sm">
        Return to the node and start again from your profile.
        {code ? ` (${code})` : ""}
      </p>
    </main>
  );
}
