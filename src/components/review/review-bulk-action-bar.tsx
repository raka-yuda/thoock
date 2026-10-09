"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import {
  Check,
  CircleX,
  LoaderCircle,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../ui/alert-dialog";
import { Button } from "../ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";

const BULK_ACTION_EXIT_DURATION_MS = 180;

export function ReviewBulkActionBar({
  selectionCount,
  working,
  aiMetadataProviderLabel,
  onApprove,
  onGenerateMetadata,
  onReject,
  onClear,
}: {
  selectionCount: number;
  working: boolean;
  aiMetadataProviderLabel: string | null;
  onApprove: () => void;
  onGenerateMetadata: () => void;
  onReject: () => void;
  onClear: () => void;
}) {
  const [retainedSelectionCount, setRetainedSelectionCount] =
    useState(selectionCount);

  useEffect(() => {
    const retainTimer = window.setTimeout(
      () => setRetainedSelectionCount(selectionCount),
      selectionCount > 0 ? 0 : BULK_ACTION_EXIT_DURATION_MS,
    );

    return () => window.clearTimeout(retainTimer);
  }, [selectionCount]);

  const displayedSelectionCount =
    selectionCount > 0 ? selectionCount : retainedSelectionCount;

  if (displayedSelectionCount === 0 || typeof document === "undefined") {
    return null;
  }

  const plural = displayedSelectionCount === 1 ? "" : "s";

  return (
    <>
      <div className="h-20" aria-hidden="true" />
      {createPortal(
        <div className="pointer-events-none fixed inset-x-3 bottom-3 z-50 flex justify-center sm:bottom-5">
          <TooltipProvider delayDuration={180}>
            <section
              aria-label="Bulk review actions"
              aria-live="polite"
              data-state={selectionCount > 0 ? "open" : "closed"}
              className="review-bulk-action-bar surface-raised pointer-events-auto flex w-full max-w-4xl flex-col gap-3 rounded-[var(--radius-panel)] border border-primary/25 bg-background p-3 shadow-[0_18px_45px_-20px_rgb(8_40_28/0.5),inset_0_1px_0_rgb(255_255_255/0.8)] sm:flex-row sm:items-center sm:justify-between dark:shadow-[0_18px_45px_-18px_rgb(0_0_0/0.75),inset_0_1px_0_rgb(255_255_255/0.08)]"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-control-compact)] border border-primary/30 bg-primary/10 text-primary shadow-[inset_0_1px_0_rgb(255_255_255/0.75),0_2px_5px_rgb(10_80_55/0.12)]">
                  {working ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <Check className="size-4" />
                  )}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {displayedSelectionCount} image{plural} selected
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    Apply one action to the current selection.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 overflow-x-auto pb-0.5 sm:pb-0">
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" disabled={working}>
                      <ShieldCheck />
                      Approve selected
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        Approve {displayedSelectionCount} selected image{plural}
                        ?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        Confirm that every selected image passes all required
                        human quality and compliance checks. Existing metadata
                        is preserved; missing metadata is prepared from its
                        commercial brief.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={onApprove}>
                        Confirm bulk approval
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

                {aiMetadataProviderLabel ? (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="accent" size="sm" disabled={working}>
                        <Sparkles />
                        Generate AI metadata
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          Generate metadata for {displayedSelectionCount} image
                          {plural} with {aiMetadataProviderLabel}?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          This sends one provider request per selected image and
                          may incur API charges. Existing metadata drafts will
                          be replaced. The results remain editable and must be
                          reviewed before export.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={onGenerateMetadata}>
                          Confirm AI metadata
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span tabIndex={0}>
                        <Button variant="accent" size="sm" disabled>
                          <Sparkles />
                          Generate AI metadata
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      Configure OpenAI or Gemini and turn off mock mode to use
                      bulk AI metadata.
                    </TooltipContent>
                  </Tooltip>
                )}

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="danger" size="sm" disabled={working}>
                      <CircleX />
                      Reject selected
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        Reject {displayedSelectionCount} selected image{plural}?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        This records a rejected human-review decision for every
                        selected image. Original generated files are preserved.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction asChild>
                        <Button variant="destructive" onClick={onReject}>
                          Confirm bulk rejection
                        </Button>
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Clear selected images"
                      disabled={working}
                      onClick={onClear}
                    >
                      <X />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Clear selection</TooltipContent>
                </Tooltip>
              </div>
            </section>
          </TooltipProvider>
        </div>,
        document.body,
      )}
    </>
  );
}
