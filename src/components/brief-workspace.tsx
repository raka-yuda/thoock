"use client";

import { useRouter } from "next/navigation";
import type {
  BriefProviderId,
  PromptProviderId,
} from "@/lib/runtime-config";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowRight,
  BookOpenText,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FilePenLine,
  Layers3,
  LoaderCircle,
  Play,
  Plus,
  Search,
  Sparkles,
  Upload,
  WandSparkles,
} from "lucide-react";
import type { CommercialPromptBrief } from "@/modules/providers/contracts";
import { ADOBE_STOCK_CATEGORIES } from "@/lib/domain/adobe-categories";
import { formatAppDateTime } from "@/lib/format/date";
import {
  estimateGenerationCost,
  defaultModelCatalog,
  type ModelCapability,
} from "@/lib/domain/model-catalog";
import { DataPagination } from "./data-pagination";
import { DateFilterPicker } from "./date-filter-picker";
import { DateRangeToolbar } from "./date-range-toolbar";
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
  replaceUrlFilters,
  urlFilterCount,
} from "@/lib/client/url-filters";
import { PageHeader } from "./page-header";
import { Metric as WorkspaceMetric } from "./metric";
import { TableBulkActionBar } from "./table-bulk-action-bar";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Textarea } from "./ui/textarea";
import { toast, ToastFeedback, type ToastVariant } from "./ui/toaster";

type Opportunity = {
  id: string;
  keyword: string;
  targetRegion: string;
  opportunityScore: string;
};

type Brief = {
  id: string;
  opportunityId: string | null;
  opportunityKeyword: string | null;
  name: string;
  targetBuyer: string;
  intendedUsage: string;
  targetMarket: string;
  mainSubject: string;
  supportingSubjects: string[];
  environment: string;
  visualStyle: string;
  orientation: string;
  composition: string;
  copySpaceLocation: string;
  lighting: string;
  mood: string;
  representationNotes: string;
  prohibitedElements: string[];
  candidateCount: number;
  status: "draft" | "ready" | "generating" | "complete" | "archived";
  generationPrompt: string;
  negativePrompt: string;
  metadataTitle: string;
  metadataCategory: string;
  metadataLanguage: string;
  metadataKeywords: string[];
  metadataFictionalPeopleProperty: boolean;
  metadataNotes: string;
  createdAt: string;
  updatedAt: string;
  successfulGenerationCount: number;
};

type ManualBrief = Omit<
  Brief,
  | "id"
  | "opportunityId"
  | "opportunityKeyword"
  | "status"
  | "createdAt"
  | "updatedAt"
  | "successfulGenerationCount"
>;

type BulkImportPreview = {
  valid: boolean;
  rowCount: number;
  rows: Array<{
    row: number;
    name: string;
    mainSubject: string;
    targetMarket: string;
    orientation: string;
    candidateCount: number;
    metadataCategory: string;
    opportunityKeyword: string | null;
  }>;
  errors: Array<{ row: number; field: string; message: string }>;
};

const manualDefaults: ManualBrief = {
  name: "",
  targetBuyer: "Commercial marketing teams",
  intendedUsage: "Website, social campaign, and presentation",
  targetMarket: "Indonesia",
  mainSubject: "",
  supportingSubjects: [],
  environment: "Contemporary everyday setting",
  visualStyle: "Natural commercial lifestyle photography",
  orientation: "horizontal",
  composition: "Clear focal subject with useful negative space",
  copySpaceLocation: "left",
  lighting: "Soft natural daylight",
  mood: "Credible and optimistic",
  representationNotes: "Authentic representation; avoid stereotypes",
  prohibitedElements: ["logos", "trademarks", "legible text"],
  candidateCount: 3,
  generationPrompt: "",
  negativePrompt: "",
  metadataTitle: "",
  metadataCategory: "",
  metadataLanguage: "en",
  metadataKeywords: [],
  metadataFictionalPeopleProperty: false,
  metadataNotes: "",
};

const presets = [
  "Mixed commercial concepts",
  "Horizontal website banner",
  "Square social-media image",
  "Vertical mobile advertisement",
  "Presentation background",
  "Isolated object",
  "Business lifestyle",
  "Health and wellness",
  "Seasonal commercial content",
];

export function BriefWorkspace({
  catalog = defaultModelCatalog,
  mockMode = true,
  defaultBriefProvider = "mock-brief-ai",
  defaultPromptProvider = "mock-prompt",
}: {
  catalog?: ModelCapability[];
  mockMode?: boolean;
  defaultBriefProvider?: BriefProviderId;
  defaultPromptProvider?: PromptProviderId;
}) {
  const router = useRouter();
  const [briefs, setBriefs] = useState<Brief[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [orientationFilter, setOrientationFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [opportunityFilter, setOpportunityFilter] = useState("all");
  const [sort, setSort] = useState("updated_desc");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [filterOpen, setFilterOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState({
    status: "all",
    orientation: "all",
    source: "all",
    opportunity: "all",
    from: "",
    to: "",
  });
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 0,
  });
  const [createOpen, setCreateOpen] = useState(false);
  const [addChoiceOpen, setAddChoiceOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [selected, setSelected] = useState<Brief | null>(null);
  const [draft, setDraft] = useState<Brief | null>(null);
  const [saving, setSaving] = useState(false);
  const [generatingPrompt, setGeneratingPrompt] = useState(false);
  const [creating, setCreating] = useState(false);
  const [manualSaving, setManualSaving] = useState(false);
  const [bulkCsv, setBulkCsv] = useState("");
  const [bulkFileName, setBulkFileName] = useState("");
  const [bulkPreview, setBulkPreview] = useState<BulkImportPreview | null>(
    null,
  );
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState("");
  const [opportunityId, setOpportunityId] = useState("");
  const [provider, setProvider] = useState<BriefProviderId>(
    defaultBriefProvider,
  );
  const [count, setCount] = useState(3);
  const [preset, setPreset] = useState(presets[0]);
  const [manualOpportunityId, setManualOpportunityId] = useState("none");
  const [manual, setManual] = useState<ManualBrief>(manualDefaults);
  const availableModels = useMemo(() => {
    const enabled = catalog.filter(
      (item) => item.enabled && item.supportedResolutions.length > 0,
    );
    if (mockMode) return enabled;
    return [
      ...enabled.filter((item) => !["mock", "imported"].includes(item.providerId)),
      ...enabled.filter((item) => ["mock", "imported"].includes(item.providerId)),
    ];
  }, [catalog, mockMode]);
  const [selectedBriefIds, setSelectedBriefIds] = useState<string[]>([]);
  const [bulkGenerateOpen, setBulkGenerateOpen] = useState(false);
  const [bulkCapabilityId, setBulkCapabilityId] = useState(
    availableModels[0]?.id ?? "",
  );
  const [bulkResolution, setBulkResolution] = useState(
    availableModels[0]?.supportedResolutions[0]?.id ?? "",
  );
  const [skipGenerated, setSkipGenerated] = useState(true);
  const [bulkGenerating, setBulkGenerating] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 });
  const [bulkNotice, setBulkNotice] = useState<{
    message: string;
    variant: ToastVariant;
  } | null>(null);

  const bulkCapability =
    availableModels.find((item) => item.id === bulkCapabilityId) ??
    availableModels[0];
  const bulkResolutionOption =
    bulkCapability?.supportedResolutions.find(
      (item) => item.id === bulkResolution,
    ) ?? bulkCapability?.supportedResolutions[0];
  const bulkTargets = briefs.filter(
    (brief) =>
      selectedBriefIds.includes(brief.id) &&
      (!skipGenerated || brief.successfulGenerationCount === 0),
  );
  const bulkCost = bulkCapability
    ? estimateGenerationCost(bulkCapability, bulkTargets.length)
    : null;
  const selectedBriefsOnPage = briefs.filter((brief) =>
    selectedBriefIds.includes(brief.id),
  ).length;
  const pageSelectionState =
    selectedBriefsOnPage === briefs.length && briefs.length > 0
      ? true
      : selectedBriefsOnPage > 0
        ? "indeterminate"
        : false;

  function toggleBriefPage(checked: boolean) {
    const pageIds = new Set(briefs.map((brief) => brief.id));
    setSelectedBriefIds((current) =>
      checked
        ? Array.from(new Set([...current, ...pageIds]))
        : current.filter((id) => !pageIds.has(id)),
    );
  }

  function chooseBulkModel(value: string) {
    setBulkCapabilityId(value);
    const capability = availableModels.find((item) => item.id === value);
    setBulkResolution(capability?.supportedResolutions[0]?.id ?? "");
  }

  function aspectForBrief(brief: Brief, capability: ModelCapability) {
    const choices =
      brief.orientation === "vertical"
        ? ["9:16", "3:4", "1:1"]
        : brief.orientation === "square"
          ? ["1:1"]
          : ["16:9", "4:3", "1:1"];
    return (
      choices.find((item) => capability.supportedAspectRatios.includes(item)) ??
      capability.supportedAspectRatios[0]
    );
  }

  async function generateSelectedBriefs() {
    if (!bulkCapability || !bulkResolutionOption || bulkTargets.length === 0)
      return;
    setBulkGenerating(true);
    setBulkNotice(null);
    setError("");
    const failures: string[] = [];
    setBulkProgress({ current: 0, total: bulkTargets.length });
    for (let index = 0; index < bulkTargets.length; index += 1) {
      const brief = bulkTargets[index];
      const aspectRatio = aspectForBrief(brief, bulkCapability);
      if (!aspectRatio) {
        failures.push(`${brief.name}: no compatible aspect ratio`);
        continue;
      }
      try {
        const response = await fetch("/api/generation", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            briefId: brief.id,
            capabilityId: bulkCapability.id,
            strategy: "custom",
            prompt: brief.generationPrompt,
            negativePrompt: bulkCapability.supportsNegativePrompt
              ? brief.negativePrompt
              : undefined,
            resolution: bulkResolutionOption.id,
            quality: bulkCapability.supportedQualityLevels[0],
            aspectRatio,
            candidates: 1,
            idempotencyKey: crypto.randomUUID(),
          }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Generation failed");
      } catch (caught) {
        failures.push(
          `${brief.name}: ${caught instanceof Error ? caught.message : "Generation failed"}`,
        );
      } finally {
        setBulkProgress({ current: index + 1, total: bulkTargets.length });
      }
    }
    setBulkGenerating(false);
    setBulkGenerateOpen(false);
    setSelectedBriefIds([]);
    setBulkNotice({
      variant: failures.length ? "warning" : "success",
      message: failures.length
        ? `${bulkTargets.length - failures.length} generated; ${failures.length} failed. ${failures.slice(0, 2).join(" · ")}`
        : `${bulkTargets.length} brief${bulkTargets.length === 1 ? "" : "s"} generated successfully and sent to Review.`,
    });
    await load();
  }

  useEffect(() => {
    const syncFromUrl = () => {
      const next = {
        status: readUrlFilter("status", "all"),
        orientation: readUrlFilter("orientation", "all"),
        source: readUrlFilter("source", "all"),
        opportunity: readUrlFilter("opportunity", "all"),
        from: readUrlFilter("from"),
        to: readUrlFilter("to"),
      };
      setQuery(readUrlFilter("q"));
      setSort(readUrlFilter("sort", "updated_desc"));
      setPage(Math.max(1, Number(readUrlFilter("page", "1")) || 1));
      setPageSize(Number(readUrlFilter("pageSize", "10")) || 10);
      setStatusFilter(next.status);
      setOrientationFilter(next.orientation);
      setSourceFilter(next.source);
      setOpportunityFilter(next.opportunity);
      setDateFrom(next.from);
      setDateTo(next.to);
      setDraftFilters(next);
    };
    syncFromUrl();
    window.addEventListener("popstate", syncFromUrl);
    window.addEventListener("thoock:urlchange", syncFromUrl);
    return () => {
      window.removeEventListener("popstate", syncFromUrl);
      window.removeEventListener("thoock:urlchange", syncFromUrl);
    };
  }, []);

  useEffect(() => {
    const syncCreateDialogFromUrl = () => {
      const isCreateDialog = readUrlFilter("dialog") === "create-ai";
      const requestedOpportunity = readUrlFilter("source-opportunity");
      setCreateOpen(isCreateDialog);
      if (isCreateDialog && requestedOpportunity)
        setOpportunityId(requestedOpportunity);
    };
    syncCreateDialogFromUrl();
    window.addEventListener("popstate", syncCreateDialogFromUrl);
    window.addEventListener("thoock:urlchange", syncCreateDialogFromUrl);
    return () => {
      window.removeEventListener("popstate", syncCreateDialogFromUrl);
      window.removeEventListener("thoock:urlchange", syncCreateDialogFromUrl);
    };
  }, []);

  function openAiBriefDialog(sourceOpportunityId = opportunityId) {
    if (sourceOpportunityId) setOpportunityId(sourceOpportunityId);
    setCreateOpen(true);
    pushUrlFilters({
      dialog: "create-ai",
      "source-opportunity": sourceOpportunityId || null,
    });
  }

  function closeAiBriefDialog() {
    setCreateOpen(false);
    replaceUrlFilters({ dialog: null, "source-opportunity": null });
  }

  function applyFilters() {
    setStatusFilter(draftFilters.status);
    setOrientationFilter(draftFilters.orientation);
    setSourceFilter(draftFilters.source);
    setOpportunityFilter(draftFilters.opportunity);
    setDateFrom(draftFilters.from);
    setDateTo(draftFilters.to);
    setPage(1);
    pushUrlFilters({ ...draftFilters, page: 1 });
    setFilterOpen(false);
  }

  function clearFilters() {
    const next = {
      status: "all",
      orientation: "all",
      source: "all",
      opportunity: "all",
      from: "",
      to: "",
    };
    setDraftFilters(next);
    setStatusFilter("all");
    setOrientationFilter("all");
    setSourceFilter("all");
    setOpportunityFilter("all");
    setDateFrom("");
    setDateTo("");
    setPage(1);
    pushUrlFilters({
      status: null,
      orientation: null,
      source: null,
      opportunity: null,
      from: null,
      to: null,
      page: 1,
    });
  }

  const activeFilters = [
    statusFilter !== "all"
      ? {
          key: "status",
          label: `Status: ${statusFilter}`,
          onRemove: () => {
            setStatusFilter("all");
            setDraftFilters((v) => ({ ...v, status: "all" }));
            pushUrlFilters({ status: null, page: 1 });
          },
        }
      : null,
    orientationFilter !== "all"
      ? {
          key: "orientation",
          label: `Orientation: ${orientationFilter}`,
          onRemove: () => {
            setOrientationFilter("all");
            setDraftFilters((v) => ({ ...v, orientation: "all" }));
            pushUrlFilters({ orientation: null, page: 1 });
          },
        }
      : null,
    sourceFilter !== "all"
      ? {
          key: "source",
          label: `Source: ${sourceFilter}`,
          onRemove: () => {
            setSourceFilter("all");
            setDraftFilters((v) => ({ ...v, source: "all" }));
            pushUrlFilters({ source: null, page: 1 });
          },
        }
      : null,
    opportunityFilter !== "all"
      ? {
          key: "opportunity",
          label: `Opportunity: ${
            opportunities.find((item) => item.id === opportunityFilter)
              ?.keyword ?? opportunityFilter
          }`,
          onRemove: () => {
            setOpportunityFilter("all");
            setDraftFilters((value) => ({
              ...value,
              opportunity: "all",
            }));
            pushUrlFilters({ opportunity: null, page: 1 });
          },
        }
      : null,
    dateFrom
      ? {
          key: "from",
          label: `Updated from ${dateFrom}`,
          onRemove: () => {
            setDateFrom("");
            setDraftFilters((v) => ({ ...v, from: "" }));
            pushUrlFilters({ from: null, page: 1 });
          },
        }
      : null,
    dateTo
      ? {
          key: "to",
          label: `Updated through ${dateTo}`,
          onRemove: () => {
            setDateTo("");
            setDraftFilters((v) => ({ ...v, to: "" }));
            pushUrlFilters({ to: null, page: 1 });
          },
        }
      : null,
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const briefParams = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        sort,
      });
      if (query.trim()) briefParams.set("q", query.trim());
      if (statusFilter !== "all") briefParams.set("status", statusFilter);
      if (orientationFilter !== "all")
        briefParams.set("orientation", orientationFilter);
      if (sourceFilter !== "all") briefParams.set("source", sourceFilter);
      if (opportunityFilter !== "all")
        briefParams.set("opportunity", opportunityFilter);
      if (dateFrom) briefParams.set("from", dateFrom);
      if (dateTo) briefParams.set("to", dateTo);
      const [briefResponse, opportunityResponse] = await Promise.all([
        fetch(`/api/briefs?${briefParams}`, { cache: "no-store" }),
        fetch("/api/opportunities?page=1&pageSize=200&sort=score_desc", {
          cache: "no-store",
        }),
      ]);
      const [briefPayload, opportunityPayload] = await Promise.all([
        briefResponse.json(),
        opportunityResponse.json(),
      ]);
      if (!briefResponse.ok)
        throw new Error(briefPayload.error ?? "Could not load briefs.");
      if (!opportunityResponse.ok)
        throw new Error(
          opportunityPayload.error ?? "Could not load opportunities.",
        );
      setBriefs((briefPayload.data as Brief[]).map(withMetadataPlanDefaults));
      setPagination(
        briefPayload.pagination ?? {
          page,
          pageSize,
          total: briefPayload.data.length,
          totalPages: briefPayload.data.length ? 1 : 0,
        },
      );
      setOpportunities(opportunityPayload.data);
      const requested = readUrlFilter("source-opportunity");
      const requestedExists = opportunityPayload.data.some(
        (item: Opportunity) => item.id === requested,
      );
      setOpportunityId((current) =>
        requestedExists
          ? requested
          : opportunityPayload.data.some(
                (item: Opportunity) => item.id === current,
              )
            ? current
            : (opportunityPayload.data[0]?.id ?? ""),
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not load briefs.",
      );
    } finally {
      setLoading(false);
    }
  }, [
    dateFrom,
    dateTo,
    orientationFilter,
    opportunityFilter,
    page,
    pageSize,
    query,
    sort,
    sourceFilter,
    statusFilter,
  ]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), query ? 250 : 0);
    return () => window.clearTimeout(timeout);
  }, [load, query]);

  async function createBriefs() {
    if (!opportunityId) return;
    setCreating(true);
    setError("");
    try {
      const response = await fetch("/api/briefs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          opportunityId,
          provider,
          count,
          preset: preset === presets[0] ? undefined : preset,
        }),
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error ?? "Could not create briefs.");
      closeAiBriefDialog();
      await load();
      toast({
        title: "Commercial briefs created",
        description: `${payload.data.length} distinct brief${payload.data.length === 1 ? " was" : "s were"} added.`,
        variant: "success",
      });
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not create briefs.",
      );
    } finally {
      setCreating(false);
    }
  }

  async function createManualBrief() {
    setManualSaving(true);
    setError("");
    try {
      const response = await fetch("/api/briefs/manual", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...manual,
          opportunityId:
            manualOpportunityId === "none" ? null : manualOpportunityId,
        }),
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error ?? "Could not save manual brief.");
      const created = withMetadataPlanDefaults(payload.data as Brief);
      setBriefs((current) => [created, ...current].slice(0, pageSize));
      setPagination((current) => ({
        ...current,
        total: current.total + 1,
        totalPages: Math.ceil((current.total + 1) / current.pageSize),
      }));
      setManualOpen(false);
      setManual(manualDefaults);
      setManualOpportunityId("none");
      openBrief(created);
      toast({
        title: "Commercial brief saved",
        description: `“${created.name}” is ready to edit.`,
        variant: "success",
      });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not save manual brief.",
      );
    } finally {
      setManualSaving(false);
    }
  }

  function resetBulkImport() {
    setBulkCsv("");
    setBulkFileName("");
    setBulkPreview(null);
    setBulkError("");
  }

  async function requestBulkPreview(csv: string, commit: boolean) {
    const response = await fetch("/api/briefs/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ csv, commit }),
    });
    const payload = await response.json();
    if (payload.data) setBulkPreview(payload.data as BulkImportPreview);
    if (!response.ok)
      throw new Error(payload.error ?? "Could not process the CSV file.");
    return payload;
  }

  async function validateBulkCsv(csv = bulkCsv) {
    if (!csv.trim()) {
      setBulkError("Choose a CSV file or paste CSV content first.");
      return;
    }
    setBulkBusy(true);
    setBulkError("");
    setBulkPreview(null);
    try {
      await requestBulkPreview(csv, false);
    } catch (caught) {
      setBulkError(
        caught instanceof Error ? caught.message : "Could not validate CSV.",
      );
    } finally {
      setBulkBusy(false);
    }
  }

  async function selectBulkFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 1_000_000) {
      setBulkError("CSV must be no larger than 1MB.");
      return;
    }
    const csv = await file.text();
    setBulkFileName(file.name);
    setBulkCsv(csv);
    await validateBulkCsv(csv);
  }

  async function importBulkBriefs() {
    if (!bulkPreview?.valid) return;
    setBulkBusy(true);
    setBulkError("");
    try {
      const payload = await requestBulkPreview(bulkCsv, true);
      const created = ((payload.data.briefs ?? []) as Brief[]).map(
        withMetadataPlanDefaults,
      );
      setBriefs((current) => [...created, ...current].slice(0, pageSize));
      setPagination((current) => ({
        ...current,
        total: current.total + created.length,
        totalPages: Math.ceil(
          (current.total + created.length) / current.pageSize,
        ),
      }));
      setBulkOpen(false);
      resetBulkImport();
      toast({
        title: "Brief CSV imported",
        description: `${created.length} brief${created.length === 1 ? " was" : "s were"} added.`,
        variant: "success",
      });
    } catch (caught) {
      setBulkError(
        caught instanceof Error ? caught.message : "Could not import briefs.",
      );
    } finally {
      setBulkBusy(false);
    }
  }

  function openBrief(brief: Brief) {
    const normalized = withMetadataPlanDefaults(brief);
    setSelected(normalized);
    setDraft(structuredClone(normalized));
  }

  async function saveBrief() {
    if (!draft) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/briefs/${draft.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft),
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error ?? "Could not save brief.");
      const updated = { ...draft, ...payload.data };
      setBriefs((current) =>
        current.map((item) => (item.id === draft.id ? updated : item)),
      );
      setSelected(updated);
      setDraft(updated);
      toast({
        title: "Brief changes saved",
        description: `“${updated.name}” was updated successfully.`,
        variant: "success",
      });
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not save brief.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function regeneratePrompt() {
    if (!draft) return;
    setGeneratingPrompt(true);
    setError("");
    try {
      const brief: CommercialPromptBrief = {
        ...draft,
        supportingSubjects: draft.supportingSubjects.join(", "),
        prohibitedElements: draft.prohibitedElements.join(", "),
      };
      const response = await fetch("/api/prompts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider: defaultPromptProvider, brief }),
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error ?? "Could not rewrite prompt.");
      setDraft((current) =>
        current
          ? {
              ...current,
              generationPrompt: payload.data.prompt,
              negativePrompt: payload.data.negativePrompt,
            }
          : current,
      );
      toast({
        title: "Prompt rewritten",
        description: "Review the editable prompt before image generation.",
        variant: "success",
      });
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not rewrite prompt.",
      );
    } finally {
      setGeneratingPrompt(false);
    }
  }

  function useInGeneration() {
    if (!draft) return;
    router.push(`/generation?brief=${encodeURIComponent(draft.id)}`);
  }

  const readyCount = useMemo(
    () => briefs.filter((brief) => brief.status === "ready").length,
    [briefs],
  );

  return (
    <>
      <PageHeader
        title="Commercial briefs"
        description="Shape researched opportunities into generation-ready directions."
        actions={
          <>
            <Button variant="outline" onClick={() => setBulkOpen(true)}>
              <Upload /> Import CSV
            </Button>
            <Button
              aria-label="Add brief"
              onClick={() => setAddChoiceOpen(true)}
            >
              <Plus /> Add brief
            </Button>
          </>
        }
      />

      <ToastFeedback
        message={error}
        title="Brief workflow needs attention"
        variant="error"
      />
      <ToastFeedback
        message={bulkNotice?.message}
        title="Bulk generation update"
        variant={bulkNotice?.variant ?? "success"}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <WorkspaceMetric label="Total briefs" value={String(pagination.total)} note="Matching this view" icon={BookOpenText} />
        <WorkspaceMetric label="Ready" value={String(readyCount)} note="On this page" icon={CheckCircle2} />
        <WorkspaceMetric
          label="Draft"
          value={String(briefs.filter((brief) => brief.status === "draft").length)}
          note="On this page"
          icon={FilePenLine}
        />
        <WorkspaceMetric
          label="Generated"
          value={String(
            briefs.filter((brief) => brief.successfulGenerationCount > 0).length
          )}
          note="On this page"
          icon={Sparkles}
        />
      </div>

      <section className="workspace-panel overflow-hidden">
        <div className="flex flex-col gap-3 border-b p-3 md:flex-row md:items-center">
          <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="w-full pl-9"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            onBlur={() => pushUrlFilters({ q: query || null, page: 1 })}
            placeholder="Filter briefs, subjects, or buyers"
            aria-label="Filter commercial briefs"
          />
          </div>
          <DateRangeToolbar
            from={dateFrom}
            to={dateTo}
            ariaLabel="Filter commercial briefs by updated date"
            onApply={(from, to) => {
              setDateFrom(from);
              setDateTo(to);
              setDraftFilters((value) => ({ ...value, from, to }));
              setPage(1);
              pushUrlFilters({ from: from || null, to: to || null, page: 1 });
            }}
          />
          <FilterButton
            count={urlFilterCount([
              statusFilter,
              orientationFilter,
              sourceFilter,
              opportunityFilter,
            ])}
            onClick={() => {
              setDraftFilters({
                status: statusFilter,
                orientation: orientationFilter,
                source: sourceFilter,
                opportunity: opportunityFilter,
                from: dateFrom,
                to: dateTo,
              });
              setFilterOpen(true);
            }}
          />
        </div>
        <ActiveFilterChips
          className="border-b bg-muted/10 px-3 py-2.5"
          filters={activeFilters}
          onClear={clearFilters}
        />
        <FilterDialog
        open={filterOpen}
        onOpenChange={setFilterOpen}
        title="Filter commercial briefs"
        onClear={() =>
          setDraftFilters({
            status: "all",
            orientation: "all",
            source: "all",
            opportunity: "all",
            from: "",
            to: "",
          })
        }
        onApply={applyFilters}
      >
        <FilterSection label="Status">
          <div className="flex flex-wrap gap-2">
            {[
              "all",
              "draft",
              "ready",
              "generating",
              "complete",
              "archived",
            ].map((value) => (
              <FilterChoice
                key={value}
                active={draftFilters.status === value}
                onClick={() =>
                  setDraftFilters((v) => ({ ...v, status: value }))
                }
              >
                {value === "all" ? "Any status" : value}
              </FilterChoice>
            ))}
          </div>
        </FilterSection>
        <FilterSection label="Orientation">
          <div className="flex flex-wrap gap-2">
            {["all", "horizontal", "square", "vertical"].map((value) => (
              <FilterChoice
                key={value}
                active={draftFilters.orientation === value}
                onClick={() =>
                  setDraftFilters((v) => ({ ...v, orientation: value }))
                }
              >
                {value === "all" ? "Any orientation" : value}
              </FilterChoice>
            ))}
          </div>
        </FilterSection>
        <FilterSection label="Source">
          <div className="flex flex-wrap gap-2">
            {[
              ["all", "Any source"],
              ["opportunity", "From opportunity"],
              ["manual", "Manual"],
            ].map(([value, label]) => (
              <FilterChoice
                key={value}
                active={draftFilters.source === value}
                onClick={() =>
                  setDraftFilters((v) => ({ ...v, source: value }))
                }
              >
                {label}
              </FilterChoice>
            ))}
          </div>
        </FilterSection>
        <FilterSection label="Source opportunity">
          <Select
            value={draftFilters.opportunity}
            onValueChange={(opportunity) =>
              setDraftFilters((value) => ({ ...value, opportunity }))
            }
          >
            <SelectTrigger aria-label="Filter by source opportunity">
              <SelectValue placeholder="Any opportunity" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any opportunity</SelectItem>
              {opportunities.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.keyword}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterSection>
        <FilterSection label="Created date">
          <div className="grid gap-3 sm:grid-cols-2">
            <DateFilterPicker
              id="brief-date-from"
              label="Updated from"
              value={draftFilters.from}
              max={draftFilters.to || undefined}
              ariaLabel="Briefs updated from"
              onChange={(value) =>
                setDraftFilters((v) => ({ ...v, from: value }))
              }
            />
            <DateFilterPicker
              id="brief-date-to"
              label="Updated through"
              value={draftFilters.to}
              min={draftFilters.from || undefined}
              ariaLabel="Briefs updated through"
              onChange={(value) =>
                setDraftFilters((v) => ({ ...v, to: value }))
              }
            />
          </div>
        </FilterSection>
        </FilterDialog>

        {loading ? (
        <div className="space-y-2 p-4">
          {[0, 1, 2].map((item) => (
            <Skeleton key={item} className="h-12 w-full" />
          ))}
        </div>
      ) : briefs.length === 0 ? (
        <div className="px-6 py-14 text-center">
          <span className="mx-auto grid size-11 place-items-center rounded-lg bg-primary/10 text-primary">
            <Layers3 className="size-5" />
          </span>
          <h2 className="mt-4 text-lg font-semibold">
            No commercial briefs yet
          </h2>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
            Research and save an opportunity first, then create a batch of
            distinct briefs for different buyer uses and compositions.
          </p>
          {opportunities.length ? (
            <Button className="mt-5" onClick={() => openAiBriefDialog()}>
              <Plus /> Create the first briefs
            </Button>
          ) : (
            <Button className="mt-5" asChild>
              <a href="/opportunities">Research opportunities</a>
            </Button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <Table className="workspace-table">
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <Checkbox
                    aria-label="Select all briefs on this page"
                    checked={pageSelectionState}
                    onCheckedChange={(value) =>
                      toggleBriefPage(value === true)
                    }
                  />
                </TableHead>
                <TableHead>
                  <button
                    type="button"
                    className="table-sort-trigger"
                    onClick={() => {
                      const next = sort === "name_asc" ? "name_desc" : "name_asc";
                      setSort(next);
                      setPage(1);
                      pushUrlFilters({ sort: next, page: 1 });
                    }}
                  >
                    Brief
                    {sort === "name_desc" ? <ArrowDown /> : <ArrowUp />}
                  </button>
                </TableHead>
                <TableHead>Opportunity</TableHead>
                <TableHead>Target market</TableHead>
                <TableHead>Orientation</TableHead>
                <TableHead>Adobe category</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>
                  <button
                    type="button"
                    className="table-sort-trigger"
                    onClick={() => {
                      const next =
                        sort === "updated_desc" ? "updated_asc" : "updated_desc";
                      setSort(next);
                      setPage(1);
                      pushUrlFilters({ sort: next, page: 1 });
                    }}
                  >
                    Updated
                    {sort === "updated_asc" ? <ArrowUp /> : <ArrowDown />}
                  </button>
                </TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {briefs.map((item) => (
                <TableRow
                  key={item.id}
                  className={
                    selectedBriefIds.includes(item.id)
                      ? "bg-emerald-50/60"
                      : undefined
                  }
                >
                  <TableCell>
                    <Checkbox
                      checked={selectedBriefIds.includes(item.id)}
                      onCheckedChange={(value) =>
                        setSelectedBriefIds((current) =>
                          value === true
                            ? Array.from(new Set([...current, item.id]))
                            : current.filter((id) => id !== item.id),
                        )
                      }
                      aria-label={`Select ${item.name} for generation`}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <span className="control-raised grid size-10 shrink-0 place-items-center rounded-lg border bg-muted">
                        <BookOpenText className="size-4 text-primary" />
                      </span>
                      <div>
                        <p className="font-medium">{item.name}</p>
                        <p className="max-w-60 truncate text-[10px] text-muted-foreground">
                          {item.mainSubject}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="max-w-44 truncate text-muted-foreground">
                    {item.opportunityKeyword ?? "Manual brief"}
                  </TableCell>
                  <TableCell>{item.targetMarket}</TableCell>
                  <TableCell className="capitalize">
                    {item.orientation}
                  </TableCell>
                  <TableCell>
                    {ADOBE_STOCK_CATEGORIES.find(
                      (category) => category.code === item.metadataCategory,
                    )?.label ?? "Not planned"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        item.status === "ready" ? "success" : "secondary"
                      }
                    >
                      {item.successfulGenerationCount
                        ? "Generated"
                        : item.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatAppDateTime(item.updatedAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openBrief(item)}
                    >
                      Open <ArrowRight />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
        <TableBulkActionBar
          count={selectedBriefIds.length}
          itemLabel="brief"
          description="One generation job will be created for each selected brief."
          onClear={() => setSelectedBriefIds([])}
        >
          <Button
            aria-label={`Generate selected (${selectedBriefIds.length})`}
            onClick={() => setBulkGenerateOpen(true)}
          >
            <Play />
            Generate selected
          </Button>
        </TableBulkActionBar>
        {!loading && briefs.length > 0 && (
          <DataPagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            totalItems={pagination.total}
            pageSize={pagination.pageSize}
            itemLabel="briefs"
            disabled={loading}
            onPageChange={(value) => {
              setPage(value);
              pushUrlFilters({ page: value });
            }}
          />
        )}
      </section>

      <Dialog
        open={bulkGenerateOpen}
        onOpenChange={(open) => !bulkGenerating && setBulkGenerateOpen(open)}
      >
        <DialogContent className="max-w-lg p-0">
          <DialogHeader className="border-b px-5 pb-4 pt-5 pr-14">
            <DialogTitle>
              Generate images from {selectedBriefIds.length} briefs
            </DialogTitle>
            <DialogDescription>
              Create one independent generation job for each selected brief.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 px-5 py-5">
            <div className="grid grid-cols-[130px_1fr] items-center gap-3">
              <Label>Provider</Label>
              <Select
                value={bulkCapability?.id ?? ""}
                onValueChange={chooseBulkModel}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose provider" />
                </SelectTrigger>
                <SelectContent>
                  {availableModels.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.providerId}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-[130px_1fr] items-center gap-3">
              <Label>Model</Label>
              <Select
                value={bulkCapability?.id ?? ""}
                onValueChange={chooseBulkModel}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose model" />
                </SelectTrigger>
                <SelectContent>
                  {availableModels.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-[130px_1fr] items-center gap-3">
              <Label>Strategy</Label>
              <div className="grid grid-cols-3 gap-2">
                <Button type="button" variant="accent" size="sm">
                  Economical
                </Button>
                <Button type="button" variant="outline" size="sm">
                  Direct 4MP
                </Button>
                <Button type="button" variant="outline" size="sm">
                  Custom
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-[130px_1fr] items-center gap-3">
              <Label>Output handling</Label>
              <Select
                value={bulkResolutionOption?.id ?? ""}
                onValueChange={setBulkResolution}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Use each brief orientation" />
                </SelectTrigger>
                <SelectContent>
                  {bulkCapability?.supportedResolutions.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.label} · use each brief orientation
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-[130px_1fr] items-center gap-3">
              <Label>Candidates per brief</Label>
              <div className="flex w-fit overflow-hidden rounded-lg border">
                <Button
                  type="button"
                  variant="ghost"
                  className="rounded-none border-0"
                  disabled
                >
                  −
                </Button>
                <span className="grid w-12 place-items-center border-x text-sm">
                  1
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  className="rounded-none border-0"
                  disabled
                >
                  +
                </Button>
              </div>
            </div>
            <label className="flex cursor-pointer items-center justify-between gap-4 py-1">
              <span className="text-sm">
                Skip briefs that already have a successful generation
              </span>
              <Switch
                checked={skipGenerated}
                onCheckedChange={setSkipGenerated}
              />
            </label>
            <div className="control-inset grid grid-cols-3 divide-x rounded-xl border bg-muted/20 py-3">
              <BulkStat label="Images" value={String(bulkTargets.length)} />
              <BulkStat
                label="Estimated cost"
                value={
                  bulkCost === null ? "Unavailable" : `$${bulkCost.toFixed(4)}`
                }
              />
              <BulkStat
                label="Resolution"
                value={bulkResolutionOption?.label ?? "—"}
              />
            </div>
            {bulkCapability && bulkResolutionOption && (
              <Alert className="border-amber-500/30 bg-amber-50/70">
                <Sparkles />
                <AlertDescription>
                  Paid requests require confirmation. Failed paid jobs are never
                  retried automatically.
                </AlertDescription>
              </Alert>
            )}
            {bulkGenerating && (
              <div>
                <div className="mb-2 flex justify-between text-xs">
                  <span>Processing selected briefs</span>
                  <span>
                    {bulkProgress.current}/{bulkProgress.total}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-emerald-600 transition-[width]"
                    style={{
                      width: `${bulkProgress.total ? (bulkProgress.current / bulkProgress.total) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="mt-0 border-t px-5 py-4">
            <Button
              variant="outline"
              onClick={() => setBulkGenerateOpen(false)}
              disabled={bulkGenerating}
            >
              Cancel
            </Button>
            <Button
              aria-label={`Confirm ${bulkTargets.length} generation${bulkTargets.length === 1 ? "" : "s"}`}
              onClick={() => void generateSelectedBriefs()}
              disabled={
                bulkGenerating || !bulkCapability || !bulkTargets.length
              }
            >
              {bulkGenerating ? (
                <LoaderCircle className="animate-spin" />
              ) : null}
              {bulkGenerating
                ? "Generating…"
                : `Confirm and generate ${bulkTargets.length}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addChoiceOpen} onOpenChange={setAddChoiceOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Add commercial briefs</DialogTitle>
            <DialogDescription>
              Start one brief manually or create a distinct batch from a saved
              opportunity.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              className="surface-raised rounded-xl border bg-card p-5 text-left transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
              onClick={() => {
                setAddChoiceOpen(false);
                setManualOpen(true);
              }}
            >
              <span className="control-raised grid size-11 place-items-center rounded-xl border bg-emerald-50 text-primary dark:bg-emerald-950/40">
                <FilePenLine className="size-5" />
              </span>
              <span className="mt-4 block font-semibold">Add manually</span>
              <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                Enter the buyer, visual direction, metadata plan, and prompt
                yourself.
              </span>
            </button>
            <button
              type="button"
              className="surface-raised rounded-xl border bg-card p-5 text-left transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!opportunities.length}
              onClick={() => {
                setAddChoiceOpen(false);
                openAiBriefDialog();
              }}
            >
              <span className="control-raised grid size-11 place-items-center rounded-xl border bg-emerald-50 text-primary dark:bg-emerald-950/40">
                <Sparkles className="size-5" />
              </span>
              <span className="mt-4 block font-semibold">Create with AI</span>
              <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                Select a researched opportunity and generate several
                commercially distinct briefs.
              </span>
            </button>
          </div>
          {!opportunities.length && (
            <p className="text-xs text-amber-700 dark:text-amber-300">
              Create or import an opportunity before using AI brief creation.
            </p>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          if (!open) closeAiBriefDialog();
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Create a batch of commercial briefs</DialogTitle>
            <DialogDescription>
              The AI creates distinct concepts—not small variations—under one
              researched opportunity. Every brief and prompt remains editable.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-5">
            <Field label="Source opportunity">
              <Select value={opportunityId} onValueChange={setOpportunityId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose an opportunity" />
                </SelectTrigger>
                <SelectContent>
                  {opportunities.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.keyword} ·{" "}
                      {Math.round(Number(item.opportunityScore))}/100
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Brief writer">
                <Select
                  value={provider}
                  onValueChange={(value: BriefProviderId) => setProvider(value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mock-brief-ai">
                      Deterministic mock (free)
                    </SelectItem>
                    <SelectItem value="gemini-brief-ai">Gemini AI</SelectItem>
                    <SelectItem value="openai-brief-ai">OpenAI</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Number of distinct briefs">
                <Input
                  type="number"
                  min={1}
                  max={12}
                  value={count}
                  onChange={(event) => setCount(Number(event.target.value))}
                />
              </Field>
            </div>
            <Field label="Creative preset">
              <Select value={preset} onValueChange={setPreset}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {presets.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Alert>
              <WandSparkles />
              <AlertTitle>AI output is a research draft</AlertTitle>
              <AlertDescription>
                Review commercial usefulness, factual implications,
                representation, and intellectual-property risks before
                generation.
              </AlertDescription>
            </Alert>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeAiBriefDialog}>
              Cancel
            </Button>
            <Button
              onClick={createBriefs}
              disabled={!opportunityId || creating}
            >
              {creating ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Sparkles />
              )}
              {creating ? "Creating briefs…" : `Create ${count} briefs`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={bulkOpen}
        onOpenChange={(open) => {
          setBulkOpen(open);
          if (!open) resetBulkImport();
        }}
      >
        <DialogContent className="max-w-5xl overflow-hidden p-0">
          <DialogHeader className="border-b px-6 pb-5 pt-6 pr-14">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary">
                <FileSpreadsheet className="size-5" />
              </span>
              <div>
                <DialogTitle>Import commercial briefs from CSV</DialogTitle>
                <DialogDescription className="mt-1">
                  Bring structured brief ideas from your chat agent into the
                  same editable workflow as manually created briefs.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="max-h-[65dvh] space-y-5 overflow-y-auto px-6 py-5">
            <Alert>
              <FileSpreadsheet />
              <AlertTitle>Validate before anything is saved</AlertTitle>
              <AlertDescription>
                Keep <code>name</code> and <code>main_subject</code> in every
                row. Separate list values with <code>|</code>. Source
                opportunity names are optional and matched case-insensitively.
                Blank prompt fields receive the same free deterministic prompt
                as manual briefs. Add <code>metadata_title</code>,{" "}
                <code>adobe_category</code>, and at least five pipe-separated{" "}
                <code>metadata_keywords</code> to carry your chat-agent metadata
                through approval.
              </AlertDescription>
            </Alert>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/20 p-4">
              <div>
                <p className="text-sm font-medium">
                  Start from the exact headers
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Maximum 200 rows and 1MB per import. Default candidate count
                  is 1.
                </p>
              </div>
              <Button variant="outline" asChild>
                <a href="/api/briefs/import" download>
                  <Download /> Download template
                </a>
              </Button>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div className="grid content-start gap-2">
                <Label htmlFor="brief-csv-file">Upload CSV file</Label>
                <Input
                  id="brief-csv-file"
                  type="file"
                  accept=".csv,text/csv"
                  disabled={bulkBusy}
                  onChange={(event) =>
                    void selectBulkFile(event.target.files?.[0])
                  }
                />
                <p className="text-[11px] text-muted-foreground">
                  {bulkFileName ||
                    "UTF-8 CSV; quoted commas and multiline values are supported."}
                </p>
              </div>
              <div className="grid content-start gap-2">
                <Label htmlFor="brief-csv-content">Or paste CSV content</Label>
                <Textarea
                  id="brief-csv-content"
                  className="min-h-32 font-mono text-xs"
                  value={bulkCsv}
                  disabled={bulkBusy}
                  placeholder="name,main_subject,orientation&#10;Useful home office,Professional organizing a calm desk,horizontal"
                  onChange={(event) => {
                    setBulkCsv(event.target.value);
                    setBulkFileName("");
                    setBulkPreview(null);
                  }}
                />
              </div>
            </div>

            {bulkError && (
              <Alert className="border-destructive/40">
                <AlertTitle>CSV needs attention</AlertTitle>
                <AlertDescription>{bulkError}</AlertDescription>
              </Alert>
            )}

            {bulkPreview && (
              <section className="overflow-hidden rounded-lg border">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/20 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">Import preview</p>
                    <p className="text-xs text-muted-foreground">
                      {bulkPreview.rowCount} brief
                      {bulkPreview.rowCount === 1 ? "" : "s"} parsed
                    </p>
                  </div>
                  <Badge
                    variant={bulkPreview.valid ? "success" : "destructive"}
                  >
                    {bulkPreview.valid ? (
                      <>
                        <CheckCircle2 /> Ready to import
                      </>
                    ) : (
                      `${bulkPreview.errors.length} validation error${bulkPreview.errors.length === 1 ? "" : "s"}`
                    )}
                  </Badge>
                </div>
                {bulkPreview.errors.length > 0 ? (
                  <div className="space-y-2 p-4">
                    {bulkPreview.errors.slice(0, 20).map((issue, index) => (
                      <div
                        key={`${issue.row}-${issue.field}-${index}`}
                        className="grid gap-1 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs sm:grid-cols-[7rem_10rem_1fr]"
                      >
                        <span className="font-medium">
                          {issue.row ? `Row ${issue.row}` : "CSV"}
                        </span>
                        <code>{issue.field}</code>
                        <span className="text-muted-foreground">
                          {issue.message}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="max-h-72 overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Row</TableHead>
                          <TableHead>Brief</TableHead>
                          <TableHead>Market</TableHead>
                          <TableHead>Format</TableHead>
                          <TableHead>Adobe category</TableHead>
                          <TableHead>Source</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {bulkPreview.rows.slice(0, 20).map((row) => (
                          <TableRow key={row.row}>
                            <TableCell className="font-mono">
                              {row.row}
                            </TableCell>
                            <TableCell>
                              <p className="max-w-72 font-medium">{row.name}</p>
                              <p className="mt-1 line-clamp-1 max-w-72 text-xs text-muted-foreground">
                                {row.mainSubject}
                              </p>
                            </TableCell>
                            <TableCell>{row.targetMarket}</TableCell>
                            <TableCell>
                              {row.orientation} · {row.candidateCount}
                            </TableCell>
                            <TableCell>
                              {row.metadataCategory || "Not planned"}
                            </TableCell>
                            <TableCell>
                              {row.opportunityKeyword ?? "Manual"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </section>
            )}
          </div>
          <DialogFooter className="mt-0 border-t bg-muted/20 px-6 py-4">
            <Button
              variant="outline"
              onClick={() => setBulkOpen(false)}
              disabled={bulkBusy}
            >
              Cancel
            </Button>
            <Button
              variant="outline"
              onClick={() => void validateBulkCsv()}
              disabled={bulkBusy || !bulkCsv.trim()}
            >
              {bulkBusy ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <FileSpreadsheet />
              )}
              Validate CSV
            </Button>
            <Button
              onClick={importBulkBriefs}
              disabled={bulkBusy || !bulkPreview?.valid}
            >
              {bulkBusy ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Upload />
              )}
              {bulkBusy
                ? "Importing…"
                : `Import ${bulkPreview?.rowCount ?? 0} brief${bulkPreview?.rowCount === 1 ? "" : "s"}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent className="max-w-5xl overflow-hidden p-0">
          <DialogHeader className="border-b px-6 pb-5 pt-6 pr-14">
            <DialogTitle>Add a commercial brief manually</DialogTitle>
            <DialogDescription>
              Enter the commercial direction yourself. If the prompt is blank,
              Thoock creates a deterministic starter prompt that you can edit.
            </DialogDescription>
          </DialogHeader>
          <Tabs defaultValue="direction">
            <div className="border-b px-6 py-3">
              <TabsList>
                <TabsTrigger value="direction">
                  Commercial direction
                </TabsTrigger>
                <TabsTrigger value="prompt">Prompt</TabsTrigger>
                <TabsTrigger value="metadata">Adobe metadata</TabsTrigger>
              </TabsList>
            </div>
            <div className="max-h-[58dvh] overflow-y-auto px-6 py-5">
              <TabsContent value="direction" className="mt-0">
                <div className="grid gap-5 md:grid-cols-2">
                  <Field label="Source opportunity" helper="Optional">
                    <Select
                      value={manualOpportunityId}
                      onValueChange={(value) => {
                        setManualOpportunityId(value);
                        const opportunity = opportunities.find(
                          (item) => item.id === value,
                        );
                        if (opportunity)
                          setManual((current) => ({
                            ...current,
                            targetMarket: opportunity.targetRegion,
                          }));
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">
                          No source opportunity
                        </SelectItem>
                        {opportunities.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.keyword}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <TextField
                    label="Brief name"
                    helper="Required · 2 characters minimum"
                    value={manual.name}
                    onChange={(value) => setManual({ ...manual, name: value })}
                  />
                  <AreaField
                    label="Target buyer"
                    value={manual.targetBuyer}
                    onChange={(value) =>
                      setManual({ ...manual, targetBuyer: value })
                    }
                  />
                  <AreaField
                    label="Intended commercial usage"
                    value={manual.intendedUsage}
                    onChange={(value) =>
                      setManual({ ...manual, intendedUsage: value })
                    }
                  />
                  <TextField
                    label="Target market"
                    value={manual.targetMarket}
                    onChange={(value) =>
                      setManual({ ...manual, targetMarket: value })
                    }
                  />
                  <AreaField
                    label="Main subject"
                    helper="Required · 2 characters minimum"
                    value={manual.mainSubject}
                    onChange={(value) =>
                      setManual({ ...manual, mainSubject: value })
                    }
                  />
                  <AreaField
                    label="Supporting subjects"
                    helper="Separate items with commas"
                    value={manual.supportingSubjects.join(", ")}
                    onChange={(value) =>
                      setManual({
                        ...manual,
                        supportingSubjects: splitList(value),
                      })
                    }
                  />
                  <TextField
                    label="Environment"
                    value={manual.environment}
                    onChange={(value) =>
                      setManual({ ...manual, environment: value })
                    }
                  />
                  <TextField
                    label="Visual style"
                    value={manual.visualStyle}
                    onChange={(value) =>
                      setManual({ ...manual, visualStyle: value })
                    }
                  />
                  <Field label="Orientation">
                    <Select
                      value={manual.orientation}
                      onValueChange={(value) =>
                        setManual({ ...manual, orientation: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="horizontal">Horizontal</SelectItem>
                        <SelectItem value="square">Square</SelectItem>
                        <SelectItem value="vertical">Vertical</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <AreaField
                    label="Composition"
                    value={manual.composition}
                    onChange={(value) =>
                      setManual({ ...manual, composition: value })
                    }
                  />
                  <TextField
                    label="Copy-space location"
                    value={manual.copySpaceLocation}
                    onChange={(value) =>
                      setManual({ ...manual, copySpaceLocation: value })
                    }
                  />
                  <TextField
                    label="Lighting"
                    value={manual.lighting}
                    onChange={(value) =>
                      setManual({ ...manual, lighting: value })
                    }
                  />
                  <TextField
                    label="Mood"
                    value={manual.mood}
                    onChange={(value) => setManual({ ...manual, mood: value })}
                  />
                  <AreaField
                    label="Representation notes"
                    value={manual.representationNotes}
                    onChange={(value) =>
                      setManual({ ...manual, representationNotes: value })
                    }
                  />
                  <AreaField
                    label="Prohibited elements"
                    helper="Separate items with commas"
                    value={manual.prohibitedElements.join(", ")}
                    onChange={(value) =>
                      setManual({
                        ...manual,
                        prohibitedElements: splitList(value),
                      })
                    }
                  />
                  <Field label="Candidate count">
                    <Input
                      type="number"
                      min={1}
                      max={6}
                      value={manual.candidateCount}
                      onChange={(event) =>
                        setManual({
                          ...manual,
                          candidateCount: Number(event.target.value),
                        })
                      }
                    />
                  </Field>
                </div>
              </TabsContent>
              <TabsContent value="prompt" className="mt-0 space-y-5">
                <Alert>
                  <FilePenLine />
                  <AlertTitle>Prompt is optional at this step</AlertTitle>
                  <AlertDescription>
                    Leave it blank for a deterministic starter based on the
                    structured fields. No paid AI request is made.
                  </AlertDescription>
                </Alert>
                <Field label="Generation prompt">
                  <Textarea
                    className="min-h-48"
                    value={manual.generationPrompt}
                    onChange={(event) =>
                      setManual({
                        ...manual,
                        generationPrompt: event.target.value,
                      })
                    }
                    placeholder="Optional custom prompt"
                  />
                </Field>
                <Field label="Negative prompt">
                  <Textarea
                    className="min-h-28"
                    value={manual.negativePrompt}
                    onChange={(event) =>
                      setManual({
                        ...manual,
                        negativePrompt: event.target.value,
                      })
                    }
                    placeholder="Optional custom negative prompt"
                  />
                </Field>
              </TabsContent>
              <TabsContent value="metadata" className="mt-0 space-y-5">
                <Alert>
                  <FilePenLine />
                  <AlertTitle>Plan metadata before generating</AlertTitle>
                  <AlertDescription>
                    Paste the title, category, and relevance-ordered keywords
                    from your chat agent. Approved images inherit this plan
                    without an AI API call.
                  </AlertDescription>
                </Alert>
                <MetadataPlanFields
                  value={manual}
                  onChange={(changes) => setManual({ ...manual, ...changes })}
                />
              </TabsContent>
            </div>
          </Tabs>
          <DialogFooter className="mt-0 border-t bg-muted/20 px-6 py-4">
            <Button variant="outline" onClick={() => setManualOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={createManualBrief}
              disabled={
                manualSaving ||
                manual.name.trim().length < 2 ||
                manual.mainSubject.trim().length < 2
              }
            >
              {manualSaving ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Plus />
              )}
              {manualSaving ? "Saving…" : "Save manual brief"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(selected && draft)}
        onOpenChange={(open) => {
          if (!open) {
            setSelected(null);
            setDraft(null);
          }
        }}
      >
        <DialogContent className="max-w-5xl overflow-hidden p-0">
          {draft && (
            <>
              <DialogHeader className="border-b px-6 pb-5 pt-6 pr-14">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant={draft.status === "ready" ? "success" : "secondary"}
                  >
                    {draft.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {draft.opportunityKeyword ?? "Manual brief"}
                  </span>
                </div>
                <DialogTitle className="mt-2 text-xl">{draft.name}</DialogTitle>
                <DialogDescription>
                  Inspect the commercial direction and prompt together. Changes
                  are saved to the database, not only this browser.
                </DialogDescription>
              </DialogHeader>
              <Tabs defaultValue="direction" className="min-h-0">
                <div className="border-b px-6 py-3">
                  <TabsList>
                    <TabsTrigger value="direction">
                      Commercial direction
                    </TabsTrigger>
                    <TabsTrigger value="prompt">Generation prompt</TabsTrigger>
                    <TabsTrigger value="metadata">Adobe metadata</TabsTrigger>
                  </TabsList>
                </div>
                <div className="max-h-[57dvh] overflow-y-auto px-6 py-5">
                  <TabsContent value="direction" className="mt-0">
                    <div className="grid gap-5 md:grid-cols-2">
                      <TextField
                        label="Brief name"
                        value={draft.name}
                        onChange={(value) =>
                          setDraft({ ...draft, name: value })
                        }
                      />
                      <TextField
                        label="Target market"
                        value={draft.targetMarket}
                        onChange={(value) =>
                          setDraft({ ...draft, targetMarket: value })
                        }
                      />
                      <AreaField
                        label="Target buyer"
                        value={draft.targetBuyer}
                        onChange={(value) =>
                          setDraft({ ...draft, targetBuyer: value })
                        }
                      />
                      <AreaField
                        label="Intended usage"
                        value={draft.intendedUsage}
                        onChange={(value) =>
                          setDraft({ ...draft, intendedUsage: value })
                        }
                      />
                      <AreaField
                        label="Main subject"
                        value={draft.mainSubject}
                        onChange={(value) =>
                          setDraft({ ...draft, mainSubject: value })
                        }
                      />
                      <AreaField
                        label="Supporting subjects"
                        helper="Separate items with commas"
                        value={draft.supportingSubjects.join(", ")}
                        onChange={(value) =>
                          setDraft({
                            ...draft,
                            supportingSubjects: splitList(value),
                          })
                        }
                      />
                      <TextField
                        label="Environment"
                        value={draft.environment}
                        onChange={(value) =>
                          setDraft({ ...draft, environment: value })
                        }
                      />
                      <TextField
                        label="Visual style"
                        value={draft.visualStyle}
                        onChange={(value) =>
                          setDraft({ ...draft, visualStyle: value })
                        }
                      />
                      <Field label="Orientation">
                        <Select
                          value={draft.orientation}
                          onValueChange={(value) =>
                            setDraft({ ...draft, orientation: value })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="horizontal">
                              Horizontal
                            </SelectItem>
                            <SelectItem value="square">Square</SelectItem>
                            <SelectItem value="vertical">Vertical</SelectItem>
                          </SelectContent>
                        </Select>
                      </Field>
                      <TextField
                        label="Copy-space location"
                        value={draft.copySpaceLocation}
                        onChange={(value) =>
                          setDraft({ ...draft, copySpaceLocation: value })
                        }
                      />
                      <AreaField
                        label="Composition"
                        value={draft.composition}
                        onChange={(value) =>
                          setDraft({ ...draft, composition: value })
                        }
                      />
                      <AreaField
                        label="Lighting"
                        value={draft.lighting}
                        onChange={(value) =>
                          setDraft({ ...draft, lighting: value })
                        }
                      />
                      <TextField
                        label="Mood"
                        value={draft.mood}
                        onChange={(value) =>
                          setDraft({ ...draft, mood: value })
                        }
                      />
                      <AreaField
                        label="Representation notes"
                        value={draft.representationNotes}
                        onChange={(value) =>
                          setDraft({ ...draft, representationNotes: value })
                        }
                      />
                      <AreaField
                        label="Prohibited elements"
                        helper="Separate items with commas"
                        value={draft.prohibitedElements.join(", ")}
                        onChange={(value) =>
                          setDraft({
                            ...draft,
                            prohibitedElements: splitList(value),
                          })
                        }
                      />
                      <Field label="Candidate count">
                        <Input
                          type="number"
                          min={1}
                          max={6}
                          value={draft.candidateCount}
                          onChange={(event) =>
                            setDraft({
                              ...draft,
                              candidateCount: Number(event.target.value),
                            })
                          }
                        />
                      </Field>
                    </div>
                  </TabsContent>
                  <TabsContent value="prompt" className="mt-0 space-y-5">
                    <Alert>
                      <FilePenLine />
                      <AlertTitle>Editable production prompt</AlertTitle>
                      <AlertDescription>
                        The brief remains the source of truth. Rewrite this
                        prompt when the visible concept or composition changes.
                      </AlertDescription>
                    </Alert>
                    <Field label="Generation prompt">
                      <Textarea
                        className="min-h-48"
                        value={draft.generationPrompt}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            generationPrompt: event.target.value,
                          })
                        }
                      />
                    </Field>
                    <Field label="Negative prompt">
                      <Textarea
                        className="min-h-28"
                        value={draft.negativePrompt}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            negativePrompt: event.target.value,
                          })
                        }
                      />
                    </Field>
                    <Button
                      variant="outline"
                      onClick={regeneratePrompt}
                      disabled={generatingPrompt}
                    >
                      {generatingPrompt ? (
                        <LoaderCircle className="animate-spin" />
                      ) : (
                        <WandSparkles />
                      )}
                      Rewrite from brief
                    </Button>
                  </TabsContent>
                  <TabsContent value="metadata" className="mt-0 space-y-5">
                    <Alert>
                      <FilePenLine />
                      <AlertTitle>Reusable metadata plan</AlertTitle>
                      <AlertDescription>
                        This plan follows every image generated from the brief.
                        The final filename remains unique to each approved
                        asset, and all values stay editable in review.
                      </AlertDescription>
                    </Alert>
                    <MetadataPlanFields
                      value={draft}
                      onChange={(changes) => setDraft({ ...draft, ...changes })}
                    />
                  </TabsContent>
                </div>
              </Tabs>
              <DialogFooter className="mt-0 border-t bg-muted/20 px-6 py-4">
                <Button variant="outline" onClick={saveBrief} disabled={saving}>
                  {saving ? (
                    <LoaderCircle className="animate-spin" />
                  ) : (
                    <FilePenLine />
                  )}
                  {saving ? "Saving…" : "Save changes"}
                </Button>
                <Button
                  onClick={useInGeneration}
                  disabled={!draft.generationPrompt.trim()}
                >
                  Use in generation <ArrowRight />
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function splitList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function withMetadataPlanDefaults(brief: Brief): Brief {
  return {
    ...brief,
    metadataTitle: brief.metadataTitle ?? "",
    metadataCategory: brief.metadataCategory ?? "",
    metadataLanguage: brief.metadataLanguage ?? "en",
    metadataKeywords: brief.metadataKeywords ?? [],
    metadataFictionalPeopleProperty:
      brief.metadataFictionalPeopleProperty ?? false,
    metadataNotes: brief.metadataNotes ?? "",
    successfulGenerationCount: brief.successfulGenerationCount ?? 0,
  };
}

type MetadataPlan = Pick<
  Brief,
  | "metadataTitle"
  | "metadataCategory"
  | "metadataLanguage"
  | "metadataKeywords"
  | "metadataFictionalPeopleProperty"
  | "metadataNotes"
>;

function hasMetadataPlan(value: MetadataPlan) {
  return Boolean(
    value.metadataTitle?.trim() &&
    value.metadataCategory &&
    (value.metadataKeywords?.length ?? 0) >= 5,
  );
}

function MetadataPlanFields({
  value,
  onChange,
}: {
  value: MetadataPlan;
  onChange: (changes: Partial<MetadataPlan>) => void;
}) {
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <Field
        label={`Adobe title · ${value.metadataTitle.length}/70`}
        helper="Describe the visible image accurately; do not mention generative AI."
      >
        <Input
          value={value.metadataTitle}
          maxLength={70}
          aria-label="Adobe metadata title"
          placeholder="Commercially useful, accurate image title"
          onChange={(event) => onChange({ metadataTitle: event.target.value })}
        />
      </Field>
      <Field label="Adobe Stock category">
        <Select
          value={value.metadataCategory}
          onValueChange={(metadataCategory) => onChange({ metadataCategory })}
        >
          <SelectTrigger aria-label="Adobe Stock category">
            <SelectValue placeholder="Select the closest category" />
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
      <div className="md:col-span-2">
        <Field
          label={`Ordered keywords · ${value.metadataKeywords.length}/50`}
          helper="Comma-separated, most commercially relevant first. Thoock removes duplicate and filler words when saved."
        >
          <Textarea
            className="min-h-32"
            aria-label="Ordered Adobe metadata keywords"
            value={value.metadataKeywords.join(", ")}
            placeholder="business, professional, workspace, productivity, office"
            onChange={(event) =>
              onChange({ metadataKeywords: splitList(event.target.value) })
            }
          />
        </Field>
      </div>
      <Field label="Metadata language">
        <Input
          value={value.metadataLanguage}
          maxLength={10}
          aria-label="Adobe metadata language"
          placeholder="en"
          onChange={(event) =>
            onChange({ metadataLanguage: event.target.value })
          }
        />
      </Field>
      <div className="flex items-start gap-3 rounded-lg border bg-muted/20 p-4">
        <Checkbox
          checked={value.metadataFictionalPeopleProperty}
          onCheckedChange={(checked) =>
            onChange({ metadataFictionalPeopleProperty: checked === true })
          }
          aria-label="Fictional people or property"
        />
        <div>
          <p className="text-sm font-medium">Fictional people/property</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Carry this indicator into the final metadata, then confirm it
            manually in Adobe Contributor Portal.
          </p>
        </div>
      </div>
      <div className="md:col-span-2">
        <Field
          label="Metadata notes"
          helper="Internal only; not exported as the Adobe title or keywords."
        >
          <Textarea
            value={value.metadataNotes}
            onChange={(event) =>
              onChange({ metadataNotes: event.target.value })
            }
          />
        </Field>
      </div>
      {!hasMetadataPlan(value) && (
        <Alert className="md:col-span-2">
          <AlertTitle>Metadata plan is incomplete</AlertTitle>
          <AlertDescription>
            Add a title, category, and at least five ordered keywords before
            approving an image from this brief.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

function Field({
  label,
  helper,
  children,
}: {
  label: string;
  helper?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid content-start gap-2">
      <Label>{label}</Label>
      {children}
      {helper && <p className="text-[11px] text-muted-foreground">{helper}</p>}
    </div>
  );
}

function TextField({
  label,
  helper,
  value,
  onChange,
}: {
  label: string;
  helper?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label} helper={helper}>
      <Input value={value} onChange={(event) => onChange(event.target.value)} />
    </Field>
  );
}

function AreaField({
  label,
  helper,
  value,
  onChange,
}: {
  label: string;
  helper?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label} helper={helper}>
      <Textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}

function BulkStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-sm font-semibold tabular-nums">
        {value}
      </p>
    </div>
  );
}
