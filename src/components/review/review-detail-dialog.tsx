"use client";

import Image from "next/image";
import type { Dispatch, SetStateAction } from "react";
import {
  AlertTriangle,
  Check,
  CircleX,
  Columns2,
  Download,
  FilePenLine,
  LoaderCircle,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { ADOBE_STOCK_CATEGORIES } from "@/lib/domain/adobe-categories";
import { BASE_REVIEW_CHECKS } from "@/lib/domain/review";
import type { MetadataProviderId } from "@/lib/runtime-config";
import { formatUsd } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "../ui/alert";
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
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import { Skeleton } from "../ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Textarea } from "../ui/textarea";
import {
  reviewLogoRemoval,
  reviewPreviewUrl,
  reviewThumbnailUrl,
  type ReviewAsset,
  type ReviewMetadata,
} from "./review-types";

export type ReviewDetailDialogProps = {
  activeAssetId?: string;
  checks: Record<string, boolean>;
  defaultMetadataProvider: MetadataProviderId;
  detailLoading: boolean;
  downloading: boolean;
  metadata: ReviewMetadata | null;
  notes: string;
  previewLoaded: boolean;
  requiredComplete: boolean;
  selected: ReviewAsset | null;
  siblings: ReviewAsset[];
  working: boolean;
  onCheckAll: () => void;
  onClose: () => void;
  onDownload: () => Promise<void>;
  onGenerateMetadata: (provider: MetadataProviderId) => Promise<void>;
  onOpenAsset: (asset: ReviewAsset) => void;
  onRegenerate: () => Promise<void>;
  onRetryLogoRemoval: () => Promise<void>;
  onSaveMetadata: () => Promise<void>;
  onSaveReview: (
    decision: "approved" | "rejected" | "regenerate",
  ) => Promise<void>;
  setChecks: Dispatch<SetStateAction<Record<string, boolean>>>;
  setMetadata: Dispatch<SetStateAction<ReviewMetadata | null>>;
  setNotes: Dispatch<SetStateAction<string>>;
  setPreviewLoaded: Dispatch<SetStateAction<boolean>>;
};

export function ReviewDetailDialog({
  activeAssetId,
  checks,
  defaultMetadataProvider,
  detailLoading,
  downloading,
  metadata,
  notes,
  previewLoaded,
  requiredComplete,
  selected,
  siblings,
  working,
  onCheckAll,
  onClose,
  onDownload,
  onGenerateMetadata,
  onOpenAsset,
  onRegenerate,
  onRetryLogoRemoval,
  onSaveMetadata,
  onSaveReview,
  setChecks,
  setMetadata,
  setNotes,
  setPreviewLoaded,
}: ReviewDetailDialogProps) {
  return (
    <Dialog
      open={Boolean(activeAssetId && (detailLoading || selected))}
      onOpenChange={(open) => !open && onClose()}
    >
      {selected ? (
        <DialogContent className="max-w-6xl overflow-hidden p-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-98 data-[state=closed]:duration-100 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:duration-150 motion-reduce:animate-none">
          <DialogHeader className="border-b px-6 pb-5 pt-6 pr-14">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant={Number(selected.megapixels) >= 4 ? "success" : "warning"}
              >
                {Number(selected.megapixels).toFixed(2)}MP
              </Badge>
              <Badge variant="outline">
                {selected.provider} · {selected.model}
              </Badge>
              {reviewLogoRemoval(selected).status === "completed" && (
                <Badge variant="success">Logo removed · Fast</Badge>
              )}
            </div>
            <DialogTitle className="mt-2">{selected.briefName}</DialogTitle>
            <DialogDescription>
              Actual file: {selected.width} × {selected.height}. Automated checks
              remain advisory.
            </DialogDescription>
          </DialogHeader>
          <Tabs defaultValue="review">
            <div className="border-b px-6 py-3">
              <TabsList>
                <TabsTrigger value="review">Quality review</TabsTrigger>
                <TabsTrigger value="compare">
                  <Columns2 /> Same brief ({siblings.length})
                </TabsTrigger>
                <TabsTrigger value="metadata">
                  <FilePenLine /> Metadata
                </TabsTrigger>
              </TabsList>
            </div>
            <div className="max-h-[62dvh] overflow-y-auto px-6 py-5">
              <TabsContent value="review" className="mt-0">
                <div className="grid gap-6 lg:grid-cols-[1.25fr_.75fr]">
                  <div>
                    <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-muted">
                      {!previewLoaded && (
                        <Image
                          src={reviewThumbnailUrl(selected)}
                          alt=""
                          fill
                          unoptimized
                          loading="eager"
                          className="scale-105 object-contain opacity-70 blur-md"
                        />
                      )}
                      <Image
                        src={reviewPreviewUrl(selected)}
                        alt={`Large preview of ${selected.briefName}`}
                        fill
                        unoptimized
                        loading="eager"
                        fetchPriority="high"
                        decoding="async"
                        sizes="(max-width: 1024px) 100vw, 70vw"
                        onLoad={() => setPreviewLoaded(true)}
                        className={`object-contain transition-opacity duration-200 ${previewLoaded ? "opacity-100" : "opacity-0"}`}
                      />
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <Technical
                        label="Dimensions"
                        value={`${selected.width} × ${selected.height}`}
                      />
                      <Technical
                        label="Megapixels"
                        value={`${Number(selected.megapixels).toFixed(2)}MP`}
                        warning={Number(selected.megapixels) < 4}
                      />
                      <Technical
                        label="Format"
                        value={selected.mimeType.replace("image/", "").toUpperCase()}
                      />
                      <Technical
                        label="File size"
                        value={`${(selected.fileSize / 1_000_000).toFixed(2)}MB`}
                      />
                    </div>
                    {reviewLogoRemoval(selected).status === "completed" && (
                      <Alert className="mt-4 border-emerald-500/35">
                        <Sparkles />
                        <AlertTitle>SnapGen provider mark removed</AlertTitle>
                        <AlertDescription>
                          Review and export use the cleaned derived image. Fast
                          removal is free, and the original provider output remains
                          preserved separately.
                        </AlertDescription>
                      </Alert>
                    )}
                    {reviewLogoRemoval(selected).status === "failed" && (
                      <Alert className="mt-4 border-destructive/40 text-destructive">
                        <AlertTriangle />
                        <AlertTitle>Provider-mark cleanup failed</AlertTitle>
                        <AlertDescription>
                          <p>
                            {reviewLogoRemoval(selected).error ??
                              "SnapGen did not return a cleaned image."}
                          </p>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="mt-3"
                            onClick={() => void onRetryLogoRemoval()}
                            disabled={working}
                          >
                            {working ? (
                              <LoaderCircle className="animate-spin" />
                            ) : (
                              <RotateCcw />
                            )}
                            Retry free Fast removal
                          </Button>
                        </AlertDescription>
                      </Alert>
                    )}
                    {Number(selected.megapixels) < 4 && (
                      <Alert className="mt-4 border-amber-500/35">
                        <AlertTriangle />
                        <AlertTitle>Export is blocked below 4MP</AlertTitle>
                        <AlertDescription>
                          Select this only if you plan to upscale it, or regenerate
                          the brief with a direct-compliant resolution.
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold">
                        Required human checks
                      </h3>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs tabular-nums text-muted-foreground">
                          {BASE_REVIEW_CHECKS.filter((item) => checks[item]).length}/
                          {BASE_REVIEW_CHECKS.length}
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={onCheckAll}
                          disabled={requiredComplete}
                          aria-label="Check all required human review items"
                        >
                          <Check /> {requiredComplete ? "All checked" : "Check all"}
                        </Button>
                      </div>
                    </div>
                    <div className="mt-4 space-y-3">
                      {BASE_REVIEW_CHECKS.map((check) => (
                        <label
                          key={check}
                          className="flex cursor-pointer items-start gap-3 text-xs leading-relaxed"
                        >
                          <Checkbox
                            checked={Boolean(checks[check])}
                            onCheckedChange={(value) =>
                              setChecks((current) => ({
                                ...current,
                                [check]: value === true,
                              }))
                            }
                          />
                          <span>{check}</span>
                        </label>
                      ))}
                    </div>
                    <Label className="mt-5 block">Review notes</Label>
                    <Textarea
                      className="mt-2"
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      placeholder="Artifacts, strengths, or regeneration direction"
                    />
                    <div className="mt-5 grid grid-cols-3 gap-2">
                      <Button
                        variant="destructive"
                        onClick={() => void onSaveReview("rejected")}
                        disabled={working}
                      >
                        <CircleX /> Reject
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" disabled={working}>
                            <RotateCcw /> Regenerate
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              Generate a new image from the same settings?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              This creates a linked generation attempt using the same
                              prompt, provider, model, resolution, quality, seed, and
                              candidate count. After an attempt is recorded, the
                              current image is marked “regenerate.” Estimated
                              additional cost: {selected.estimatedGenerationCostUsd
                                ? formatUsd(
                                    Number(selected.estimatedGenerationCostUsd),
                                  )
                                : "unavailable"}
                              .{" "}
                              {!['mock', 'imported'].includes(selected.provider)
                                ? "This may be a paid request and will not retry automatically."
                                : "This provider is configured as free."}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => void onRegenerate()}>
                              Confirm regeneration
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                      <Button
                        onClick={() => void onSaveReview("approved")}
                        disabled={working || !requiredComplete}
                      >
                        {working ? (
                          <LoaderCircle className="animate-spin" />
                        ) : (
                          <Check />
                        )}{" "}
                        Approve
                      </Button>
                    </div>
                  </div>
                </div>
              </TabsContent>
              <TabsContent value="compare" className="mt-0">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {siblings.map((asset) => (
                    <Button
                      key={asset.id}
                      type="button"
                      variant="outline"
                      className="block h-auto w-full overflow-hidden rounded-xl p-0 text-left transition-colors hover:border-primary/40 hover:bg-background"
                      onClick={() => onOpenAsset(asset)}
                    >
                      <div className="relative aspect-[4/3] bg-muted">
                        <Image
                          src={reviewThumbnailUrl(asset)}
                          alt={asset.briefName}
                          fill
                          unoptimized
                          loading="lazy"
                          decoding="async"
                          sizes="33vw"
                          className="object-cover"
                        />
                      </div>
                      <div className="p-3">
                        <p className="text-sm font-semibold">
                          {asset.originalFilename}
                        </p>
                        <p className="mt-1 font-mono text-xs text-muted-foreground">
                          {Number(asset.megapixels).toFixed(2)}MP ·{" "}
                          {asset.review.decision}
                        </p>
                      </div>
                    </Button>
                  ))}
                </div>
              </TabsContent>
              <TabsContent value="metadata" className="mt-0">
                {!metadata ? (
                  <div className="grid gap-4">
                    <Alert>
                      <FilePenLine />
                      <AlertTitle>
                        Metadata can come from the brief or an AI draft
                      </AlertTitle>
                      <AlertDescription>
                        The saved brief plan remains preferred. You can also create
                        an editable metadata draft with the configured provider and
                        review every field before export.
                      </AlertDescription>
                    </Alert>
                    <div className="flex flex-wrap gap-3">
                      <Button
                        variant="outline"
                        disabled={working}
                        onClick={() =>
                          void onGenerateMetadata("brief-metadata")
                        }
                      >
                        <FilePenLine /> Use brief plan
                      </Button>
                      {defaultMetadataProvider !== "brief-metadata" && (
                        <Button
                          disabled={working}
                          onClick={() =>
                            void onGenerateMetadata(defaultMetadataProvider)
                          }
                        >
                          {working ? (
                            <LoaderCircle className="animate-spin" />
                          ) : (
                            <Sparkles />
                          )}
                          Generate with{" "}
                          {defaultMetadataProvider.startsWith("openai")
                            ? "OpenAI"
                            : "Gemini"}
                        </Button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-5 md:grid-cols-2">
                    <Field label="Filename">
                      <Input
                        value={metadata.filename}
                        onChange={(event) =>
                          setMetadata({
                            ...metadata,
                            filename: event.target.value,
                          })
                        }
                      />
                    </Field>
                    <Field label={`Title · ${metadata.title.length}/70`}>
                      <Input
                        value={metadata.title}
                        onChange={(event) =>
                          setMetadata({ ...metadata, title: event.target.value })
                        }
                      />
                    </Field>
                    <Field label="Adobe Stock category">
                      <Select
                        value={metadata.category}
                        onValueChange={(category) =>
                          setMetadata({ ...metadata, category })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select a category" />
                        </SelectTrigger>
                        <SelectContent>
                          {ADOBE_STOCK_CATEGORIES.map((category) => (
                            <SelectItem key={category.code} value={category.code}>
                              {category.code}. {category.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Language">
                      <Input
                        value={metadata.language}
                        onChange={(event) =>
                          setMetadata({
                            ...metadata,
                            language: event.target.value,
                          })
                        }
                      />
                    </Field>
                    <div className="md:col-span-2">
                      <Field
                        label={`Ordered keyword concepts · ${metadata.keywords.length}/50`}
                      >
                        <Textarea
                          className="min-h-32"
                          value={metadata.keywords.join(", ")}
                          onChange={(event) =>
                            setMetadata({
                              ...metadata,
                              keywords: event.target.value
                                .split(",")
                                .map((item) => item.trim())
                                .filter(Boolean),
                            })
                          }
                        />
                      </Field>
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        Enter in relevance order. Saving converts phrases into
                        meaningful single words and removes filler terms such as
                        “and,” “the,” “with,” and “for.”
                      </p>
                    </div>
                    <div className="md:col-span-2">
                      <Field label="Internal notes">
                        <Textarea
                          value={metadata.internalNotes}
                          onChange={(event) =>
                            setMetadata({
                              ...metadata,
                              internalNotes: event.target.value,
                            })
                          }
                        />
                      </Field>
                    </div>
                    <div className="md:col-span-2 flex justify-end">
                      <Button
                        onClick={() => void onSaveMetadata()}
                        disabled={working}
                      >
                        {working && <LoaderCircle className="animate-spin" />} Save
                        metadata
                      </Button>
                    </div>
                  </div>
                )}
              </TabsContent>
            </div>
          </Tabs>
          <DialogFooter className="mt-0 border-t bg-muted/20 px-6 py-4">
            <p className="mr-auto text-xs text-muted-foreground">
              Checksum {selected.checksum.slice(0, 12)}… · provider original
              preserved
            </p>
            <Button
              variant="outline"
              onClick={() => void onDownload()}
              disabled={
                downloading ||
                selected.review.decision !== "approved" ||
                !metadata ||
                Number(selected.megapixels) < 4 ||
                !["not_required", "completed"].includes(
                  reviewLogoRemoval(selected).status,
                )
              }
            >
              {downloading ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Download />
              )}
              {downloading ? "Preparing…" : "Download JPEG"}
            </Button>
            <Button variant="outline" onClick={onClose} aria-label="Close review">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      ) : activeAssetId && detailLoading ? (
        <DialogContent className="max-w-6xl overflow-hidden p-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-98 data-[state=closed]:duration-100 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:duration-150 motion-reduce:animate-none">
          <DialogHeader className="border-b px-6 pb-5 pt-6 pr-14">
            <DialogTitle>Loading image review</DialogTitle>
            <DialogDescription>
              Restoring the selected image from its review address.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-6 px-6 py-5 lg:grid-cols-[1.25fr_.75fr]">
            <Skeleton className="aspect-[4/3] w-full" />
            <div className="space-y-3">
              <Skeleton className="h-8 w-40" />
              {[0, 1, 2, 3, 4].map((item) => (
                <Skeleton key={item} className="h-10 w-full" />
              ))}
            </div>
          </div>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

function Technical({
  label,
  value,
  warning,
}: {
  label: string;
  value: string;
  warning?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-3 ${warning ? "border-amber-500/40 bg-amber-500/5" : "bg-muted/20"}`}
    >
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-xs font-semibold">{value}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
