// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2026 Cogni-DAO

/**
 * Module: `@tests/unit/components/ConfirmActions.spec`
 * Purpose: Pin the wire contract of the identity broker's one human gate. The confirm
 *   screen was rewritten AFTER the human validation of task.5024, so the axis a human
 *   proved on candidate-a — click "Link @flock-leader" and get exactly one attestation
 *   for exactly that account — is re-proven here instead of re-run by hand on every
 *   subsequent edit.
 * Scope: The client component only. It decides nothing; `api/auth/attest/confirm` owns
 *   every outcome and reads ONLY the posted `action` value.
 * Invariants:
 *   - ACTION_VALUES_ARE_THE_CONTRACT: the server route branches on `confirm` / `switch`
 *     and treats everything else as cancelled. A `Button` that dropped `name`/`value`
 *     would silently turn every confirmation into a cancel, with no type error — so the
 *     submitted attributes are asserted on the DOM, not inferred from the component.
 *   - NO_AUTO_SUBMIT: nothing is posted without a human click (task.5024 — an
 *     auto-submit defeats the entire purpose of the gate).
 *   - ONE_SUBMIT: one click disables all three, so a double-click cannot race two
 *     terminal actions against one consume-once broker cookie.
 * Side-effects: none
 * Links: src/app/(app)/identity/attest/confirm/actions.tsx, task.5024
 * @vitest-environment jsdom
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { ConfirmActions } from "@/app/(app)/identity/attest/confirm/actions";

const LOGIN = "@flock-leader";
const CONFIRM = `Link ${LOGIN}`;

function button(name: string): HTMLButtonElement {
  return screen.getByRole("button", { name }) as HTMLButtonElement;
}

/**
 * Renders the gate and counts real form submissions. jsdom cannot navigate, so the
 * POST is suppressed; the count is what proves a click did — or did not — fire one.
 */
function renderGate(): { form: HTMLFormElement; submits: () => number } {
  let submits = 0;
  render(<ConfirmActions login={LOGIN} />);
  const form = button(CONFIRM).closest("form") as HTMLFormElement;
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    submits += 1;
  });
  return { form, submits: () => submits };
}

describe("ConfirmActions", () => {
  it("posts to the confirm route, whose only authority is the broker cookie", () => {
    const { form } = renderGate();

    expect(form.getAttribute("action")).toBe("/api/auth/attest/confirm");
    expect(form.getAttribute("method")?.toLowerCase()).toBe("post");
  });

  it.each([
    [CONFIRM, "confirm"],
    ["Switch account", "switch"],
    ["Cancel", "cancel"],
  ])("submits %s as action=%s — ACTION_VALUES_ARE_THE_CONTRACT", (label, value) => {
    renderGate();
    const target = button(label);

    // The browser serialises the clicked submitter's name/value pair; these two
    // attributes ARE the request body the server route branches on.
    expect(target.type).toBe("submit");
    expect(target.name).toBe("action");
    expect(target.value).toBe(value);
  });

  it("names the authenticated account on the affirmative action", () => {
    renderGate();

    // The verb and the identity are the only two tokens a human reads under a
    // security prompt, so the affirmative button must carry both.
    expect(button(CONFIRM)).toBeInTheDocument();
  });

  it("submits nothing until a human clicks — NO_AUTO_SUBMIT", () => {
    const gate = renderGate();

    expect(gate.submits()).toBe(0);
  });

  it("disables every action after one click — ONE_SUBMIT", async () => {
    const gate = renderGate();

    await userEvent.click(button(CONFIRM));

    expect(gate.submits()).toBe(1);
    for (const el of screen.getAllByRole("button")) {
      expect(el).toBeDisabled();
    }

    // A double-click, or a change of mind mid-flight, must not race a second
    // terminal action against the consume-once broker cookie.
    await userEvent.click(button("Switch account"));
    await userEvent.click(button("Cancel"));

    expect(gate.submits()).toBe(1);
  });
});
