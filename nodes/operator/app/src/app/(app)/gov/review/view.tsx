// SPDX-License-Identifier: LicenseRef-PolyForm-Shield-1.0.0
// SPDX-FileCopyrightText: 2025 Cogni-DAO

/**
 * Module: `@app/(app)/gov/review/view`
 * Purpose: Client component for epoch review admin page — review contributions, adjust weights via review-subject overrides, sign & finalize.
 * Scope: Composition of EpochDetail + useSignEpoch + useReviewEpochs + useReviewSubjectOverrides. Does not perform server-side logic or direct DB access.
 * Invariants: WRITE_ROUTES_APPROVER_GATED (UI gate via isApprover prop, server enforces). BigInt units displayed via Number() for presentation only.
 * Side-effects: IO (via hooks — review-subject-overrides CRUD, sign-data, finalize)
 * Links: src/features/governance/types.ts, work/items/task.0119.epoch-signer-ui.md
 * @public
 */

"use client";

import {
  CheckCircle2,
  ExternalLink,
  FileSignature,
  Loader2,
  Lock,
  Pencil,
  Pin,
  RotateCcw,
  Save,
  X,
} from "lucide-react";
import type { ReactElement } from "react";
import { useCallback, useMemo, useState } from "react";
import { Badge, Button, Input, TableCell, TableRow } from "@/components";
import {
  receiptTitle,
  TYPE_ICONS,
  TYPE_LABELS,
} from "@/features/governance/components/ContributionRow";
import { EpochDetail } from "@/features/governance/components/EpochDetail";
import { SourceBadge } from "@/features/governance/components/SourceBadge";
import { useReviewEpochs } from "@/features/governance/hooks/useReviewEpochs";
import {
  type ReviewSubjectOverrideView,
  useReviewSubjectOverrides,
} from "@/features/governance/hooks/useReviewSubjectOverrides";
import { useSignEpoch } from "@/features/governance/hooks/useSignEpoch";
import { applyOverridesToEpochView } from "@/features/governance/lib/compose-epoch";
import type {
  EpochContributor,
  EpochView,
  IngestionReceipt,
} from "@/features/governance/types";

interface ReviewViewProps {
  readonly isApprover: boolean;
}

export function ReviewView({ isApprover }: ReviewViewProps): ReactElement {
  const { data: reviewEpochs, isLoading, error } = useReviewEpochs();

  if (!isApprover) {
    return (
      <div className="bg-card flex flex-col items-center justify-center gap-4 rounded-lg border p-12 text-center">
        <Lock className="text-muted-foreground h-10 w-10" />
        <div>
          <h2 className="text-lg font-semibold">Not Authorized</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Only ledger approvers can access the epoch review page. Connect an
            approver wallet via SIWE to proceed.
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="border-destructive bg-destructive/10 rounded-lg border p-6">
        <h2 className="text-destructive text-lg font-semibold">
          Error loading review data
        </h2>
        <p className="text-muted-foreground text-sm">
          {error instanceof Error ? error.message : "Unknown error"}
        </p>
      </div>
    );
  }

  if (isLoading || !reviewEpochs) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="bg-muted h-8 w-64 rounded-md" />
        <div className="bg-muted h-64 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="mb-1 text-3xl font-bold tracking-tight">Epoch Review</h1>
        <p className="text-muted-foreground text-sm">
          Review contributions, adjust weights, and sign to finalize.
        </p>
      </div>

      {reviewEpochs.length === 0 ? (
        <div className="bg-card rounded-lg border p-12 text-center">
          <p className="text-muted-foreground">
            No epochs currently in review.
          </p>
          <p className="text-muted-foreground mt-2 text-sm">
            Epochs will appear here when they transition from open to review.
          </p>
        </div>
      ) : (
        reviewEpochs.map((epoch) => (
          <ReviewEpochSection key={epoch.id} epoch={epoch} />
        ))
      )}
    </div>
  );
}

// ── Per-epoch review section ─────────────────────────────────────────────────

function ReviewEpochSection({
  epoch,
}: {
  readonly epoch: EpochView;
}): ReactElement {
  const { state, sign, reset } = useSignEpoch(epoch.id);
  const overrides = useReviewSubjectOverrides(epoch.id);

  // Recompute contributor sums with overrides applied
  const adjustedEpoch = useMemo(
    () => applyOverridesToEpochView(epoch, overrides.overridesByRef),
    [epoch, overrides.overridesByRef]
  );

  const handleSign = useCallback(() => {
    void sign();
  }, [sign]);

  const renderExpandedRows = useCallback(
    (contributor: EpochContributor): ReactElement[] | null => {
      if (contributor.receipts.length === 0) return null;
      return contributor.receipts.map((receipt) => (
        <ReviewReceiptRow
          key={receipt.receiptId}
          receipt={receipt}
          override={overrides.overridesByRef.get(receipt.receiptId) ?? null}
          onSave={overrides.saveOverride}
          onRemove={overrides.removeOverride}
          isSaving={overrides.isSaving}
        />
      ));
    },
    [overrides]
  );

  const activeOverrideCount = overrides.overridesByRef.size;

  return (
    <div className="space-y-4">
      {activeOverrideCount > 0 && (
        <div className="border-warning/30 bg-warning/5 flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
          <Pencil className="text-warning h-3.5 w-3.5" />
          <span className="text-warning">
            {activeOverrideCount} active weight{" "}
            {activeOverrideCount === 1 ? "override" : "overrides"}
          </span>
          <span className="text-muted-foreground">
            — expand contributions to view or edit
          </span>
        </div>
      )}

      <EpochDetail
        epoch={adjustedEpoch}
        renderExpandedRows={renderExpandedRows}
      />

      {/* Sign & Finalize action */}
      <div className="bg-card flex flex-wrap items-center gap-3 rounded-lg border p-4">
        {state.phase === "IDLE" && (
          <Button onClick={handleSign}>
            <FileSignature className="mr-2 h-4 w-4" />
            Sign & Finalize
          </Button>
        )}

        {state.isInFlight && (
          <Button disabled>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {state.phase === "FETCHING_DATA" && "Preparing..."}
            {state.phase === "AWAITING_SIGNATURE" && "Awaiting wallet..."}
            {state.phase === "SUBMITTING" && "Submitting..."}
          </Button>
        )}

        {state.phase === "SUCCESS" && (
          <div className="text-success flex items-center gap-2 text-sm">
            <CheckCircle2 className="h-4 w-4" />
            <span>Epoch finalized (statement: {state.statementId})</span>
          </div>
        )}

        {state.phase === "ERROR" && (
          <div className="flex items-center gap-3">
            <div className="text-destructive text-sm">{state.errorMessage}</div>
            <Button variant="outline" size="sm" onClick={reset}>
              Try Again
            </Button>
          </div>
        )}

        <p className="text-muted-foreground w-full text-xs">
          Verify the deployment environment shown in your wallet. This signature
          cannot be reused in another environment.
        </p>
      </div>
    </div>
  );
}

// ── Receipt row with inline override editing ────────────────────────────────

function ReviewReceiptRow({
  receipt,
  override,
  onSave,
  onRemove,
  isSaving,
}: {
  readonly receipt: IngestionReceipt;
  readonly override: ReviewSubjectOverrideView | null;
  readonly onSave: (
    subjectRef: string,
    overrideUnits: string,
    reason?: string
  ) => Promise<void>;
  readonly onRemove: (subjectRef: string) => Promise<void>;
  readonly isSaving: boolean;
}): ReactElement {
  const [isEditing, setIsEditing] = useState(false);
  const [editUnits, setEditUnits] = useState(override?.overrideUnits ?? "");
  const [editReason, setEditReason] = useState(override?.overrideReason ?? "");

  const handleStartEdit = useCallback(() => {
    setEditUnits(override?.overrideUnits ?? "");
    setEditReason(override?.overrideReason ?? "");
    setIsEditing(true);
  }, [override]);

  const handleCancel = useCallback(() => {
    setIsEditing(false);
  }, []);

  const handleSave = useCallback(async () => {
    if (!editUnits.trim() || !/^\d+$/.test(editUnits.trim())) return;
    try {
      await onSave(
        receipt.receiptId,
        editUnits.trim(),
        editReason.trim() || undefined
      );
      setIsEditing(false);
    } catch {
      // Mutation error is surfaced via useReviewSubjectOverrides hook state
    }
  }, [receipt.receiptId, editUnits, editReason, onSave]);

  const handleRemove = useCallback(async () => {
    try {
      await onRemove(receipt.receiptId);
    } catch {
      // Mutation error is surfaced via useReviewSubjectOverrides hook state
    }
  }, [receipt.receiptId, onRemove]);

  const hasOverride = override !== null;
  const Icon = TYPE_ICONS[receipt.eventType] ?? Pin;
  const title = receiptTitle(receipt);
  const score = receipt.units;

  // Editing mode: use a colSpan row for the inline form
  if (isEditing) {
    return (
      <TableRow className="bg-primary/5 hover:bg-primary/5">
        <TableCell colSpan={6} className="p-2">
          <div className="space-y-2">
            <div className="flex min-w-0 items-center gap-2 text-sm">
              <Icon className="text-muted-foreground h-3.5 w-3.5" />
              <SourceBadge source={receipt.source as "github" | "discord"} />
              <span className="text-muted-foreground text-xs">
                {TYPE_LABELS[receipt.eventType] ?? receipt.eventType}
              </span>
              {title && (
                <>
                  <span className="text-muted-foreground/40">·</span>
                  <span className="text-foreground/80 truncate text-xs">
                    {title}
                  </span>
                </>
              )}
            </div>
            <div className="flex items-end gap-2 pl-1">
              <div className="flex-1">
                <label
                  htmlFor={`override-units-${receipt.receiptId}`}
                  className="text-muted-foreground mb-1 block text-xs"
                >
                  Override weight (units)
                </label>
                <Input
                  id={`override-units-${receipt.receiptId}`}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={editUnits}
                  onChange={(e) => setEditUnits(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  placeholder="e.g. 500"
                  className="h-7 text-xs"
                />
              </div>
              <div className="flex-2">
                <label
                  htmlFor={`override-reason-${receipt.receiptId}`}
                  className="text-muted-foreground mb-1 block text-xs"
                >
                  Reason (optional)
                </label>
                <Input
                  id={`override-reason-${receipt.receiptId}`}
                  type="text"
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  placeholder="e.g. trivial fix"
                  className="h-7 text-xs"
                />
              </div>
              <Button
                size="sm"
                className="h-7 px-2"
                onClick={(e) => {
                  e.stopPropagation();
                  void handleSave();
                }}
                disabled={
                  isSaving ||
                  !editUnits.trim() ||
                  !/^\d+$/.test(editUnits.trim())
                }
              >
                <Save className="mr-1 h-3 w-3" />
                Save
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2"
                onClick={(e) => {
                  e.stopPropagation();
                  handleCancel();
                }}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </TableCell>
      </TableRow>
    );
  }

  return (
    <TableRow
      className={
        hasOverride
          ? "border-warning/20 bg-warning/5 hover:bg-warning/10"
          : "hover:bg-muted/20"
      }
    >
      {/* Chevron column — empty */}
      <TableCell className="w-8 px-2" />
      {/* # column — type icon */}
      <TableCell className="w-10 text-center">
        <Icon className="text-muted-foreground mx-auto h-3.5 w-3.5" />
      </TableCell>
      {/* Contributor column — source + type + title + override badge */}
      <TableCell>
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <SourceBadge source={receipt.source as "github" | "discord"} />
          <span className="text-muted-foreground shrink-0 text-xs">
            {TYPE_LABELS[receipt.eventType] ?? receipt.eventType}
          </span>
          {title && (
            <>
              <span className="text-muted-foreground/40">·</span>
              {receipt.artifactUrl ? (
                <a
                  href={receipt.artifactUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group text-foreground/80 hover:text-foreground flex min-w-0 items-center gap-1 text-xs"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="truncate">{title}</span>
                  <ExternalLink className="text-muted-foreground h-3 w-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" />
                </a>
              ) : (
                <span className="text-foreground/80 truncate text-xs">
                  {title}
                </span>
              )}
            </>
          )}
          {hasOverride && override.overrideReason && (
            <Badge intent="secondary" size="sm" className="h-5 shrink-0 px-1.5">
              {override.overrideReason}
            </Badge>
          )}
        </div>
      </TableCell>
      {/* Share column — empty */}
      <TableCell className="text-right" />
      {/* Score column — includes edit/reset buttons */}
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-2">
          {score != null && hasOverride ? (
            <span className="font-mono text-xs">
              <span className="text-muted-foreground/50 line-through">
                {score}
              </span>
              <span className="text-muted-foreground/40">{" → "}</span>
              <span className="text-warning">{override.overrideUnits}</span>
            </span>
          ) : score != null ? (
            <span className="text-muted-foreground font-mono text-xs">
              {score}
            </span>
          ) : null}
          <div className="flex shrink-0 items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-1.5"
              onClick={(e) => {
                e.stopPropagation();
                handleStartEdit();
              }}
              title="Adjust weight"
            >
              <Pencil className="h-3 w-3" />
            </Button>
            {hasOverride && (
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground hover:text-destructive h-6 px-1.5"
                onClick={(e) => {
                  e.stopPropagation();
                  void handleRemove();
                }}
                disabled={isSaving}
                title="Reset to original"
              >
                <RotateCcw className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
      </TableCell>
    </TableRow>
  );
}
