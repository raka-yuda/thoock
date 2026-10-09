"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  AlertTriangle,
  CheckCircle2,
  CircleDollarSign,
  History,
  Info,
  MoreVertical,
  Play,
  RefreshCw,
  RotateCcw,
  Scale,
  Search,
  ShieldCheck,
  WandSparkles,
} from "lucide-react";
import {
  generationFailureGuidance,
  type GenerationFailureKind,
} from "@/lib/domain/generation-failure";
import type { ModelCapability } from "@/lib/domain/model-catalog";
import {
  estimateGenerationCost,
  getExpectedDimensions,
} from "@/lib/domain/model-catalog";
import {
  recommendGenerationStrategy,
  type PipelineOption,
} from "@/lib/domain/generation-strategy";
import { calculateMegapixels } from "@/lib/domain/image";
import { formatAppDateTime } from "@/lib/format/date";
import { formatIdr, formatUsd } from "@/lib/utils";
import { PageHeader } from "./page-header";
import { Metric } from "./metric";
import { DateFilterPicker } from "./date-filter-picker";
import { DateRangeToolbar } from "./date-range-toolbar";
import { DataPagination } from "./data-pagination";
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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
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
import { Progress } from "./ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Slider } from "./ui/slider";
import { Switch } from "./ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs";
import { Textarea } from "./ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";
import { toast, ToastFeedback } from "./ui/toaster";

type Strategy = "economical" | "direct_4mp" | "custom";
type GenerationJob = {
  id: string;
  retryOfJobId: string | null;
  regenerateOfJobId: string | null;
  briefId: string;
  briefName: string;
  prompt: string;
  negativePrompt: string;
  provider: string;
  model: string;
  strategy: Strategy;
  resolution: string;
  quality: string | null;
  aspectRatio: string;
  seed: number | null;
  modelCapabilitySnapshot: ModelCapability;
  candidateCount: number;
  estimatedCostUsd: string;
  actualCostUsd: string | null;
  providerRequestId: string | null;
  providerRequestIds: string[];
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  progress: number;
  errorDetails: string | null;
  failureKind: GenerationFailureKind | null;
  attemptCount: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  stale: boolean;
  assets: Array<{
    id: string;
    sourceUrl: string;
    originalFilename: string;
    width: number;
    height: number;
    megapixels: string;
  }>;
};
type Props = {
  catalog: ModelCapability[];
  localUpscaleConfigured: boolean;
  briefDraft: GenerationDraft | null;
  mockMode?: boolean;
};
export type GenerationDraft = {
  briefId?: string;
  briefName?: string;
  prompt?: string;
  negativePrompt?: string;
  orientation?: string;
  candidateCount?: number;
};

const strategyLabels: Record<Strategy, string> = {
  economical: "Economical candidates",
  direct_4mp: "Direct 4MP",
  custom: "Custom",
};

const providerLabels: Record<string, string> = {
  mock: "Mock studio",
  imported: "Imported image",
  snapgen: "SnapGenAI",
  "black-forest-labs": "Black Forest Labs",
  gemini: "Google Gemini image",
  "cloudflare-workers-ai": "Cloudflare Workers AI",
};

function cost(value: number | null) {
  return value === null ? "Cost unavailable" : formatUsd(value);
}
function dimensionsText(dimensions: { width: number; height: number } | null) {
  return dimensions ? `${dimensions.width} × ${dimensions.height}` : "Unknown";
}
function isExpectedCompliant(
  dimensions: { width: number; height: number } | null,
) {
  return dimensions
    ? calculateMegapixels(dimensions.width, dimensions.height) >= 4
    : null;
}

function displayGenerationError(value: string | null) {
  if (!value) return "Generation failed.";
  if (!/<!doctype html|<html/i.test(value)) return value;
  const summary =
    value.match(/^.*?status\s+\d+/i)?.[0] ?? "Provider request failed";
  return `${summary}. The provider gateway returned an HTML error page instead of JSON.`;
}

export function GenerationWorkspace({
  catalog,
  localUpscaleConfigured,
  briefDraft,
  mockMode = true,
}: Props) {
  const enabled = catalog.filter((item) => item.enabled);
  const liveEnabled = enabled.filter(
    (item) => !["mock", "imported"].includes(item.providerId),
  );
  const preferredEnabled = !mockMode && liveEnabled.length ? liveEnabled : enabled;
  const providers = [...new Set(catalog.map((item) => item.providerId))];
  const initialEconomical =
    (mockMode
      ? preferredEnabled.find((item) => item.id === "mock-economical")
      : undefined) ??
    preferredEnabled[0] ??
    catalog[0];
  const initialDirect =
    (mockMode
      ? preferredEnabled.find((item) => item.id === "mock-direct")
      : undefined) ??
    preferredEnabled.find((item) =>
      item.supportedResolutions.some((resolution) =>
        Object.values(resolution.expectedDimensions).some(
          (size) => calculateMegapixels(size.width, size.height) >= 4,
        ),
      ),
    ) ??
    initialEconomical;
  const [strategy, setStrategy] = useState<Strategy>("economical");
  const [workspaceTab, setWorkspaceTab] = useState<"create" | "history">(
    briefDraft?.briefId ? "create" : "history",
  );
  const [customCapabilityId, setCustomCapabilityId] = useState(
    initialEconomical.id,
  );
  const [providerId, setProviderId] = useState(initialEconomical.providerId);
  const [candidateCount, setCandidateCount] = useState(
    briefDraft?.candidateCount ?? 3,
  );
  const [aspectRatio, setAspectRatio] = useState(
    briefDraft?.orientation === "horizontal"
      ? "16:9"
      : briefDraft?.orientation === "square"
        ? "1:1"
        : briefDraft?.orientation === "vertical"
          ? "9:16"
          : "4:3",
  );
  const [resolution, setResolution] = useState(
    initialEconomical.supportedResolutions[0]?.id ?? "",
  );
  const [quality, setQuality] = useState(
    initialEconomical.supportedQualityLevels[0] ?? "",
  );
  const [seed, setSeed] = useState(42);
  const [prompt, setPrompt] = useState(
    briefDraft?.prompt ??
      "Commercial lifestyle photograph of a Southeast Asian professional taking a calm mindful break beside a contemporary home workspace, useful copy space, natural details",
  );
  const [negativePrompt, setNegativePrompt] = useState(
    briefDraft?.negativePrompt ??
      "logos, trademarks, legible text, malformed hands, distorted anatomy",
  );
  const [sort, setSort] = useState("total");
  const [status, setStatus] = useState<
    "idle" | "running" | "complete" | "failed"
  >("idle");
  const [error, setError] = useState("");
  const [history, setHistory] = useState<GenerationJob[]>([]);
  const [historyScope, setHistoryScope] = useState(
    briefDraft?.briefId ? "brief" : "all",
  );
  const [historyFilter, setHistoryFilter] = useState("all");
  const [historyProvider, setHistoryProvider] = useState("all");
  const [historyQuery, setHistoryQuery] = useState("");
  const [historyResult, setHistoryResult] = useState("all");
  const [historyRetryable, setHistoryRetryable] = useState(false);
  const [historyPaid, setHistoryPaid] = useState(false);
  const [historyFrom, setHistoryFrom] = useState("");
  const [historyTo, setHistoryTo] = useState("");
  const [historyFilterOpen, setHistoryFilterOpen] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize] = useState(10);
  const [historySort, setHistorySort] = useState("newest");
  const [historyPagination, setHistoryPagination] = useState({
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 0,
  });
  const [historyDraft, setHistoryDraft] = useState({
    status: "all",
    provider: "all",
    result: "all",
    retryable: false,
    paid: false,
    from: "",
    to: "",
  });
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [historyNotice, setHistoryNotice] = useState("");
  const [retryingJobId, setRetryingJobId] = useState<string | null>(null);
  const [retryConfirmJob, setRetryConfirmJob] =
    useState<GenerationJob | null>(null);
  const [checkingJob, setCheckingJob] = useState<GenerationJob | null>(null);
  const [historyUuid, setHistoryUuid] = useState("");
  const [checkingProvider, setCheckingProvider] = useState(false);

  const selected = useMemo(() => {
    if (strategy === "economical") return initialEconomical;
    if (strategy === "direct_4mp") return initialDirect;
    return (
      catalog.find((item) => item.id === customCapabilityId) ??
      initialEconomical
    );
  }, [catalog, customCapabilityId, initialDirect, initialEconomical, strategy]);
  const activeResolution =
    selected.supportedResolutions.find((item) => item.id === resolution) ??
    selected.supportedResolutions[0];
  const activeAspect = selected.supportedAspectRatios.includes(aspectRatio)
    ? aspectRatio
    : (selected.supportedAspectRatios[0] ?? "4:3");
  const activeQuality = selected.supportedQualityLevels.includes(quality)
    ? quality
    : (selected.supportedQualityLevels[0] ?? "");
  const expectedDimensions = activeResolution
    ? getExpectedDimensions(selected, activeResolution.id, activeAspect)
    : null;
  const expectedMegapixels = expectedDimensions
    ? calculateMegapixels(expectedDimensions.width, expectedDimensions.height)
    : null;

  const economicDimensions = getExpectedDimensions(
    initialEconomical,
    initialEconomical.supportedResolutions[0]?.id ?? "",
    "4:3",
  );
  const directDimensions = getExpectedDimensions(
    initialDirect,
    initialDirect.supportedResolutions[0]?.id ?? "",
    "4:3",
  );
  const economicalOption: PipelineOption = {
    providerId: initialEconomical.providerId,
    modelId: initialEconomical.providerModelId,
    resolution: initialEconomical.supportedResolutions[0]?.id ?? "unconfigured",
    costPerCandidateUsd: initialEconomical.generationPriceUsd,
    expectedWidth: economicDimensions?.width ?? null,
    expectedHeight: economicDimensions?.height ?? null,
  };
  const directOption: PipelineOption = {
    providerId: initialDirect.providerId,
    modelId: initialDirect.providerModelId,
    resolution: initialDirect.supportedResolutions[0]?.id ?? "unconfigured",
    costPerCandidateUsd: initialDirect.generationPriceUsd,
    expectedWidth: directDimensions?.width ?? null,
    expectedHeight: directDimensions?.height ?? null,
  };
  const recommendation = recommendGenerationStrategy({
    economical: economicalOption,
    direct: directOption,
    candidateCount,
    upscaler: {
      id: localUpscaleConfigured ? "local-upscale" : "stability",
      configured: localUpscaleConfigured,
      paid: !localUpscaleConfigured,
      estimatedCostPerSelectedUsd: localUpscaleConfigured ? 0 : null,
      maySubstantiallyReinterpret: false,
    },
  });
  const selectedGenerationCost = estimateGenerationCost(
    selected,
    candidateCount,
  );
  const selectedProviderPaid = !["mock", "imported"].includes(
    selected.providerId,
  );
  const modelOptions = catalog.filter((item) => item.providerId === providerId);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(historyPage),
        pageSize: String(historyPageSize),
        sort: historySort,
      });
      if (historyFilter !== "all") params.set("status", historyFilter);
      if (historyQuery.trim()) params.set("q", historyQuery.trim());
      if (historyScope === "brief" && briefDraft?.briefId)
        params.set("briefId", briefDraft.briefId);
      if (historyProvider !== "all") params.set("provider", historyProvider);
      if (historyResult !== "all") params.set("result", historyResult);
      if (historyRetryable) params.set("retryable", "true");
      if (historyPaid) params.set("paid", "true");
      if (historyFrom) params.set("from", historyFrom);
      if (historyTo) params.set("to", historyTo);
      const response = await fetch(`/api/generation?${params}`, {
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error ?? "Could not load generation history.");
      setHistory(payload.data);
      setHistoryPagination(
        payload.pagination ?? {
          page: historyPage,
          pageSize: historyPageSize,
          total: payload.data.length,
          totalPages: payload.data.length ? 1 : 0,
        },
      );
      setHistoryError("");
    } catch (caught) {
      setHistoryError(
        caught instanceof Error
          ? caught.message
          : "Could not load generation history.",
      );
    } finally {
      setHistoryLoading(false);
    }
  }, [
    briefDraft,
    historyFilter,
    historyFrom,
    historyPage,
    historyPageSize,
    historyPaid,
    historyProvider,
    historyQuery,
    historyResult,
    historyRetryable,
    historyScope,
    historySort,
    historyTo,
  ]);

  useEffect(() => {
    const syncHistoryFilters = () => {
      const next = {
        status: readUrlFilter("historyStatus", "all"),
        provider: readUrlFilter("historyProvider", "all"),
        result: readUrlFilter("historyResult", "all"),
        retryable: readUrlFilter("historyRetryable") === "true",
        paid: readUrlFilter("historyPaid") === "true",
        from: readUrlFilter("historyFrom"),
        to: readUrlFilter("historyTo"),
      };
      setHistoryFilter(next.status);
      setHistoryProvider(next.provider);
      setHistoryQuery(readUrlFilter("historyQuery"));
      setHistoryPage(
        Math.max(1, Number(readUrlFilter("historyPage", "1")) || 1),
      );
      setHistorySort(readUrlFilter("historySort", "newest"));
      setHistoryResult(next.result);
      setHistoryRetryable(next.retryable);
      setHistoryPaid(next.paid);
      setHistoryFrom(next.from);
      setHistoryTo(next.to);
      setHistoryDraft(next);
      const tab = readUrlFilter(
        "tab",
        briefDraft?.briefId ? "create" : "history",
      );
      if (tab === "create" || tab === "history") setWorkspaceTab(tab);
    };
    syncHistoryFilters();
    window.addEventListener("popstate", syncHistoryFilters);
    return () => window.removeEventListener("popstate", syncHistoryFilters);
  }, [briefDraft?.briefId]);

  function applyHistoryFilters() {
    setHistoryFilter(historyDraft.status);
    setHistoryProvider(historyDraft.provider);
    setHistoryResult(historyDraft.result);
    setHistoryRetryable(historyDraft.retryable);
    setHistoryPaid(historyDraft.paid);
    setHistoryFrom(historyDraft.from);
    setHistoryTo(historyDraft.to);
    setHistoryPage(1);
    pushUrlFilters({
      historyStatus: historyDraft.status,
      historyProvider: historyDraft.provider,
      historyResult: historyDraft.result,
      historyRetryable: historyDraft.retryable ? "true" : null,
      historyPaid: historyDraft.paid ? "true" : null,
      historyFrom: historyDraft.from,
      historyTo: historyDraft.to,
      historyPage: 1,
    });
    setHistoryFilterOpen(false);
  }
  function clearHistoryFilters() {
    const next = {
      status: "all",
      provider: "all",
      result: "all",
      retryable: false,
      paid: false,
      from: "",
      to: "",
    };
    setHistoryDraft(next);
    setHistoryFilter("all");
    setHistoryProvider("all");
    setHistoryQuery("");
    setHistoryResult("all");
    setHistoryRetryable(false);
    setHistoryPaid(false);
    setHistoryFrom("");
    setHistoryTo("");
    setHistoryPage(1);
    pushUrlFilters({
      historyStatus: null,
      historyProvider: null,
      historyQuery: null,
      historyResult: null,
      historyRetryable: null,
      historyPaid: null,
      historyFrom: null,
      historyTo: null,
      historyPage: 1,
    });
  }
  const historyActiveFilters = [
    historyFilter !== "all"
      ? {
          key: "status",
          label: `Status: ${historyFilter}`,
          onRemove: () => {
            setHistoryFilter("all");
            setHistoryDraft((value) => ({ ...value, status: "all" }));
            pushUrlFilters({ historyStatus: null });
          },
        }
      : null,
    historyProvider !== "all"
      ? {
          key: "provider",
          label: `Provider: ${providerLabels[historyProvider] ?? historyProvider}`,
          onRemove: () => {
            setHistoryProvider("all");
            setHistoryDraft((value) => ({ ...value, provider: "all" }));
            pushUrlFilters({ historyProvider: null });
          },
        }
      : null,
    historyResult !== "all"
      ? {
          key: "result",
          label: historyResult === "has_image" ? "Has image" : "No image",
          onRemove: () => {
            setHistoryResult("all");
            setHistoryDraft((value) => ({ ...value, result: "all" }));
            pushUrlFilters({ historyResult: null });
          },
        }
      : null,
    historyRetryable
      ? {
          key: "retryable",
          label: "Retryable failures",
          onRemove: () => {
            setHistoryRetryable(false);
            setHistoryDraft((value) => ({ ...value, retryable: false }));
            pushUrlFilters({ historyRetryable: null });
          },
        }
      : null,
    historyPaid
      ? {
          key: "paid",
          label: "Paid requests",
          onRemove: () => {
            setHistoryPaid(false);
            setHistoryDraft((value) => ({ ...value, paid: false }));
            pushUrlFilters({ historyPaid: null });
          },
        }
      : null,
    historyFrom
      ? {
          key: "from",
          label: `From ${historyFrom}`,
          onRemove: () => {
            setHistoryFrom("");
            setHistoryDraft((value) => ({ ...value, from: "" }));
            pushUrlFilters({ historyFrom: null });
          },
        }
      : null,
    historyTo
      ? {
          key: "to",
          label: `Through ${historyTo}`,
          onRemove: () => {
            setHistoryTo("");
            setHistoryDraft((value) => ({ ...value, to: "" }));
            pushUrlFilters({ historyTo: null });
          },
        }
      : null,
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));

  useEffect(() => {
    queueMicrotask(() => void loadHistory());
  }, [loadHistory]);

  useEffect(() => {
    if (!history.some((job) => job.status === "running")) return;
    const interval = window.setInterval(() => void loadHistory(), 5_000);
    return () => window.clearInterval(interval);
  }, [history, loadHistory]);

  const rows = [
    {
      id: "economical",
      label: "Economical",
      capability: initialEconomical,
      dimensions: economicDimensions,
      generation: initialEconomical.generationPriceUsd,
      upscale: recommendation.estimatedUpscalingCostUsd,
      total: recommendation.economicalPipelineCostUsd,
    },
    {
      id: "direct",
      label: "Direct 4MP",
      capability: initialDirect,
      dimensions: directDimensions,
      generation: initialDirect.generationPriceUsd,
      upscale: 0,
      total: recommendation.directPipelineCostUsd,
    },
    {
      id: "custom",
      label: "Custom",
      capability: selected,
      dimensions: expectedDimensions,
      generation: selected.generationPriceUsd,
      upscale: isExpectedCompliant(expectedDimensions) ? 0 : null,
      total: isExpectedCompliant(expectedDimensions)
        ? selectedGenerationCost
        : null,
    },
  ].sort((left, right) => {
    if (sort === "resolution")
      return (
        (right.dimensions
          ? right.dimensions.width * right.dimensions.height
          : -1) -
        (left.dimensions ? left.dimensions.width * left.dimensions.height : -1)
      );
    if (sort === "generation")
      return (
        (left.generation ?? Number.POSITIVE_INFINITY) -
        (right.generation ?? Number.POSITIVE_INFINITY)
      );
    return (
      (left.total ?? Number.POSITIVE_INFINITY) -
      (right.total ?? Number.POSITIVE_INFINITY)
    );
  });

  function selectProvider(nextProvider: string) {
    setProviderId(nextProvider);
    const first = catalog.find((item) => item.providerId === nextProvider);
    if (first) {
      setCustomCapabilityId(first.id);
      setResolution(first.supportedResolutions[0]?.id ?? "");
      setQuality(first.supportedQualityLevels[0] ?? "");
      setAspectRatio(first.supportedAspectRatios[0] ?? "4:3");
    }
  }
  function selectModel(id: string) {
    const capability = catalog.find((item) => item.id === id);
    if (!capability) return;
    setCustomCapabilityId(id);
    setResolution(capability.supportedResolutions[0]?.id ?? "");
    setQuality(capability.supportedQualityLevels[0] ?? "");
    setAspectRatio(capability.supportedAspectRatios[0] ?? "4:3");
  }
  async function run() {
    if (!expectedDimensions) {
      setError(
        "The selected model needs resolution and dimension capabilities before it can run.",
      );
      setStatus("failed");
      return;
    }
    setStatus("running");
    setError("");
    try {
      const response = await fetch("/api/generation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          briefId: briefDraft?.briefId,
          capabilityId: selected.id,
          strategy,
          prompt,
          negativePrompt: selected.supportsNegativePrompt
            ? negativePrompt
            : undefined,
          resolution: activeResolution?.id,
          quality: activeQuality,
          aspectRatio: activeAspect,
          candidates: candidateCount,
          seed: selected.supportsSeed ? seed : undefined,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Generation failed.");
      setStatus("complete");
      await loadHistory();
      toast({
        title: "Generation request completed",
        description: `${candidateCount} candidate${candidateCount === 1 ? "" : "s"} requested with ${selected.displayName}.`,
        variant: "success",
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Generation failed.");
      setStatus("failed");
      await loadHistory();
    }
  }

  async function retryJob(job: GenerationJob) {
    const snapshot = job.modelCapabilitySnapshot;
    const capabilityId =
      snapshot?.id ??
      catalog.find(
        (item) =>
          item.providerId === job.provider &&
          item.providerModelId === job.model,
      )?.id;
    if (!capabilityId) {
      setHistoryError(
        "The original model capability is no longer available. Open the brief and choose another model.",
      );
      return;
    }
    setRetryingJobId(job.id);
    setHistoryError("");
    try {
      const response = await fetch("/api/generation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          briefId: job.briefId,
          capabilityId,
          strategy: job.strategy,
          prompt: job.prompt,
          negativePrompt: job.negativePrompt || undefined,
          resolution: job.resolution,
          quality: job.quality ?? undefined,
          aspectRatio: job.aspectRatio,
          candidates: job.candidateCount,
          seed: job.seed ?? undefined,
          idempotencyKey: crypto.randomUUID(),
          retryOfJobId: job.id,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Retry failed.");
      await loadHistory();
      toast({
        title: "Retry started",
        description: `A new attempt was created for “${job.briefName}”.`,
        variant: "success",
      });
    } catch (caught) {
      setHistoryError(
        caught instanceof Error ? caught.message : "Retry failed.",
      );
      await loadHistory();
    } finally {
      setRetryingJobId(null);
    }
  }

  async function markInterrupted(job: GenerationJob) {
    setRetryingJobId(job.id);
    setHistoryError("");
    try {
      const response = await fetch(`/api/generation/jobs/${job.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "mark_interrupted" }),
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error ?? "Could not recover the stale job.");
      await loadHistory();
      toast({
        title: "Job marked interrupted",
        description: "The stale attempt can now be retried safely.",
        variant: "success",
      });
    } catch (caught) {
      setHistoryError(
        caught instanceof Error
          ? caught.message
          : "Could not recover the stale job.",
      );
    } finally {
      setRetryingJobId(null);
    }
  }

  function openProviderCheck(job: GenerationJob) {
    setCheckingJob(job);
    setHistoryUuid(job.providerRequestIds?.[0] ?? job.providerRequestId ?? "");
    setHistoryError("");
    setHistoryNotice("");
  }

  async function checkProviderResult() {
    if (!checkingJob) return;
    const hasStoredRequestId = Boolean(
      checkingJob.providerRequestIds?.length || checkingJob.providerRequestId,
    );
    setCheckingProvider(true);
    setHistoryError("");
    setHistoryNotice("");
    try {
      const response = await fetch(
        `/api/generation/jobs/${checkingJob.id}/recover`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(
            hasStoredRequestId
              ? {}
              : historyUuid.trim()
                ? { providerRequestId: historyUuid.trim() }
                : {},
          ),
        },
      );
      const payload = await response.json();
      if (!response.ok)
        throw new Error(
          payload.error ?? "Could not check the SnapGenAI result.",
        );
      setHistoryNotice(
        payload.data?.message ??
          "Provider status checked. No new generation was submitted.",
      );
      setCheckingJob(null);
      await loadHistory();
    } catch (caught) {
      setHistoryError(
        caught instanceof Error
          ? caught.message
          : "Could not check the SnapGenAI result.",
      );
    } finally {
      setCheckingProvider(false);
    }
  }

  return (
    <TooltipProvider>
      <PageHeader
        title="Image generation"
        description="Generate, recover, and inspect provider attempts."
        actions={
          <Button
            onClick={() => {
              setWorkspaceTab("create");
              pushUrlFilters({ tab: "create" });
            }}
          >
            <WandSparkles />
            New generation
          </Button>
        }
      />
      <Tabs
        value={workspaceTab}
        onValueChange={(value) => {
          const tab = value as "create" | "history";
          setWorkspaceTab(tab);
          pushUrlFilters({ tab });
        }}
        className="mb-4"
      >
        <TabsList>
          <TabsTrigger value="create">Create</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>
      </Tabs>
      <div className={workspaceTab === "create" ? "" : "hidden"}>
        {!briefDraft?.briefId && (
          <Alert className="mb-6 border-amber-500/35">
            <AlertTriangle />
            <AlertTitle>No saved commercial brief selected</AlertTitle>
            <AlertDescription>
              Open a saved brief and choose “Use in generation” so the generated
              job and its images remain connected to the research workflow.
            </AlertDescription>
          </Alert>
        )}
        <Tabs
          value={strategy}
          onValueChange={(value) => setStrategy(value as Strategy)}
          className="mb-6"
        >
          <TabsList className="grid w-full max-w-2xl grid-cols-3">
            {(Object.keys(strategyLabels) as Strategy[]).map((id) => (
              <TabsTrigger key={id} value={id}>
                {strategyLabels[id]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
          <Card>
            <CardHeader>
              <CardTitle>Generation configuration</CardTitle>
              <CardDescription>
                Options follow the selected model capability record; custom
                choices are never replaced by the recommendation.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <Field label="Commercial brief">
                <Input
                  readOnly
                  value={briefDraft?.briefName ?? "No saved brief selected"}
                />
              </Field>
              {briefDraft?.prompt && (
                <Alert>
                  <WandSparkles />
                  <AlertTitle>Brief prompt loaded</AlertTitle>
                  <AlertDescription>
                    The editable prompt and orientation were carried from the
                    commercial brief.
                  </AlertDescription>
                </Alert>
              )}
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Provider">
                  <Select
                    value={
                      strategy === "custom" ? providerId : selected.providerId
                    }
                    onValueChange={selectProvider}
                    disabled={strategy !== "custom"}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {providers.map((provider) => (
                        <SelectItem key={provider} value={provider}>
                          {providerLabels[provider] ?? provider}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Model">
                  <Select
                    value={selected.id}
                    onValueChange={selectModel}
                    disabled={strategy !== "custom"}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(strategy === "custom" ? modelOptions : [selected]).map(
                        (model) => (
                          <SelectItem key={model.id} value={model.id}>
                            {model.displayName}
                            {!model.enabled ? " (disabled)" : ""}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <div className="grid gap-5 sm:grid-cols-3">
                <Field label="Resolution">
                  <Select
                    value={activeResolution?.id ?? "unconfigured"}
                    onValueChange={setResolution}
                    disabled={!selected.supportedResolutions.length}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Unconfigured" />
                    </SelectTrigger>
                    <SelectContent>
                      {selected.supportedResolutions.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Quality">
                  <Select
                    value={
                      selected.supportedQualityLevels.includes(quality)
                        ? quality
                        : (selected.supportedQualityLevels[0] ?? "unconfigured")
                    }
                    onValueChange={setQuality}
                    disabled={!selected.supportedQualityLevels.length}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Not supported" />
                    </SelectTrigger>
                    <SelectContent>
                      {selected.supportedQualityLevels.map((item) => (
                        <SelectItem key={item} value={item}>
                          {item}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Aspect ratio">
                  <Select
                    value={activeAspect}
                    onValueChange={setAspectRatio}
                    disabled={!selected.supportedAspectRatios.length}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Unconfigured" />
                    </SelectTrigger>
                    <SelectContent>
                      {selected.supportedAspectRatios.map((item) => (
                        <SelectItem key={item} value={item}>
                          {item}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <Field label={`Candidates: ${candidateCount}`}>
                <Slider
                  min={1}
                  max={6}
                  step={1}
                  value={[candidateCount]}
                  onValueChange={([value]) => setCandidateCount(value)}
                />
              </Field>
              {selected.supportsSeed && (
                <Field label="Optional seed">
                  <Input
                    type="number"
                    value={seed}
                    onChange={(event) => setSeed(Number(event.target.value))}
                  />
                </Field>
              )}
              <Field label="Generation prompt">
                <Textarea
                  className="min-h-28"
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                />
              </Field>
              <Field
                label={`Negative prompt${selected.supportsNegativePrompt ? "" : " — unsupported by this model"}`}
              >
                <Textarea
                  disabled={!selected.supportsNegativePrompt}
                  value={selected.supportsNegativePrompt ? negativePrompt : ""}
                  onChange={(event) => setNegativePrompt(event.target.value)}
                />
              </Field>
              {!selected.enabled && (
                <Alert className="border-destructive/40">
                  <AlertTriangle />
                  <AlertTitle>Model is not enabled</AlertTitle>
                  <AlertDescription>
                    Verify capabilities, commercial terms, and pricing in the
                    model catalog before enabling this paid entry.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Selected request</CardTitle>
                <CardDescription>
                  Expected values support planning only
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Estimated generation cost
                    </p>
                    <p className="mt-1 font-mono text-3xl font-semibold">
                      {cost(selectedGenerationCost)}
                    </p>
                    {selectedGenerationCost !== null && (
                      <p className="text-xs text-muted-foreground">
                        about {formatIdr(selectedGenerationCost * 17650)}
                      </p>
                    )}
                  </div>
                  <Badge
                    variant={
                      selected.commercialUseStatus === "verified"
                        ? "success"
                        : "warning"
                    }
                  >
                    <ShieldCheck />
                    Commercial use {selected.commercialUseStatus}
                  </Badge>
                </div>
                <dl className="grid grid-cols-2 gap-4 border-y py-4 text-xs">
                  <Stat
                    label="Estimated cost per image"
                    value={cost(selected.generationPriceUsd)}
                  />
                  <Stat
                    label="Estimated candidate total"
                    value={cost(selectedGenerationCost)}
                  />
                  <Stat
                    label="Expected dimensions"
                    value={dimensionsText(expectedDimensions)}
                  />
                  <Stat
                    label="Expected megapixels"
                    value={
                      expectedMegapixels === null
                        ? "Unknown"
                        : `${expectedMegapixels.toFixed(2)}MP`
                    }
                  />
                  <Stat
                    label="Expected direct 4MP"
                    value={
                      isExpectedCompliant(expectedDimensions) === null
                        ? "Unknown"
                        : isExpectedCompliant(expectedDimensions)
                          ? "Yes"
                          : "No"
                    }
                  />
                  <Stat
                    label="Pricing verified"
                    value={
                      selected.lastPricingVerificationDate ?? "Not verified"
                    }
                  />
                </dl>
                {selected.commercialTermsReference && (
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Commercial terms reference:{" "}
                    {selected.commercialTermsReference}
                  </p>
                )}
                {selectedProviderPaid && selectedGenerationCost === null && (
                  <Alert className="border-amber-500/35 bg-amber-500/5">
                    <AlertTriangle />
                    <AlertTitle>Paid request with unknown cost</AlertTitle>
                    <AlertDescription>
                      SnapGen pricing is not configured, so this request cannot
                      be included accurately in the monthly estimate. Confirm
                      only after checking your provider balance or plan.
                    </AlertDescription>
                  </Alert>
                )}
                <div>
                  <div className="mb-2 flex justify-between text-xs">
                    <span>Monthly budget consumption</span>
                    <span>62%</span>
                  </div>
                  <Progress value={62} />
                </div>
                {status === "running" && (
                  <Alert>
                    <CircleDollarSign />
                    <AlertTitle>Generation job running</AlertTitle>
                    <AlertDescription>
                      Returned files will be inspected with Sharp; no paid retry
                      is automatic.
                    </AlertDescription>
                  </Alert>
                )}
                {status === "complete" && (
                  <Alert>
                    <CheckCircle2 />
                    <AlertTitle>Candidates generated</AlertTitle>
                    <AlertDescription>
                      Outputs were inspected and sent to the human review queue.
                    </AlertDescription>
                  </Alert>
                )}
                {status === "failed" && (
                  <Alert className="border-destructive/40">
                    <AlertTriangle />
                    <AlertTitle>Generation failed</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      className="w-full"
                      disabled={
                        status === "running" ||
                        !selected.enabled ||
                        !briefDraft?.briefId
                      }
                    >
                      <Play />
                      Review and generate
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        Confirm {selectedProviderPaid ? "paid " : ""}generation?
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        Create {candidateCount} candidate
                        {candidateCount === 1 ? "" : "s"} with{" "}
                        {selected.displayName}. Estimate:{" "}
                        {cost(selectedGenerationCost)}. Paid retries and paid
                        fallback operations require separate confirmation.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={run}>
                        Confirm generation
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Advisory recommendation</CardTitle>
              </CardHeader>
              <CardContent>
                <Badge variant="secondary">
                  {recommendation.recommendation.replaceAll("_", " ")}
                </Badge>
                <p className="mt-3 text-sm leading-relaxed">
                  {recommendation.explanation}
                </p>
                <div className="mt-4 rounded-lg bg-muted p-3 text-xs">
                  <p className="font-medium">Upscale break-even</p>
                  <p className="mt-1 text-muted-foreground">
                    {recommendation.maximumAffordableUpscaleCostUsd === null
                      ? "Cost unavailable"
                      : `${formatUsd(recommendation.maximumAffordableUpscaleCostUsd)} maximum for one selected asset`}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
      <div className={workspaceTab === "history" ? "" : "hidden"}>
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <Metric
            label="Attempts"
            value={String(historyPagination.total)}
            note="Matching this view"
            icon={History}
          />
          <Metric
            label="Completed"
            value={String(
              history.filter((job) => job.status === "succeeded").length,
            )}
            note="On this page"
            icon={CheckCircle2}
          />
          <Metric
            label="Failed"
            value={String(
              history.filter((job) => job.status === "failed").length,
            )}
            note="On this page"
            icon={AlertTriangle}
          />
        </div>
        <Card className="overflow-hidden">
          <CardHeader className="workspace-toolbar flex-col gap-3 border-b p-3 lg:flex-row lg:items-center">
              <div className="relative min-w-0 flex-1">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={historyQuery}
                  onChange={(event) => {
                    setHistoryQuery(event.target.value);
                    setHistoryPage(1);
                  }}
                  onBlur={() =>
                    pushUrlFilters({ historyQuery: historyQuery || null, historyPage: 1 })
                  }
                  placeholder="Search generations…"
                  className="pl-9"
                  aria-label="Search generation history"
                />
              </div>
              <DateRangeToolbar
                from={historyFrom}
                to={historyTo}
                ariaLabel="Filter generation history by date"
                onApply={(from, to) => {
                  setHistoryFrom(from);
                  setHistoryTo(to);
                  setHistoryDraft((value) => ({ ...value, from, to }));
                  setHistoryPage(1);
                  pushUrlFilters({
                    historyFrom: from || null,
                    historyTo: to || null,
                    historyPage: 1,
                  });
                }}
              />
              {briefDraft?.briefId && (
                <Select
                  value={historyScope}
                  onValueChange={(value) => {
                    setHistoryScope(value);
                    setHistoryPage(1);
                  }}
                >
                  <SelectTrigger
                    className="w-40"
                    aria-label="Generation history scope"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="brief">This brief</SelectItem>
                    <SelectItem value="all">All history</SelectItem>
                  </SelectContent>
                </Select>
              )}
              <FilterButton
                count={urlFilterCount([
                  historyFilter,
                  historyProvider,
                  historyResult,
                  historyRetryable ? "true" : "",
                  historyPaid ? "true" : "",
                ])}
                onClick={() => {
                  setHistoryDraft({
                    status: historyFilter,
                    provider: historyProvider,
                    result: historyResult,
                    retryable: historyRetryable,
                    paid: historyPaid,
                    from: historyFrom,
                    to: historyTo,
                  });
                  setHistoryFilterOpen(true);
                }}
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => void loadHistory()}
                disabled={historyLoading}
                aria-label="Refresh generation history"
              >
                <RefreshCw className={historyLoading ? "animate-spin" : ""} />
              </Button>
          </CardHeader>
          <CardContent className="p-0">
            <ActiveFilterChips
              className="border-b bg-muted/10 px-3 py-2.5"
              filters={historyActiveFilters}
              onClear={clearHistoryFilters}
            />
            <ToastFeedback
              message={historyError}
              title="Generation recovery needs attention"
              variant="error"
            />
            <ToastFeedback
              message={historyNotice}
              title="Provider result checked"
              variant="info"
            />
            {historyLoading && history.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                Loading generation attempts…
              </div>
            ) : history.length === 0 ? (
              <div className="rounded-lg border border-dashed px-5 py-10 text-center text-sm text-muted-foreground">
                No generation attempts match this filter.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table className="workspace-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead>
                        <button
                          type="button"
                          className="table-sort-trigger"
                          onClick={() => {
                            const next = historySort === "name_asc" ? "name_desc" : "name_asc";
                            setHistorySort(next);
                            setHistoryPage(1);
                            pushUrlFilters({ historySort: next, historyPage: 1 });
                          }}
                        >
                          Brief / attempt
                          {historySort === "name_desc" ? <ArrowDown /> : <ArrowUp />}
                        </button>
                      </TableHead>
                      <TableHead>Provider</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Cost</TableHead>
                      <TableHead>Result</TableHead>
                      <TableHead>
                        <button
                          type="button"
                          className="table-sort-trigger"
                          onClick={() => {
                            const next = historySort === "newest" ? "oldest" : "newest";
                            setHistorySort(next);
                            setHistoryPage(1);
                            pushUrlFilters({ historySort: next, historyPage: 1 });
                          }}
                        >
                          Created
                          {historySort === "oldest" ? <ArrowUp /> : <ArrowDown />}
                        </button>
                      </TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.map((job) => {
                      const paid = !["mock", "imported"].includes(job.provider);
                      const kind = job.failureKind ?? "unknown";
                      const estimateAvailable =
                        !paid ||
                        typeof job.modelCapabilitySnapshot
                          ?.generationPriceUsd === "number";
                      return (
                        <TableRow key={job.id}>
                          <TableCell className="min-w-56">
                            <p className="font-medium">{job.briefName}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Attempt {job.attemptCount} ·{" "}
                              {job.regenerateOfJobId
                                ? "Regeneration"
                                : job.retryOfJobId
                                  ? "Retry"
                                  : "Original"}{" "}
                            </p>
                          </TableCell>
                          <TableCell className="min-w-44">
                            <p>
                              {providerLabels[job.provider] ?? job.provider}
                            </p>
                            <p className="mt-1 max-w-52 truncate text-xs text-muted-foreground">
                              {job.model}
                            </p>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                job.status === "succeeded"
                                  ? "success"
                                  : job.status === "failed"
                                    ? "destructive"
                                    : job.stale
                                      ? "warning"
                                      : "secondary"
                              }
                            >
                              {job.stale ? "May be interrupted" : job.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {job.actualCostUsd === null
                              ? estimateAvailable
                                ? `Est. ${formatUsd(Number(job.estimatedCostUsd))}`
                                : "Cost unavailable"
                              : formatUsd(Number(job.actualCostUsd))}
                          </TableCell>
                          <TableCell className="max-w-80">
                            {job.status === "failed" ? (
                              <>
                                <p className="line-clamp-2 text-xs text-destructive">
                                  {displayGenerationError(job.errorDetails)}
                                </p>
                                <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                                  {generationFailureGuidance(kind)}
                                </p>
                                {job.provider === "snapgen" &&
                                  !job.providerRequestId &&
                                  !job.providerRequestIds?.length && (
                                    <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
                                      SnapGen did not return a UUID. Search
                                      provider history before starting a paid
                                      retry.
                                    </p>
                                  )}
                              </>
                            ) : job.status === "succeeded" ? (
                              job.assets.length > 0 ? (
                                <div className="flex flex-wrap gap-2">
                                  {job.assets.map((asset, index) => (
                                    <Button
                                      key={asset.id}
                                      variant="outline"
                                      size="sm"
                                      className="h-auto justify-start p-1.5"
                                      asChild
                                    >
                                      <Link
                                        href={`/review?imageId=${asset.id}`}
                                        aria-label={`Review result ${index + 1} from ${job.briefName}`}
                                      >
                                        <Image
                                          src={`${asset.sourceUrl}?width=320`}
                                          alt=""
                                          width={48}
                                          height={36}
                                          unoptimized
                                          loading="lazy"
                                          decoding="async"
                                          className="h-9 w-12 rounded object-cover"
                                        />
                                        <span className="text-left">
                                          <span className="block text-xs">
                                            Result {index + 1}
                                          </span>
                                          <span className="block font-mono text-[10px] font-normal text-muted-foreground">
                                            {Number(asset.megapixels).toFixed(
                                              2,
                                            )}
                                            MP
                                          </span>
                                        </span>
                                      </Link>
                                    </Button>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">
                                  No stored result found
                                </span>
                              )
                            ) : (
                              <span className="text-xs text-muted-foreground">
                                {job.progress}% complete
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                            {formatAppDateTime(job.createdAt)}
                          </TableCell>
                          <TableCell>
                            <div className="flex justify-end">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    aria-label={`Actions for ${job.briefName}, attempt ${job.attemptCount}`}
                                  >
                                    <MoreVertical />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  {job.assets[0] && (
                                    <DropdownMenuItem asChild>
                                      <Link
                                        href={`/review?imageId=${job.assets[0].id}`}
                                      >
                                        <CheckCircle2 /> Review result
                                      </Link>
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuItem asChild>
                                    <a href={`/provider-logs?job=${job.id}`}>
                                      <History /> View provider logs
                                    </a>
                                  </DropdownMenuItem>
                                  {job.provider === "snapgen" &&
                                    (job.status === "failed" ||
                                      job.status === "running") && (
                                      <DropdownMenuItem
                                        onSelect={() => openProviderCheck(job)}
                                      >
                                        <RefreshCw /> Check provider result
                                      </DropdownMenuItem>
                                    )}
                                  {(job.stale || job.status === "failed") && (
                                    <DropdownMenuSeparator />
                                  )}
                                  {job.stale && (
                                    <DropdownMenuItem
                                      disabled={retryingJobId === job.id}
                                      onSelect={() => void markInterrupted(job)}
                                    >
                                      <AlertTriangle /> Mark interrupted
                                    </DropdownMenuItem>
                                  )}
                                  {job.status === "failed" && (
                                    <>
                                      <DropdownMenuItem asChild>
                                        <a
                                          href={`/generation?brief=${job.briefId}`}
                                        >
                                          <WandSparkles /> Edit settings
                                        </a>
                                      </DropdownMenuItem>
                                      <DropdownMenuItem
                                        disabled={retryingJobId === job.id}
                                        onSelect={() => setRetryConfirmJob(job)}
                                      >
                                        <RotateCcw /> Retry generation
                                      </DropdownMenuItem>
                                    </>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
            <DataPagination
              page={historyPagination.page}
              totalPages={historyPagination.totalPages}
              totalItems={historyPagination.total}
              pageSize={historyPagination.pageSize}
              itemLabel="attempts"
              disabled={historyLoading}
              onPageChange={(value) => {
                setHistoryPage(value);
                pushUrlFilters({ historyPage: value });
              }}
            />
          </CardContent>
        </Card>
      </div>
      <AlertDialog
        open={Boolean(retryConfirmJob)}
        onOpenChange={(open) => !open && setRetryConfirmJob(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Retry attempt {retryConfirmJob?.attemptCount}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This creates a new linked attempt using the same prompt and
              settings. Estimated additional cost:{" "}
              {retryConfirmJob &&
              (["mock", "imported"].includes(retryConfirmJob.provider) ||
                typeof retryConfirmJob.modelCapabilitySnapshot
                  ?.generationPriceUsd === "number")
                ? formatUsd(Number(retryConfirmJob.estimatedCostUsd))
                : "unavailable"}
              .
              {retryConfirmJob &&
              !["mock", "imported"].includes(retryConfirmJob.provider)
                ? " The previous provider request may also have been charged; review its log before confirming."
                : " This provider is configured as free."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!retryConfirmJob) return;
                const job = retryConfirmJob;
                setRetryConfirmJob(null);
                void retryJob(job);
              }}
            >
              Confirm retry
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <FilterDialog
        open={historyFilterOpen}
        onOpenChange={setHistoryFilterOpen}
        title="Filter generation history"
        onClear={() =>
          setHistoryDraft({
            status: "all",
            provider: "all",
            result: "all",
            retryable: false,
            paid: false,
            from: "",
            to: "",
          })
        }
        onApply={applyHistoryFilters}
      >
        <FilterSection label="Attempt status">
          <div className="flex flex-wrap gap-2">
            {["all", "running", "succeeded", "failed", "cancelled"].map(
              (value) => (
                <FilterChoice
                  key={value}
                  active={historyDraft.status === value}
                  onClick={() =>
                    setHistoryDraft((current) => ({
                      ...current,
                      status: value,
                    }))
                  }
                >
                  {value === "all" ? "Any status" : value}
                </FilterChoice>
              ),
            )}
          </div>
        </FilterSection>
        <FilterSection label="Result">
          <div className="flex flex-wrap gap-2">
            {[
              ["all", "Any result"],
              ["has_image", "Has image"],
              ["no_image", "No image"],
            ].map(([value, label]) => (
              <FilterChoice
                key={value}
                active={historyDraft.result === value}
                onClick={() =>
                  setHistoryDraft((current) => ({
                    ...current,
                    result: value,
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
            value={historyDraft.provider}
            onValueChange={(provider) =>
              setHistoryDraft((current) => ({ ...current, provider }))
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All providers</SelectItem>
              {providers.map((provider) => (
                <SelectItem key={provider} value={provider}>
                  {providerLabels[provider] ?? provider}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterSection>
        <FilterSection label="Created date">
          <div className="grid gap-3 sm:grid-cols-2">
            <DateFilterPicker
              id="history-from"
              label="Created from"
              value={historyDraft.from}
              max={historyDraft.to || undefined}
              ariaLabel="Generation history from"
              onChange={(from) =>
                setHistoryDraft((current) => ({ ...current, from }))
              }
            />
            <DateFilterPicker
              id="history-to"
              label="Created through"
              value={historyDraft.to}
              min={historyDraft.from || undefined}
              ariaLabel="Generation history through"
              onChange={(to) =>
                setHistoryDraft((current) => ({ ...current, to }))
              }
            />
          </div>
        </FilterSection>
        <div className="space-y-3">
          <label className="flex items-center justify-between gap-4 text-sm">
            <span>Only retryable failures</span>
            <Switch
              checked={historyDraft.retryable}
              onCheckedChange={(retryable) =>
                setHistoryDraft((current) => ({ ...current, retryable }))
              }
            />
          </label>
          <label className="flex items-center justify-between gap-4 text-sm">
            <span>Only paid requests</span>
            <Switch
              checked={historyDraft.paid}
              onCheckedChange={(paid) =>
                setHistoryDraft((current) => ({ ...current, paid }))
              }
            />
          </label>
        </div>
      </FilterDialog>
      <Dialog
        open={Boolean(checkingJob)}
        onOpenChange={(open) => {
          if (!open && !checkingProvider) setCheckingJob(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Check SnapGenAI result</DialogTitle>
            <DialogDescription>
              Thoock checks the saved UUID, or searches recent SnapGenAI history
              when the generation response never returned one. It does not
              submit a new generation request.
            </DialogDescription>
          </DialogHeader>
          <Alert className="mb-5 border-amber-500/35">
            <AlertTriangle />
            <AlertTitle>Read-only provider recovery</AlertTitle>
            <AlertDescription>
              Search uses the exact prompt, model, and request time. You can
              optionally paste a UUID from the SnapGenAI dashboard if automatic
              matching cannot identify one unambiguously.
            </AlertDescription>
          </Alert>
          <div className="grid gap-2">
            <Label htmlFor="snapgen-history-uuid">
              Optional SnapGen history UUID
            </Label>
            <Input
              id="snapgen-history-uuid"
              value={historyUuid}
              onChange={(event) => setHistoryUuid(event.target.value)}
              placeholder="Leave blank to search recent history automatically"
              autoComplete="off"
              disabled={
                checkingProvider ||
                Boolean(
                  checkingJob?.providerRequestIds?.length ||
                  checkingJob?.providerRequestId,
                )
              }
            />
            {(checkingJob?.providerRequestIds?.length ?? 0) > 1 && (
              <p className="text-xs text-muted-foreground">
                Thoock saved {checkingJob?.providerRequestIds.length} UUIDs for
                this attempt and will check all of them.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCheckingJob(null)}
              disabled={checkingProvider}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void checkProviderResult()}
              disabled={checkingProvider}
            >
              <RefreshCw className={checkingProvider ? "animate-spin" : ""} />
              {checkingProvider
                ? "Checking…"
                : !historyUuid.trim() &&
                    !checkingJob?.providerRequestIds?.length &&
                    !checkingJob?.providerRequestId
                  ? "Find result now"
                  : "Check result now"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Card className={workspaceTab === "create" ? "mt-6" : "hidden"}>
        <CardHeader className="flex-row items-end justify-between">
          <div>
            <CardTitle>Complete pipeline comparison</CardTitle>
            <CardDescription>
              Defaults assume three candidates and one selected candidate.
            </CardDescription>
          </div>
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="total">Sort: expected total cost</SelectItem>
              <SelectItem value="generation">Sort: generation cost</SelectItem>
              <SelectItem value="resolution">
                Sort: expected resolution
              </SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Strategy</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Model</TableHead>
                <TableHead>Resolution</TableHead>
                <TableHead className="text-right">Candidate cost</TableHead>
                <TableHead className="text-right">Upscale cost</TableHead>
                <TableHead className="text-right">
                  <span className="inline-flex items-center gap-1">
                    Expected total
                    <Tooltip>
                      <TooltipTrigger>
                        <Info className="size-3" />
                      </TooltipTrigger>
                      <TooltipContent>
                        candidate count × generation price + one expected
                        selected upscale
                      </TooltipContent>
                    </Tooltip>
                  </span>
                </TableHead>
                <TableHead>Expected 4MP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.label}</TableCell>
                  <TableCell>{row.capability.providerId}</TableCell>
                  <TableCell>{row.capability.displayName}</TableCell>
                  <TableCell>
                    {row.capability.supportedResolutions[0]?.label ??
                      "Unconfigured"}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {cost(row.generation)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {cost(row.upscale)}
                  </TableCell>
                  <TableCell className="text-right font-mono font-semibold">
                    {cost(row.total)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        isExpectedCompliant(row.dimensions)
                          ? "success"
                          : isExpectedCompliant(row.dimensions) === false
                            ? "warning"
                            : "outline"
                      }
                    >
                      {isExpectedCompliant(row.dimensions) === null
                        ? "Unknown"
                        : isExpectedCompliant(row.dimensions)
                          ? "Expected"
                          : "Upscale likely"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {rows.some((row) => row.total === null) && (
            <Alert className="mt-4">
              <AlertTriangle />
              <AlertTitle>Missing pricing or capability data</AlertTitle>
              <AlertDescription>
                “Cost unavailable” is intentional. Configure verified prices and
                expected dimensions; the application will not invent either.
              </AlertDescription>
            </Alert>
          )}
          <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
            <Scale className="size-4" /> Compare complete pipeline cost, not
            generation price alone. The recommendation remains advisory.
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
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
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
  );
}
