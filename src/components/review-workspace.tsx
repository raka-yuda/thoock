"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CircleX,
  Columns2,
  Download,
  FilePenLine,
  LoaderCircle,
  Maximize2,
  RotateCcw,
  Search,
  Sparkles,
} from "lucide-react";
import {
  ADOBE_STOCK_CATEGORIES,
  normalizeAdobeCategory,
} from "@/lib/domain/adobe-categories";
import { BASE_REVIEW_CHECKS } from "@/lib/domain/review";
import { formatUsd } from "@/lib/utils";
import { PageHeader } from "./page-header";
import { DateFilterPicker } from "./date-filter-picker";
import {
  ActiveFilterChips,
  FilterButton,
  FilterChoice,
  FilterDialog,
  FilterSection,
} from "./filter-dialog";
import {
  pushUrlFilters,
  readUrlFilter,
  urlFilterCount,
} from "@/lib/client/url-filters";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
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
} from "./ui/alert-dialog";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Skeleton } from "./ui/skeleton";
import { Switch } from "./ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Textarea } from "./ui/textarea";

type Metadata = {
  filename: string;
  title: string;
  category: string;
  language: string;
  keywords: string[];
  generativeAi: boolean;
  fictionalPeopleProperty: boolean;
  internalNotes: string;
  validationErrors: string[];
};

type Asset = {
  id: string;
  generationJobId: string;
  sourceUrl: string;
  thumbnailUrl?: string;
  previewUrl?: string;
  originalFilename: string;
  mimeType: string;
  width: number;
  height: number;
  megapixels: string;
  fileSize: number;
  checksum: string;
  perceptualHash: string;
  hasMetadata: boolean;
  upscaleStatus: string;
  briefId: string;
  briefName: string;
  prompt: string;
  negativePrompt: string;
  provider: string;
  model: string;
  strategy: string;
  resolution: string;
  quality: string | null;
  aspectRatio: string;
  seed: number | null;
  modelCapabilitySnapshot: { id?: string };
  candidateCount: number;
  estimatedGenerationCostUsd: string;
  generationCostUsd: string | null;
  original?: {
    sourceUrl: string;
    thumbnailUrl: string;
    previewUrl: string;
    mimeType: string;
    width: number;
    height: number;
    megapixels: string;
    fileSize: number;
    checksum: string;
  };
  logoRemoval?: {
    status: "not_required" | "pending" | "processing" | "completed" | "failed";
    method: string | null;
    derivedAssetId: string | null;
    error: string | null;
  };
  review: {
    decision: "pending" | "approved" | "rejected" | "regenerate";
    notes: string;
    reviewedAt: string | null;
  };
  metadata: Metadata | null;
};

const emptyReviewFilters = {
  decision: "all",
  brief: "all",
  technical: "all",
  provider: "all",
  upscale: "all",
  metadata: "all",
  from: "",
  to: "",
  duplicates: false,
};

export function ReviewWorkspace({
  initialAssetId,
}: {
  initialAssetId?: string;
}) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [activeAssetId, setActiveAssetId] = useState(initialAssetId);
  const [selected, setSelected] = useState<Asset | null>(null);
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState("");
  const [metadata, setMetadata] = useState<Metadata | null>(null);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [decisionFilter, setDecisionFilter] = useState("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [reviewFilters, setReviewFilters] = useState(emptyReviewFilters);
  const [draftFilters, setDraftFilters] = useState(emptyReviewFilters);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [detailLoading, setDetailLoading] = useState(Boolean(initialAssetId));
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [previewLoaded, setPreviewLoaded] = useState(false);
  const [working, setWorking] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [routeError, setRouteError] = useState("");
  const assetCache = useRef(new Map<string, Asset>());
  const feedAbort = useRef<AbortController | null>(null);
  const feedRequestId = useRef(0);
  const loadMoreTarget = useRef<HTMLDivElement | null>(null);

  const loadPage = useCallback(
    async (cursor?: string, append = false) => {
      feedAbort.current?.abort();
      const requestId = ++feedRequestId.current;
      if (append) setLoadingMore(true);
      else {
        setLoadingMore(false);
        setInitialLoading(true);
      }
      setError("");
      const controller = new AbortController();
      feedAbort.current = controller;
      try {
        const params = new URLSearchParams({ limit: "12" });
        if (cursor) params.set("cursor", cursor);
        if (debouncedQuery) params.set("q", debouncedQuery);
        if (decisionFilter !== "all") params.set("decision", decisionFilter);
        if (reviewFilters.brief !== "all")
          params.set("briefId", reviewFilters.brief);
        if (reviewFilters.technical !== "all")
          params.set("technical", reviewFilters.technical);
        if (reviewFilters.provider !== "all")
          params.set("provider", reviewFilters.provider);
        if (reviewFilters.upscale !== "all")
          params.set("upscale", reviewFilters.upscale);
        if (reviewFilters.metadata !== "all")
          params.set("metadata", reviewFilters.metadata);
        if (reviewFilters.from) params.set("from", reviewFilters.from);
        if (reviewFilters.to) params.set("to", reviewFilters.to);
        const response = await fetch(`/api/assets?${params.toString()}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json();
        if (!response.ok)
          throw new Error(payload.error ?? "Could not load generated assets.");
        const incoming = payload.data as Asset[];
        for (const asset of incoming) assetCache.current.set(asset.id, asset);
        setAssets((current) => {
          if (!append) return incoming;
          const known = new Set(current.map((asset) => asset.id));
          return [
            ...current,
            ...incoming.filter((asset) => !known.has(asset.id)),
          ];
        });
        setHasMore(Boolean(payload.pagination?.hasMore));
        setNextCursor(payload.pagination?.nextCursor ?? null);
      } catch (caught) {
        if (caught instanceof Error && caught.name === "AbortError") return;
        setError(
          caught instanceof Error
            ? caught.message
            : "Could not load generated assets.",
        );
      } finally {
        if (requestId === feedRequestId.current) {
          if (append) setLoadingMore(false);
          else setInitialLoading(false);
        }
      }
    },
    [debouncedQuery, decisionFilter, reviewFilters],
  );

  useEffect(() => {
    const timeout = window.setTimeout(
      () => setDebouncedQuery(query.trim()),
      250,
    );
    return () => window.clearTimeout(timeout);
  }, [query]);

  useEffect(() => {
    const syncFilters = () => {
      const next = {
        decision: readUrlFilter("decision", "all"),
        brief: readUrlFilter("brief", "all"),
        technical: readUrlFilter("technical", "all"),
        provider: readUrlFilter("provider", "all"),
        upscale: readUrlFilter("upscale", "all"),
        metadata: readUrlFilter("metadata", "all"),
        from: readUrlFilter("from"),
        to: readUrlFilter("to"),
        duplicates: readUrlFilter("duplicates") === "true",
      };
      setQuery(readUrlFilter("q"));
      setDecisionFilter(next.decision);
      setReviewFilters(next);
      setDraftFilters(next);
    };
    syncFilters();
    window.addEventListener("popstate", syncFilters);
    return () => window.removeEventListener("popstate", syncFilters);
  }, []);

  useEffect(() => {
    queueMicrotask(() => void loadPage());
    return () => feedAbort.current?.abort();
  }, [loadPage]);

  useEffect(() => {
    const syncFromAddress = () => {
      const imageId =
        new URLSearchParams(window.location.search).get("imageId") ?? undefined;
      setSelected((current) => (current?.id === imageId ? current : null));
      setDetailLoading(Boolean(imageId));
      setActiveAssetId(imageId);
    };
    window.addEventListener("popstate", syncFromAddress);
    return () => window.removeEventListener("popstate", syncFromAddress);
  }, []);

  const selectAsset = useCallback((asset: Asset) => {
    setSelected(asset);
    setPreviewLoaded(false);
    setDetailLoading(false);
    setNotes(asset.review.notes ?? "");
    setMetadata(
      asset.metadata
        ? {
            ...structuredClone(asset.metadata),
            category: normalizeAdobeCategory(asset.metadata.category) ?? "",
          }
        : null,
    );
    setChecks(
      Object.fromEntries(
        BASE_REVIEW_CHECKS.map((label) => [
          label,
          asset.review.decision === "approved",
        ]),
      ),
    );
  }, []);

  useEffect(() => {
    if (!activeAssetId || selected?.id === activeAssetId) return;
    const cached = assetCache.current.get(activeAssetId);
    if (cached) {
      queueMicrotask(() => selectAsset(cached));
      return;
    }

    const controller = new AbortController();
    queueMicrotask(() => {
      setDetailLoading(true);
      setRouteError("");
    });
    void (async () => {
      try {
        const response = await fetch(
          `/api/assets?id=${encodeURIComponent(activeAssetId)}&limit=1`,
          { cache: "no-store", signal: controller.signal },
        );
        const payload = await response.json();
        if (!response.ok)
          throw new Error(payload.error ?? "Could not load this image.");
        const asset = payload.data?.[0] as Asset | undefined;
        if (!asset) throw new Error("That generated asset could not be found.");
        assetCache.current.set(asset.id, asset);
        selectAsset(asset);
      } catch (caught) {
        if (caught instanceof Error && caught.name === "AbortError") return;
        setDetailLoading(false);
        setRouteError(
          caught instanceof Error
            ? caught.message
            : "That generated asset could not be found.",
        );
      }
    })();
    return () => controller.abort();
  }, [activeAssetId, selectAsset, selected?.id]);

  const loadMore = useCallback(() => {
    if (hasMore && nextCursor && !loadingMore) void loadPage(nextCursor, true);
  }, [hasMore, loadPage, loadingMore, nextCursor]);

  useEffect(() => {
    const target = loadMoreTarget.current;
    if (!target || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { rootMargin: "500px 0px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [loadMore]);

  function setImageIdInAddress(
    assetId?: string,
    mode: "push" | "replace" = "push",
  ) {
    const url = new URL(window.location.href);
    if (assetId) url.searchParams.set("imageId", assetId);
    else url.searchParams.delete("imageId");
    window.history[mode === "push" ? "pushState" : "replaceState"](
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }

  function openAsset(asset: Asset) {
    selectAsset(asset);
    setActiveAssetId(asset.id);
    setImageIdInAddress(asset.id);
  }

  function prefetchPreview(asset: Asset) {
    const image = new window.Image();
    image.decoding = "async";
    image.src = previewUrl(asset);
  }

  function closeAsset() {
    setDetailLoading(false);
    setActiveAssetId(undefined);
    setRouteError("");
    setImageIdInAddress(undefined, "replace");
  }

  function checkAllRequiredItems() {
    setChecks((current) => ({
      ...current,
      ...Object.fromEntries(BASE_REVIEW_CHECKS.map((check) => [check, true])),
    }));
  }

  async function saveReview(decision: "approved" | "rejected" | "regenerate") {
    if (!selected) return;
    setWorking(true);
    setError("");
    try {
      const response = await fetch(`/api/assets/${selected.id}/review`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision, notes, checks }),
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error ?? "Could not save review.");
      let generatedMetadata = selected.metadata;
      let metadataWarning = "";
      if (decision === "approved" && !selected.metadata) {
        const metadataResponse = await fetch(
          `/api/assets/${selected.id}/metadata`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ provider: "brief-metadata" }),
          },
        );
        const metadataPayload = await metadataResponse.json();
        if (!metadataResponse.ok) {
          metadataWarning =
            metadataPayload.error ??
            "Review saved, but the brief metadata plan is incomplete.";
        } else {
          generatedMetadata = {
            ...metadataPayload.data,
            category:
              normalizeAdobeCategory(metadataPayload.data.category) ??
              metadataPayload.data.category,
          };
        }
      }
      const updatedAsset: Asset = {
        ...selected,
        hasMetadata: Boolean(generatedMetadata),
        review: {
          decision,
          notes,
          reviewedAt: payload.data.reviewedAt,
        },
        metadata: generatedMetadata,
      };
      assetCache.current.set(updatedAsset.id, updatedAsset);
      setAssets((current) =>
        decisionFilter === "all" || decisionFilter === decision
          ? current.map((asset) =>
              asset.id === updatedAsset.id ? updatedAsset : asset,
            )
          : current.filter((asset) => asset.id !== updatedAsset.id),
      );
      closeAsset();
      if (metadataWarning) setError(`Image approved. ${metadataWarning}`);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not save review.",
      );
    } finally {
      setWorking(false);
    }
  }

  async function regenerateAsset() {
    if (!selected) return;
    const capabilityId = selected.modelCapabilitySnapshot?.id;
    if (!capabilityId) {
      setError(
        "The original model capability is no longer available. Open the brief in Generation and choose a model manually.",
      );
      return;
    }
    setWorking(true);
    setError("");
    setNotice("");
    let reviewRecorded = false;
    let generationCompleted = false;
    try {
      const generationResponse = await fetch("/api/generation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          briefId: selected.briefId,
          capabilityId,
          strategy: selected.strategy,
          prompt: selected.prompt,
          negativePrompt: selected.negativePrompt || undefined,
          resolution: selected.resolution,
          quality: selected.quality ?? undefined,
          aspectRatio: selected.aspectRatio,
          candidates: selected.candidateCount,
          seed: selected.seed ?? undefined,
          idempotencyKey: crypto.randomUUID(),
          regenerateOfAssetId: selected.id,
        }),
      });
      const generationPayload = await generationResponse.json();
      const generationAttemptRecorded = Boolean(generationPayload.jobId);
      if (!generationResponse.ok && !generationAttemptRecorded)
        throw new Error(
          generationPayload.error ?? "The regeneration attempt failed.",
        );
      generationCompleted = generationResponse.ok;

      const reviewResponse = await fetch(`/api/assets/${selected.id}/review`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision: "regenerate", notes, checks }),
      });
      const reviewPayload = await reviewResponse.json();
      if (!reviewResponse.ok)
        throw new Error(
          reviewPayload.error ?? "Could not save the regeneration decision.",
        );
      reviewRecorded = true;
      const updatedAsset: Asset = {
        ...selected,
        review: {
          decision: "regenerate",
          notes,
          reviewedAt: reviewPayload.data.reviewedAt,
        },
      };
      assetCache.current.set(updatedAsset.id, updatedAsset);
      setAssets((current) =>
        decisionFilter === "all" || decisionFilter === "regenerate"
          ? current.map((asset) =>
              asset.id === updatedAsset.id ? updatedAsset : asset,
            )
          : current.filter((asset) => asset.id !== updatedAsset.id),
      );
      if (!generationResponse.ok) {
        setSelected(updatedAsset);
        throw new Error(
          `${generationPayload.error ?? "The regeneration attempt failed."} The failed linked attempt is available in generation history.`,
        );
      }
      closeAsset();
      setNotice(
        "Regeneration completed as a linked generation attempt. Open the new result in the review feed or generation history.",
      );
    } catch (caught) {
      setError(
        `${
          reviewRecorded
            ? "The image was marked for regeneration, but "
            : generationCompleted
              ? "A new image was generated, but "
              : ""
        }${
          caught instanceof Error
            ? caught.message
            : "the regeneration attempt failed."
        }`,
      );
    } finally {
      setWorking(false);
    }
  }

  async function downloadPreparedImage() {
    if (!selected) return;
    setDownloading(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/assets/${selected.id}/download`, {
        method: "POST",
      });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error ?? "The image could not be downloaded.");
      }
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") ?? "";
      const filename =
        disposition.match(/filename="?([^";]+)"?/i)?.[1] ??
        metadata?.filename ??
        "adobe-stock-image.jpg";
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
      setNotice(
        "Prepared JPEG downloaded after the final Adobe technical gate.",
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The image could not be downloaded.",
      );
    } finally {
      setDownloading(false);
    }
  }

  async function retryLogoRemoval() {
    if (!selected) return;
    setWorking(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/assets/${selected.id}/remove-logo`, {
        method: "POST",
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(
          payload.error ?? "Logo removal could not be completed.",
        );
      const refreshedResponse = await fetch(
        `/api/assets?id=${encodeURIComponent(selected.id)}&limit=1`,
        { cache: "no-store" },
      );
      const refreshedPayload = await refreshedResponse.json();
      if (!refreshedResponse.ok)
        throw new Error(
          refreshedPayload.error ?? "The cleaned image could not be reloaded.",
        );
      const refreshed = refreshedPayload.data?.[0] as Asset | undefined;
      if (!refreshed) throw new Error("The cleaned image could not be found.");
      assetCache.current.set(refreshed.id, refreshed);
      setAssets((current) =>
        current.map((asset) => (asset.id === refreshed.id ? refreshed : asset)),
      );
      selectAsset(refreshed);
      setNotice(
        "SnapGen Fast logo removal completed. The provider original remains preserved.",
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Logo removal could not be completed.",
      );
    } finally {
      setWorking(false);
    }
  }

  async function saveMetadata() {
    if (!selected || !metadata) return;
    setWorking(true);
    setError("");
    try {
      const response = await fetch(`/api/assets/${selected.id}/metadata`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(metadata),
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error ?? "Could not save metadata.");
      setMetadata(payload.data);
      const updatedAsset = { ...selected, metadata: payload.data };
      assetCache.current.set(selected.id, updatedAsset);
      setAssets((current) =>
        current.map((asset) =>
          asset.id === selected.id ? updatedAsset : asset,
        ),
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not save metadata.",
      );
    } finally {
      setWorking(false);
    }
  }

  const siblings = selected
    ? assets.filter((asset) => asset.briefId === selected.briefId)
    : [];
  const requiredComplete = BASE_REVIEW_CHECKS.every((check) => checks[check]);
  const briefOptions = Array.from(
    new Map(assets.map((asset) => [asset.briefId, asset.briefName])).entries(),
  );
  const providerOptions = Array.from(
    new Set(assets.map((asset) => asset.provider)),
  ).sort();
  const activeReviewFilters = [
    reviewFilters.decision !== "all"
      ? {
          key: "decision",
          label: reviewFilters.decision,
          onRemove: () =>
            applyReviewFilters({ ...reviewFilters, decision: "all" }),
        }
      : null,
    reviewFilters.technical !== "all"
      ? {
          key: "technical",
          label:
            reviewFilters.technical === "below_4mp" ? "Below 4MP" : "Meets 4MP",
          onRemove: () =>
            applyReviewFilters({ ...reviewFilters, technical: "all" }),
        }
      : null,
    reviewFilters.provider !== "all"
      ? {
          key: "provider",
          label: reviewFilters.provider,
          onRemove: () =>
            applyReviewFilters({ ...reviewFilters, provider: "all" }),
        }
      : null,
    reviewFilters.upscale !== "all"
      ? {
          key: "upscale",
          label: `Upscale: ${reviewFilters.upscale}`,
          onRemove: () =>
            applyReviewFilters({ ...reviewFilters, upscale: "all" }),
        }
      : null,
    reviewFilters.metadata !== "all"
      ? {
          key: "metadata",
          label: `Metadata: ${reviewFilters.metadata}`,
          onRemove: () =>
            applyReviewFilters({ ...reviewFilters, metadata: "all" }),
        }
      : null,
    reviewFilters.from
      ? {
          key: "from",
          label: `From ${reviewFilters.from}`,
          onRemove: () => applyReviewFilters({ ...reviewFilters, from: "" }),
        }
      : null,
    reviewFilters.to
      ? {
          key: "to",
          label: `Through ${reviewFilters.to}`,
          onRemove: () => applyReviewFilters({ ...reviewFilters, to: "" }),
        }
      : null,
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));

  function applyReviewFilters(next = draftFilters) {
    setReviewFilters(next);
    setDecisionFilter(next.decision);
    setDraftFilters(next);
    pushUrlFilters({
      decision: next.decision,
      brief: next.brief,
      technical: next.technical,
      provider: next.provider,
      upscale: next.upscale,
      metadata: next.metadata,
      from: next.from,
      to: next.to,
      duplicates: next.duplicates ? "true" : null,
    });
    setFilterOpen(false);
  }

  return (
    <>
      <PageHeader
        title="Review queue"
        description="Inspect quality, select final images, and complete compliance checks."
        actions={
          <Button
            onClick={() => assets[0] && openAsset(assets[0])}
            disabled={!assets.length}
          >
            Review next <ArrowRight />
          </Button>
        }
      />
      {(error || routeError) && (
        <Alert className="mb-5 border-destructive/40">
          <AlertTitle>Review workflow needs attention</AlertTitle>
          <AlertDescription>{error || routeError}</AlertDescription>
        </Alert>
      )}
      {notice && (
        <Alert className="mb-5 border-primary/30">
          <Check />
          <AlertTitle>Action completed</AlertTitle>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      <div className="workspace-panel mb-3 flex flex-col gap-3 p-3 sm:flex-row">
        <div className="relative flex-1 sm:max-w-md">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onBlur={() => pushUrlFilters({ q: query || null })}
            placeholder="Search images…"
          />
        </div>
        <Select
          value={reviewFilters.brief}
          onValueChange={(brief) =>
            applyReviewFilters({ ...reviewFilters, brief })
          }
        >
          <SelectTrigger className="sm:w-48">
            <SelectValue placeholder="All briefs" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All briefs</SelectItem>
            {briefOptions.map(([id, name]) => (
              <SelectItem key={id} value={id}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FilterButton
          count={urlFilterCount([
            reviewFilters.decision,
            reviewFilters.brief,
            reviewFilters.technical,
            reviewFilters.provider,
            reviewFilters.upscale,
            reviewFilters.metadata,
            reviewFilters.from,
            reviewFilters.to,
            reviewFilters.duplicates ? "true" : "",
          ])}
          onClick={() => {
            setDraftFilters(reviewFilters);
            setFilterOpen(true);
          }}
        />
        {!initialLoading && (
          <Badge variant="outline" className="h-9 justify-center px-3">
            {assets.length} loaded
          </Badge>
        )}
      </div>
      <ActiveFilterChips
        className="mb-5"
        filters={activeReviewFilters}
        onClear={() => applyReviewFilters(emptyReviewFilters)}
      />
      <FilterDialog
        open={filterOpen}
        onOpenChange={setFilterOpen}
        title="Filter review queue"
        onClear={() => setDraftFilters(emptyReviewFilters)}
        onApply={() => applyReviewFilters()}
      >
        <FilterSection label="Review status">
          <div className="flex flex-wrap gap-2">
            {[
              ["all", "Any"],
              ["pending", "Unreviewed"],
              ["approved", "Approved"],
              ["rejected", "Rejected"],
              ["regenerate", "Regenerate"],
            ].map(([value, label]) => (
              <FilterChoice
                key={value}
                active={draftFilters.decision === value}
                onClick={() =>
                  setDraftFilters((current) => ({
                    ...current,
                    decision: value,
                  }))
                }
              >
                {label}
              </FilterChoice>
            ))}
          </div>
        </FilterSection>
        <FilterSection label="Brief">
          <Select
            value={draftFilters.brief}
            onValueChange={(brief) =>
              setDraftFilters((current) => ({ ...current, brief }))
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="All briefs" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All briefs</SelectItem>
              {briefOptions.map(([id, name]) => (
                <SelectItem key={id} value={id}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterSection>
        <FilterSection label="Technical status">
          <div className="flex flex-wrap gap-2">
            {[
              ["all", "Any"],
              ["meets_4mp", "Meets 4MP"],
              ["below_4mp", "Below 4MP"],
            ].map(([value, label]) => (
              <FilterChoice
                key={value}
                active={draftFilters.technical === value}
                onClick={() =>
                  setDraftFilters((current) => ({
                    ...current,
                    technical: value,
                  }))
                }
              >
                {label}
              </FilterChoice>
            ))}
          </div>
        </FilterSection>
        <FilterSection label="Provider">
          <Select
            value={draftFilters.provider}
            onValueChange={(provider) =>
              setDraftFilters((current) => ({ ...current, provider }))
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="All providers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All providers</SelectItem>
              {providerOptions.map((provider) => (
                <SelectItem key={provider} value={provider}>
                  {provider}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterSection>
        <FilterSection label="Upscaling">
          <div className="flex flex-wrap gap-2">
            {[
              ["all", "Any"],
              ["not_required", "Not required"],
              ["required", "Required"],
              ["upscaled", "Upscaled"],
            ].map(([value, label]) => (
              <FilterChoice
                key={value}
                active={draftFilters.upscale === value}
                onClick={() =>
                  setDraftFilters((current) => ({ ...current, upscale: value }))
                }
              >
                {label}
              </FilterChoice>
            ))}
          </div>
        </FilterSection>
        <FilterSection label="Metadata">
          <div className="flex flex-wrap gap-2">
            {[
              ["all", "Any"],
              ["complete", "Complete"],
              ["incomplete", "Incomplete"],
            ].map(([value, label]) => (
              <FilterChoice
                key={value}
                active={draftFilters.metadata === value}
                onClick={() =>
                  setDraftFilters((current) => ({
                    ...current,
                    metadata: value,
                  }))
                }
              >
                {label}
              </FilterChoice>
            ))}
          </div>
        </FilterSection>
        <FilterSection label="Created date">
          <div className="grid grid-cols-2 gap-3">
            <DateFilterPicker
              id="review-from"
              label="From"
              value={draftFilters.from}
              max={draftFilters.to || undefined}
              ariaLabel="Review assets created from"
              onChange={(from) =>
                setDraftFilters((current) => ({ ...current, from }))
              }
            />
            <DateFilterPicker
              id="review-to"
              label="To"
              value={draftFilters.to}
              min={draftFilters.from || undefined}
              ariaLabel="Review assets created through"
              onChange={(to) =>
                setDraftFilters((current) => ({ ...current, to }))
              }
            />
          </div>
        </FilterSection>
        <label className="flex items-center justify-between gap-3">
          <span className="text-sm">Only possible duplicates</span>
          <Switch
            checked={draftFilters.duplicates}
            onCheckedChange={(duplicates) =>
              setDraftFilters((current) => ({ ...current, duplicates }))
            }
          />
        </label>
      </FilterDialog>

      {initialLoading ? (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 8 }, (_, item) => (
            <Skeleton key={item} className="aspect-[4/3]" />
          ))}
        </div>
      ) : assets.length === 0 ? (
        <section className="rounded-xl border border-dashed px-6 py-14 text-center">
          <Sparkles className="mx-auto size-6 text-primary" />
          <h2 className="mt-4 text-lg font-semibold">
            {query || decisionFilter !== "all"
              ? "No images match these filters"
              : "No generated assets to review"}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            {query || decisionFilter !== "all"
              ? "Try another search or clear the current review status filter."
              : "Open a saved brief, send it to generation, and the inspected output will appear here."}
          </p>
          {query || decisionFilter !== "all" ? (
            <Button
              className="mt-5"
              variant="outline"
              onClick={() => {
                setQuery("");
                setDecisionFilter("all");
              }}
            >
              Clear filters
            </Button>
          ) : (
            <Button className="mt-5" asChild>
              <a href="/briefs">Open commercial briefs</a>
            </Button>
          )}
        </section>
      ) : (
        <>
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {assets.map((asset) => {
              const megapixels = Number(asset.megapixels);
              return (
                <article
                  key={asset.id}
                  className="group overflow-hidden rounded-xl border bg-card [contain-intrinsic-size:auto_420px] [content-visibility:auto]"
                  onMouseEnter={() => prefetchPreview(asset)}
                  onFocus={() => prefetchPreview(asset)}
                >
                  <Button
                    type="button"
                    variant="ghost"
                    className="relative block h-auto aspect-[4/3] w-full overflow-hidden rounded-none bg-muted p-0 hover:bg-muted"
                    onClick={() => openAsset(asset)}
                    aria-label={`Review ${asset.briefName}`}
                  >
                    <Image
                      src={thumbnailUrl(asset)}
                      alt={asset.briefName}
                      fill
                      unoptimized
                      loading="lazy"
                      decoding="async"
                      sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 25vw"
                      className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                    />
                    <span className="absolute right-3 top-3 grid size-8 place-items-center rounded-lg bg-background/90">
                      <Maximize2 className="size-4" />
                    </span>
                  </Button>
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="line-clamp-2 text-sm font-semibold">
                          {asset.briefName}
                        </h2>
                        <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                          {asset.width} × {asset.height} ·{" "}
                          {megapixels.toFixed(2)}MP
                        </p>
                      </div>
                      <Badge
                        variant={
                          asset.review.decision === "approved"
                            ? "success"
                            : asset.review.decision === "rejected"
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {asset.review.decision}
                      </Badge>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-1.5">
                      <Badge variant={megapixels < 4 ? "warning" : "outline"}>
                        {megapixels < 4 ? "Upscale required" : "4MP ready"}
                      </Badge>
                      <Badge variant="outline">
                        {asset.mimeType.replace("image/", "").toUpperCase()}
                      </Badge>
                      {asset.metadata && (
                        <Badge variant="outline">Metadata ready</Badge>
                      )}
                    </div>
                    <div className="mt-4 flex items-center justify-between border-t pt-3">
                      <span className="text-xs text-muted-foreground">
                        Generation{" "}
                        {formatUsd(Number(asset.generationCostUsd ?? 0))}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openAsset(asset)}
                      >
                        Review
                      </Button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
          <div
            ref={loadMoreTarget}
            className="mt-6 min-h-16"
            aria-live="polite"
          >
            {loadingMore ? (
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {[0, 1, 2, 3].map((item) => (
                  <Skeleton key={item} className="aspect-[4/3]" />
                ))}
              </div>
            ) : hasMore ? (
              <div className="flex justify-center">
                <Button variant="outline" onClick={loadMore}>
                  Load more images
                </Button>
              </div>
            ) : (
              <p className="py-2 text-center text-xs text-muted-foreground">
                All matching images loaded
              </p>
            )}
          </div>
        </>
      )}

      <Dialog
        open={Boolean(activeAssetId && (detailLoading || selected))}
        onOpenChange={(open) => !open && closeAsset()}
      >
        {selected ? (
          <DialogContent className="max-w-6xl overflow-hidden p-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-98 data-[state=closed]:duration-100 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:duration-150 motion-reduce:animate-none">
            <DialogHeader className="border-b px-6 pb-5 pt-6 pr-14">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant={
                    Number(selected.megapixels) >= 4 ? "success" : "warning"
                  }
                >
                  {Number(selected.megapixels).toFixed(2)}MP
                </Badge>
                <Badge variant="outline">
                  {selected.provider} · {selected.model}
                </Badge>
                {logoRemovalOf(selected).status === "completed" && (
                  <Badge variant="success">Logo removed · Fast</Badge>
                )}
              </div>
              <DialogTitle className="mt-2">{selected.briefName}</DialogTitle>
              <DialogDescription>
                Actual file: {selected.width} × {selected.height}. Automated
                checks remain advisory.
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
                            src={thumbnailUrl(selected)}
                            alt=""
                            fill
                            unoptimized
                            loading="eager"
                            className="scale-105 object-contain opacity-70 blur-md"
                          />
                        )}
                        <Image
                          src={previewUrl(selected)}
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
                          value={selected.mimeType
                            .replace("image/", "")
                            .toUpperCase()}
                        />
                        <Technical
                          label="File size"
                          value={`${(selected.fileSize / 1_000_000).toFixed(2)}MB`}
                        />
                      </div>
                      {logoRemovalOf(selected).status === "completed" && (
                        <Alert className="mt-4 border-emerald-500/35">
                          <Sparkles />
                          <AlertTitle>SnapGen provider mark removed</AlertTitle>
                          <AlertDescription>
                            Review and export use the cleaned derived image.
                            Fast removal is free, and the original provider
                            output remains preserved separately.
                          </AlertDescription>
                        </Alert>
                      )}
                      {logoRemovalOf(selected).status === "failed" && (
                        <Alert className="mt-4 border-destructive/40 text-destructive">
                          <AlertTriangle />
                          <AlertTitle>Provider-mark cleanup failed</AlertTitle>
                          <AlertDescription>
                            <p>
                              {logoRemovalOf(selected).error ??
                                "SnapGen did not return a cleaned image."}
                            </p>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="mt-3"
                              onClick={() => void retryLogoRemoval()}
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
                            Select this only if you plan to upscale it, or
                            regenerate the brief with a direct-compliant
                            resolution.
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
                            {
                              BASE_REVIEW_CHECKS.filter((item) => checks[item])
                                .length
                            }
                            /{BASE_REVIEW_CHECKS.length}
                          </span>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={checkAllRequiredItems}
                            disabled={requiredComplete}
                            aria-label="Check all required human review items"
                          >
                            <Check />{" "}
                            {requiredComplete ? "All checked" : "Check all"}
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
                          onClick={() => saveReview("rejected")}
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
                                This creates a linked generation attempt using
                                the same prompt, provider, model, resolution,
                                quality, seed, and candidate count. After an
                                attempt is recorded, the current image is marked
                                “regenerate.” Estimated additional cost:{" "}
                                {selected.estimatedGenerationCostUsd
                                  ? formatUsd(
                                      Number(
                                        selected.estimatedGenerationCostUsd,
                                      ),
                                    )
                                  : "unavailable"}
                                .{" "}
                                {!["mock", "imported"].includes(
                                  selected.provider,
                                )
                                  ? "This may be a paid request and will not retry automatically."
                                  : "This provider is configured as free."}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => void regenerateAsset()}
                              >
                                Confirm regeneration
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                        <Button
                          onClick={() => saveReview("approved")}
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
                        onClick={() => openAsset(asset)}
                      >
                        <div className="relative aspect-[4/3] bg-muted">
                          <Image
                            src={thumbnailUrl(asset)}
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
                    <Alert>
                      <FilePenLine />
                      <AlertTitle>
                        Metadata is inherited from the brief after approval
                      </AlertTitle>
                      <AlertDescription>
                        Complete the Adobe metadata plan on the source brief,
                        then approve this asset. Thoock creates only the
                        asset-specific filename locally; no AI key or dummy
                        category is required.
                      </AlertDescription>
                    </Alert>
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
                            setMetadata({
                              ...metadata,
                              title: event.target.value,
                            })
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
                              <SelectItem
                                key={category.code}
                                value={category.code}
                              >
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
                          meaningful single words and removes filler terms such
                          as “and,” “the,” “with,” and “for.”
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
                        <Button onClick={saveMetadata} disabled={working}>
                          {working && <LoaderCircle className="animate-spin" />}{" "}
                          Save metadata
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
                onClick={() => void downloadPreparedImage()}
                disabled={
                  downloading ||
                  selected.review.decision !== "approved" ||
                  !metadata ||
                  Number(selected.megapixels) < 4 ||
                  !["not_required", "completed"].includes(
                    logoRemovalOf(selected).status,
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
              <Button
                variant="outline"
                onClick={closeAsset}
                aria-label="Close review"
              >
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
    </>
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

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function thumbnailUrl(asset: Asset) {
  return asset.thumbnailUrl ?? `${asset.sourceUrl}?width=640`;
}

function previewUrl(asset: Asset) {
  return asset.previewUrl ?? `${asset.sourceUrl}?width=1600`;
}

function logoRemovalOf(asset: Asset): NonNullable<Asset["logoRemoval"]> {
  return (
    asset.logoRemoval ?? {
      status: "not_required",
      method: null,
      derivedAssetId: null,
      error: null,
    }
  );
}
