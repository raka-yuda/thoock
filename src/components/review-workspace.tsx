"use client";

import dynamic from "next/dynamic";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Search, Sparkles } from "lucide-react";
import { normalizeAdobeCategory } from "@/lib/domain/adobe-categories";
import { BASE_REVIEW_CHECKS } from "@/lib/domain/review";
import type { MetadataProviderId } from "@/lib/runtime-config";
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
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Skeleton } from "./ui/skeleton";
import { Switch } from "./ui/switch";
import { toast, ToastFeedback } from "./ui/toaster";
import { ReviewBulkActionBar } from "./review/review-bulk-action-bar";
import { ReviewAssetGrid } from "./review/review-asset-grid";
import {
  type ReviewAsset as Asset,
  type ReviewMetadata as Metadata,
} from "./review/review-types";

const ReviewDetailDialog = dynamic(
  () =>
    import("./review/review-detail-dialog").then(
      (module) => module.ReviewDetailDialog,
    ),
  { loading: () => null },
);

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

type ReviewFilters = typeof emptyReviewFilters;
const REVIEW_PAGE_SIZE = 15;

function sameReviewFilters(left: ReviewFilters, right: ReviewFilters) {
  return Object.keys(left).every(
    (key) => left[key as keyof ReviewFilters] === right[key as keyof ReviewFilters],
  );
}

export function ReviewWorkspace({
  initialAssetId,
  defaultMetadataProvider = "brief-metadata",
}: {
  initialAssetId?: string;
  defaultMetadataProvider?: MetadataProviderId;
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
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [routeError, setRouteError] = useState("");
  const assetCache = useRef(new Map<string, Asset>());
  const feedAbort = useRef<AbortController | null>(null);
  const feedRequestId = useRef(0);
  const automaticLoadMoreEnabled = useRef(false);
  const appendRequestInFlight = useRef(false);
  const selectedAssetIdSet = useMemo(
    () => new Set(selectedAssetIds),
    [selectedAssetIds],
  );
  const selectedAssets = useMemo(
    () => assets.filter((asset) => selectedAssetIdSet.has(asset.id)),
    [assets, selectedAssetIdSet],
  );
  const aiMetadataProvider =
    defaultMetadataProvider === "openai-metadata" ||
    defaultMetadataProvider === "gemini-metadata"
      ? defaultMetadataProvider
      : null;
  const aiMetadataProviderLabel =
    aiMetadataProvider === "openai-metadata" ? "OpenAI" : "Gemini";

  const loadPage = useCallback(
    async (cursor?: string, append = false) => {
      if (append && appendRequestInFlight.current) return;
      feedAbort.current?.abort();
      const requestId = ++feedRequestId.current;
      if (append) {
        appendRequestInFlight.current = true;
        setLoadingMore(true);
      }
      else {
        appendRequestInFlight.current = false;
        automaticLoadMoreEnabled.current = false;
        setLoadingMore(false);
        setInitialLoading(true);
      }
      setError("");
      const controller = new AbortController();
      feedAbort.current = controller;
      try {
        const params = new URLSearchParams({ limit: String(REVIEW_PAGE_SIZE) });
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
          if (append) {
            appendRequestInFlight.current = false;
            setLoadingMore(false);
          }
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
      setReviewFilters((current) =>
        sameReviewFilters(current, next) ? current : next,
      );
      setDraftFilters((current) =>
        sameReviewFilters(current, next) ? current : next,
      );
    };
    syncFilters();
    window.addEventListener("popstate", syncFilters);
    return () => window.removeEventListener("popstate", syncFilters);
  }, []);

  useEffect(() => {
    queueMicrotask(() => void loadPage());
  }, [loadPage]);

  useEffect(() => {
    if (initialLoading) return;
    const timeout = window.setTimeout(() => {
      void import("./review/review-detail-dialog");
    }, 500);
    return () => window.clearTimeout(timeout);
  }, [initialLoading]);

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
    if (hasMore && nextCursor && !appendRequestInFlight.current)
      void loadPage(nextCursor, true);
  }, [hasMore, loadPage, nextCursor]);

  useEffect(() => {
    let frame = 0;
    const requestNextPageIfNeeded = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const remaining =
          document.documentElement.scrollHeight -
          window.scrollY -
          window.innerHeight;
        if (automaticLoadMoreEnabled.current && remaining < 1_400)
          loadMore();
      });
    };
    const enableAutomaticLoading = () => {
      automaticLoadMoreEnabled.current = true;
      requestNextPageIfNeeded();
    };
    const enableAfterScroll = () => {
      if (window.scrollY > 0) automaticLoadMoreEnabled.current = true;
      requestNextPageIfNeeded();
    };
    const enableAfterKey = (event: KeyboardEvent) => {
      if (
        event.key === "ArrowDown" ||
        event.key === "PageDown" ||
        event.key === "End" ||
        event.key === " "
      )
        enableAutomaticLoading();
    };
    window.addEventListener("wheel", enableAutomaticLoading, { passive: true });
    window.addEventListener("touchmove", enableAutomaticLoading, {
      passive: true,
    });
    window.addEventListener("scroll", enableAfterScroll, { passive: true });
    window.addEventListener("keydown", enableAfterKey);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("wheel", enableAutomaticLoading);
      window.removeEventListener("touchmove", enableAutomaticLoading);
      window.removeEventListener("scroll", enableAfterScroll);
      window.removeEventListener("keydown", enableAfterKey);
    };
  }, [loadMore]);

  useEffect(() => {
    if (loadingMore || !automaticLoadMoreEnabled.current) return;
    const frame = window.requestAnimationFrame(() => {
      const remaining =
        document.documentElement.scrollHeight -
        window.scrollY -
        window.innerHeight;
      if (remaining < 1_400) loadMore();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [assets.length, loadingMore, loadMore]);

  const setImageIdInAddress = useCallback(
    (assetId?: string, mode: "push" | "replace" = "push") => {
      const url = new URL(window.location.href);
      if (assetId) url.searchParams.set("imageId", assetId);
      else url.searchParams.delete("imageId");
      window.history[mode === "push" ? "pushState" : "replaceState"](
        window.history.state,
        "",
        `${url.pathname}${url.search}${url.hash}`,
      );
    },
    [],
  );

  const openAsset = useCallback(
    (asset: Asset) => {
      selectAsset(asset);
      setActiveAssetId(asset.id);
      setImageIdInAddress(asset.id);
    },
    [selectAsset, setImageIdInAddress],
  );

  const toggleAssetSelection = useCallback(
    (assetId: string, checked: boolean) => {
      setSelectedAssetIds((current) =>
        checked
          ? Array.from(new Set([...current, assetId]))
          : current.filter((id) => id !== assetId),
      );
    },
    [],
  );

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

  async function generateMetadata(provider: MetadataProviderId) {
    if (!selected) return;
    setWorking(true);
    setError("");
    try {
      const response = await fetch(`/api/assets/${selected.id}/metadata`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider }),
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error ?? "Could not generate metadata.");
      const generated = {
        ...payload.data,
        category:
          normalizeAdobeCategory(payload.data.category) ?? payload.data.category,
      };
      setMetadata(generated);
      const updatedAsset = {
        ...selected,
        hasMetadata: true,
        metadata: generated,
      };
      assetCache.current.set(updatedAsset.id, updatedAsset);
      setSelected(updatedAsset);
      setAssets((current) =>
        current.map((asset) =>
          asset.id === updatedAsset.id ? updatedAsset : asset,
        ),
      );
      setNotice("Metadata draft created. Review and save it before export.");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not generate metadata.",
      );
    } finally {
      setWorking(false);
    }
  }

  async function generateMetadataForSelectedAssets() {
    if (!aiMetadataProvider || !selectedAssets.length) {
      setError(
        "Configure OpenAI or Gemini metadata generation before using the bulk AI action.",
      );
      return;
    }

    setWorking(true);
    setError("");
    setNotice("");
    const updatedAssets: Asset[] = [];
    const failures: Error[] = [];

    try {
      // Keep paid provider requests sequential so a large selection does not
      // create an uncontrolled burst or make partial failures hard to inspect.
      for (const asset of selectedAssets) {
        try {
          const response = await fetch(`/api/assets/${asset.id}/metadata`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ provider: aiMetadataProvider }),
          });
          const payload = await response.json();
          if (!response.ok) {
            throw new Error(
              payload.error ?? `Could not create metadata for ${asset.briefName}.`,
            );
          }
          const generated: Metadata = {
            ...payload.data,
            category:
              normalizeAdobeCategory(payload.data.category) ??
              payload.data.category,
          };
          updatedAssets.push({
            ...asset,
            hasMetadata: true,
            metadata: generated,
          });
        } catch (caught) {
          failures.push(
            caught instanceof Error
              ? caught
              : new Error(`Could not create metadata for ${asset.briefName}.`),
          );
        }
      }

      const updatedById = new Map(
        updatedAssets.map((asset) => [asset.id, asset]),
      );
      for (const asset of updatedAssets) assetCache.current.set(asset.id, asset);
      setAssets((current) =>
        current.map((asset) => updatedById.get(asset.id) ?? asset),
      );
      setSelected((current) =>
        current ? (updatedById.get(current.id) ?? current) : current,
      );
      if (selected) {
        const selectedUpdate = updatedById.get(selected.id);
        if (selectedUpdate?.metadata) setMetadata(selectedUpdate.metadata);
      }

      if (updatedAssets.length) {
        setNotice(
          `${aiMetadataProviderLabel} created editable metadata drafts for ${updatedAssets.length} selected image${updatedAssets.length === 1 ? "" : "s"}. Review them before export.`,
        );
      }
      if (failures.length) {
        setError(
          `${failures.length} metadata request${failures.length === 1 ? "" : "s"} failed. ${failures[0]?.message ?? "Check provider logs and try again."}`,
        );
      }
    } finally {
      setWorking(false);
    }
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
      if (metadataWarning) {
        toast({
          title: "Review saved with a metadata warning",
          description: metadataWarning,
          variant: "warning",
        });
      } else {
        toast({
          title:
            decision === "approved"
              ? "Image approved"
              : decision === "rejected"
                ? "Image rejected"
                : "Image marked for regeneration",
          description:
            decision === "approved"
              ? "The image passed the human review gate."
              : "The original generated asset remains preserved.",
          variant: decision === "rejected" ? "info" : "success",
        });
      }
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not save review.",
      );
    } finally {
      setWorking(false);
    }
  }

  async function approveSelectedAssets() {
    const targets = selectedAssets;
    if (!targets.length) return;

    setWorking(true);
    setError("");
    setNotice("");
    const completedChecks = Object.fromEntries(
      BASE_REVIEW_CHECKS.map((check) => [check, true]),
    );

    const results = await Promise.allSettled(
      targets.map(async (asset) => {
        const reviewResponse = await fetch(`/api/assets/${asset.id}/review`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            decision: "approved",
            notes: asset.review.notes ?? "",
            checks: completedChecks,
          }),
        });
        const reviewPayload = await reviewResponse.json();
        if (!reviewResponse.ok) {
          throw new Error(
            reviewPayload.error ?? `Could not approve ${asset.briefName}.`,
          );
        }

        let generatedMetadata = asset.metadata;
        let metadataWarning = false;
        if (!generatedMetadata) {
          const metadataResponse = await fetch(
            `/api/assets/${asset.id}/metadata`,
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ provider: "brief-metadata" }),
            },
          );
          const metadataPayload = await metadataResponse.json();
          if (metadataResponse.ok) {
            generatedMetadata = {
              ...metadataPayload.data,
              category:
                normalizeAdobeCategory(metadataPayload.data.category) ??
                metadataPayload.data.category,
            };
          } else {
            metadataWarning = true;
          }
        }

        return {
          asset: {
            ...asset,
            hasMetadata: Boolean(generatedMetadata),
            review: {
              decision: "approved" as const,
              notes: asset.review.notes ?? "",
              reviewedAt: reviewPayload.data.reviewedAt,
            },
            metadata: generatedMetadata,
          },
          metadataWarning,
        };
      }),
    );

    const successful = results.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : [],
    );
    const successfulIds = new Set(
      successful.map((result) => result.asset.id),
    );
    const updatedById = new Map(
      successful.map((result) => [result.asset.id, result.asset]),
    );
    for (const result of successful) {
      assetCache.current.set(result.asset.id, result.asset);
    }
    setAssets((current) =>
      decisionFilter === "all" || decisionFilter === "approved"
        ? current.map((asset) => updatedById.get(asset.id) ?? asset)
        : current.filter((asset) => !successfulIds.has(asset.id)),
    );
    setSelectedAssetIds((current) =>
      current.filter((id) => !successfulIds.has(id)),
    );

    const failed = results.length - successful.length;
    const metadataWarnings = successful.filter(
      (result) => result.metadataWarning,
    ).length;
    if (successful.length) {
      setNotice(
        `${successful.length} image${successful.length === 1 ? "" : "s"} approved${metadataWarnings ? `; ${metadataWarnings} still need metadata` : " and prepared with metadata"}.`,
      );
    }
    if (failed) {
      const firstFailure = results.find(
        (result): result is PromiseRejectedResult =>
          result.status === "rejected",
      );
      setError(
        `${failed} image${failed === 1 ? "" : "s"} could not be approved. ${firstFailure?.reason instanceof Error ? firstFailure.reason.message : "Try again from the individual review."}`,
      );
    }
    setWorking(false);
  }

  async function rejectSelectedAssets() {
    const targets = selectedAssets;
    if (!targets.length) return;

    setWorking(true);
    setError("");
    setNotice("");
    try {
      const results = await Promise.allSettled(
        targets.map(async (asset) => {
          const response = await fetch(`/api/assets/${asset.id}/review`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              decision: "rejected",
              notes: asset.review.notes ?? "",
              checks: {},
            }),
          });
          const payload = await response.json();
          if (!response.ok) {
            throw new Error(
              payload.error ?? `Could not reject ${asset.briefName}.`,
            );
          }
          return {
            ...asset,
            review: {
              decision: "rejected" as const,
              notes: asset.review.notes ?? "",
              reviewedAt: payload.data.reviewedAt,
            },
          };
        }),
      );
      const successful = results.flatMap((result) =>
        result.status === "fulfilled" ? [result.value] : [],
      );
      const successfulIds = new Set(successful.map((asset) => asset.id));
      const updatedById = new Map(successful.map((asset) => [asset.id, asset]));
      for (const asset of successful) assetCache.current.set(asset.id, asset);
      setAssets((current) =>
        decisionFilter === "all" || decisionFilter === "rejected"
          ? current.map((asset) => updatedById.get(asset.id) ?? asset)
          : current.filter((asset) => !successfulIds.has(asset.id)),
      );
      setSelectedAssetIds((current) =>
        current.filter((id) => !successfulIds.has(id)),
      );

      if (successful.length) {
        setNotice(
          `${successful.length} image${successful.length === 1 ? "" : "s"} rejected. Originals remain preserved.`,
        );
      }
      const failed = results.length - successful.length;
      if (failed) {
        const firstFailure = results.find(
          (result): result is PromiseRejectedResult =>
            result.status === "rejected",
        );
        setError(
          `${failed} image${failed === 1 ? "" : "s"} could not be rejected. ${firstFailure?.reason instanceof Error ? firstFailure.reason.message : "Try again from the individual review."}`,
        );
      }
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
      toast({
        title: "Metadata saved",
        description: "The editable Adobe metadata was updated successfully.",
        variant: "success",
      });
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
      />
      <ToastFeedback
        message={error || routeError}
        title="Review workflow needs attention"
        variant="error"
      />
      <ToastFeedback
        message={notice}
        title="Action completed"
        variant="success"
      />
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
        {/* <Select
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
        </Select> */}
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
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
          {Array.from({ length: 10 }, (_, item) => (
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
          <ReviewAssetGrid
            assets={assets}
            selectedAssetIds={selectedAssetIdSet}
            onOpen={openAsset}
            onToggleSelection={toggleAssetSelection}
          />
          <div className="mt-6 min-h-16" aria-live="polite">
            {loadingMore ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
                {[0, 1, 2, 3, 4].map((item) => (
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

      <ReviewBulkActionBar
        selectionCount={selectedAssetIds.length}
        working={working}
        aiMetadataProviderLabel={
          aiMetadataProvider ? aiMetadataProviderLabel : null
        }
        onApprove={() => void approveSelectedAssets()}
        onGenerateMetadata={() => void generateMetadataForSelectedAssets()}
        onReject={() => void rejectSelectedAssets()}
        onClear={() => setSelectedAssetIds([])}
      />

      {activeAssetId ? (
        <ReviewDetailDialog
          activeAssetId={activeAssetId}
          checks={checks}
          defaultMetadataProvider={defaultMetadataProvider}
          detailLoading={detailLoading}
          downloading={downloading}
          metadata={metadata}
          notes={notes}
          previewLoaded={previewLoaded}
          requiredComplete={requiredComplete}
          selected={selected}
          siblings={siblings}
          working={working}
          onCheckAll={checkAllRequiredItems}
          onClose={closeAsset}
          onDownload={downloadPreparedImage}
          onGenerateMetadata={generateMetadata}
          onOpenAsset={openAsset}
          onRegenerate={regenerateAsset}
          onRetryLogoRemoval={retryLogoRemoval}
          onSaveMetadata={saveMetadata}
          onSaveReview={saveReview}
          setChecks={setChecks}
          setMetadata={setMetadata}
          setNotes={setNotes}
          setPreviewLoaded={setPreviewLoaded}
        />
      ) : null}
    </>
  );
}
