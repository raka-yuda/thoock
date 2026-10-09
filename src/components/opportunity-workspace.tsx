"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Download,
  FileSpreadsheet,
  FilePlus2,
  LoaderCircle,
  MoreVertical,
  Plus,
  Search,
  Sparkles,
  Upload,
} from "lucide-react";
import type { ResearchProviderId } from "@/lib/runtime-config";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import {
  calculateOpportunityScore,
  explainOpportunityScore,
  type OpportunityInput,
} from "@/lib/domain/opportunity";
import { formatAppDateTime } from "@/lib/format/date";
import { formatNumber } from "@/lib/utils";
import { PageHeader } from "./page-header";
import { Metric } from "./metric";
import { DataPagination } from "./data-pagination";
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
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
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
import { Textarea } from "./ui/textarea";
import { Calendar } from "./ui/calendar";
import { Card } from "./ui/card";
import { InfoTooltip } from "./info-help";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "./ui/popover";
import { toast, ToastFeedback } from "./ui/toaster";

type Opportunity = {
  id: string;
  keyword: string;
  targetRegion: string;
  type: "evergreen" | "seasonal" | "trending";
  targetEventDate: string | null;
  adobeResultCount: number;
  trendGrowth: string;
  commercialIntent: string;
  seasonality: string;
  portfolioPerformance: string;
  opportunityScore: string;
  scoreExplanation: string;
  status: "researching" | "shortlisted" | "briefed" | "archived";
  createdAt?: string;
};

type OpportunitySummary = {
  total: number;
  researching: number;
  shortlisted: number;
  briefed: number;
  weekly: {
    total: number;
    researching: number;
    shortlisted: number;
    briefed: number;
  };
};

const emptySummary: OpportunitySummary = {
  total: 0,
  researching: 0,
  shortlisted: 0,
  briefed: 0,
  weekly: { total: 0, researching: 0, shortlisted: 0, briefed: 0 },
};

type ResearchImportPreview = {
  valid: boolean;
  rowCount: number;
  rows: Array<{
    row: number;
    keyword: string;
    targetRegion: string;
    type: Opportunity["type"];
    targetEventDate: string | null;
    competitionEstimate: number;
    trendGrowth: number;
    commercialIntent: number;
    seasonality: number;
    portfolioPerformance: number;
    score: number;
    researchNotes: string;
    buyerUseCases: string[];
    researchSources: string[];
  }>;
  errors: Array<{ row: number; field: string; message: string }>;
};

const manualDefaults: OpportunityInput = {
  keyword: "",
  targetRegion: "Indonesia",
  type: "evergreen",
  competition: 25_000,
  trendGrowth: 65,
  commercialIntent: 70,
  seasonality: 60,
  portfolioPerformance: 50,
};

function parseDateOnly(value: string) {
  if (!value) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day);
}

function formatDateOnly(value?: Date) {
  if (!value) return "";
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getSupplyLevel(count: number) {
  if (count < 25_000) return "lower" as const;
  if (count <= 100_000) return "moderate" as const;
  return "high" as const;
}

export function OpportunityWorkspace({
  defaultResearchProvider = "mock-research-ai",
}: {
  defaultResearchProvider?: ResearchProviderId;
}) {
  const [rows, setRows] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sort, setSort] = useState("score_desc");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [regionFilter, setRegionFilter] = useState("");
  const [minimumScore, setMinimumScore] = useState("");
  const [maximumScore, setMaximumScore] = useState("");
  const [competitionFilter, setCompetitionFilter] = useState("all");
  const [withoutBrief, setWithoutBrief] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [filterOpen, setFilterOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState({
    type: "all",
    status: "all",
    region: "",
    minScore: "",
    maxScore: "",
    competition: "all",
    withoutBrief: false,
    from: "",
    to: "",
  });
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 0,
  });
  const [summary, setSummary] = useState<OpportunitySummary>(emptySummary);
  const [createOpen, setCreateOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [toolbarDateRange, setToolbarDateRange] = useState<
    DateRange | undefined
  >();
  const [researchOpen, setResearchOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [researching, setResearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importCsv, setImportCsv] = useState("");
  const [importFileName, setImportFileName] = useState("");
  const [importPreview, setImportPreview] =
    useState<ResearchImportPreview | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState("");
  const [research, setResearch] = useState({
    provider: defaultResearchProvider,
    seedTopic: "",
    targetRegion: "Indonesia",
    type: "evergreen" as OpportunityInput["type"],
    count: 5,
    portfolioContext: "",
  });
  const [manual, setManual] = useState(manualDefaults);
  const manualScore = useMemo(
    () => calculateOpportunityScore(manual),
    [manual],
  );

  const dateLabel = useMemo(() => {
    const from = parseDateOnly(dateFrom);
    const to = parseDateOnly(dateTo);
    if (from && to) return `${format(from, "MMM d")} – ${format(to, "MMM d")}`;
    if (from) return `From ${format(from, "MMM d")}`;
    if (to) return `Through ${format(to, "MMM d")}`;
    return "Created date";
  }, [dateFrom, dateTo]);

  useEffect(() => {
    const syncFromUrl = () => {
      const next = {
        type: readUrlFilter("type", "all"),
        status: readUrlFilter("status", "all"),
        region: readUrlFilter("region"),
        minScore: readUrlFilter("minScore"),
        maxScore: readUrlFilter("maxScore"),
        competition: readUrlFilter("competition", "all"),
        withoutBrief: readUrlFilter("withoutBrief") === "true",
        from: readUrlFilter("from"),
        to: readUrlFilter("to"),
      };
      setQuery(readUrlFilter("q"));
      setSort(readUrlFilter("sort", "score_desc"));
      setPage(Math.max(1, Number(readUrlFilter("page", "1")) || 1));
      setPageSize(Number(readUrlFilter("pageSize", "10")) || 10);
      setTypeFilter(next.type);
      setStatusFilter(next.status);
      setRegionFilter(next.region);
      setMinimumScore(next.minScore);
      setMaximumScore(next.maxScore);
      setCompetitionFilter(next.competition);
      setWithoutBrief(next.withoutBrief);
      setDateFrom(next.from);
      setDateTo(next.to);
      setDraftFilters(next);
    };
    syncFromUrl();
    window.addEventListener("popstate", syncFromUrl);
    return () => window.removeEventListener("popstate", syncFromUrl);
  }, []);

  function applyFilters() {
    setTypeFilter(draftFilters.type);
    setStatusFilter(draftFilters.status);
    setRegionFilter(draftFilters.region);
    setMinimumScore(draftFilters.minScore);
    setMaximumScore(draftFilters.maxScore);
    setCompetitionFilter(draftFilters.competition);
    setWithoutBrief(draftFilters.withoutBrief);
    setDateFrom(draftFilters.from);
    setDateTo(draftFilters.to);
    setPage(1);
    pushUrlFilters({
      ...draftFilters,
      withoutBrief: draftFilters.withoutBrief ? "true" : null,
      page: 1,
    });
    setFilterOpen(false);
  }

  function clearFilters() {
    const next = {
      type: "all",
      status: "all",
      region: "",
      minScore: "",
      maxScore: "",
      competition: "all",
      withoutBrief: false,
      from: "",
      to: "",
    };
    setDraftFilters(next);
    setTypeFilter("all");
    setStatusFilter("all");
    setRegionFilter("");
    setMinimumScore("");
    setMaximumScore("");
    setCompetitionFilter("all");
    setWithoutBrief(false);
    setDateFrom("");
    setDateTo("");
    setPage(1);
    pushUrlFilters({
      type: null,
      status: null,
      region: null,
      minScore: null,
      maxScore: null,
      competition: null,
      withoutBrief: null,
      from: null,
      to: null,
      page: 1,
    });
  }

  const activeFilters = [
    typeFilter !== "all"
      ? {
          key: "type",
          label: typeFilter[0].toUpperCase() + typeFilter.slice(1),
          onRemove: () => {
            setTypeFilter("all");
            setDraftFilters((v) => ({ ...v, type: "all" }));
            pushUrlFilters({ type: null, page: 1 });
          },
        }
      : null,
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
    regionFilter
      ? {
          key: "region",
          label: regionFilter,
          onRemove: () => {
            setRegionFilter("");
            setDraftFilters((current) => ({ ...current, region: "" }));
            pushUrlFilters({ region: null, page: 1 });
          },
        }
      : null,
    minimumScore || maximumScore
      ? {
          key: "score",
          label: `Score ${minimumScore || "0"}–${maximumScore || "100"}`,
          onRemove: () => {
            setMinimumScore("");
            setMaximumScore("");
            setDraftFilters((current) => ({
              ...current,
              minScore: "",
              maxScore: "",
            }));
            pushUrlFilters({ minScore: null, maxScore: null, page: 1 });
          },
        }
      : null,
    competitionFilter !== "all"
      ? {
          key: "competition",
          label: `${competitionFilter} supply`,
          onRemove: () => {
            setCompetitionFilter("all");
            setDraftFilters((current) => ({
              ...current,
              competition: "all",
            }));
            pushUrlFilters({ competition: null, page: 1 });
          },
        }
      : null,
    withoutBrief
      ? {
          key: "withoutBrief",
          label: "Without briefs",
          onRemove: () => {
            setWithoutBrief(false);
            setDraftFilters((current) => ({
              ...current,
              withoutBrief: false,
            }));
            pushUrlFilters({ withoutBrief: null, page: 1 });
          },
        }
      : null,
    dateFrom || dateTo
      ? {
          key: "createdDate",
          label: dateLabel,
          onRemove: () => {
            setDateFrom("");
            setDateTo("");
            setDraftFilters((v) => ({ ...v, from: "", to: "" }));
            pushUrlFilters({ from: null, to: null, page: 1 });
          },
        }
      : null,
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        sort,
      });
      if (query.trim()) params.set("q", query.trim());
      if (typeFilter !== "all") params.set("type", typeFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (regionFilter) params.set("region", regionFilter);
      if (minimumScore) params.set("minScore", minimumScore);
      if (maximumScore) params.set("maxScore", maximumScore);
      if (competitionFilter !== "all")
        params.set("competition", competitionFilter);
      if (withoutBrief) params.set("withoutBrief", "true");
      if (dateFrom) params.set("from", dateFrom);
      if (dateTo) params.set("to", dateTo);
      const response = await fetch(`/api/opportunities?${params}`, {
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error ?? "Could not load opportunities.");
      setRows(payload.data);
      setSummary(
        payload.summary ?? {
          total: payload.pagination?.total ?? payload.data.length,
          researching: payload.data.filter(
            (row: Opportunity) => row.status === "researching",
          ).length,
          shortlisted: payload.data.filter(
            (row: Opportunity) => row.status === "shortlisted",
          ).length,
          briefed: payload.data.filter(
            (row: Opportunity) => row.status === "briefed",
          ).length,
          weekly: emptySummary.weekly,
        },
      );
      setPagination(
        payload.pagination ?? {
          page,
          pageSize,
          total: payload.data.length,
          totalPages: payload.data.length ? 1 : 0,
        },
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not load opportunities.",
      );
    } finally {
      setLoading(false);
    }
  }, [
    competitionFilter,
    dateFrom,
    dateTo,
    maximumScore,
    minimumScore,
    page,
    pageSize,
    query,
    regionFilter,
    sort,
    statusFilter,
    typeFilter,
    withoutBrief,
  ]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), query ? 250 : 0);
    return () => window.clearTimeout(timeout);
  }, [load, query]);

  async function runResearch() {
    if (research.seedTopic.trim().length < 2) return;
    setResearching(true);
    setError("");
    try {
      const response = await fetch("/api/research/topics", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(research),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "AI research failed.");
      setResearchOpen(false);
      setResearch((current) => ({ ...current, seedTopic: "" }));
      if (payload.mode === "unpersisted-demo")
        setRows((current) => [...payload.data, ...current]);
      else await load();
      toast({
        title:
          payload.mode === "unpersisted-demo"
            ? "Research preview created"
            : "Research completed",
        description: `${payload.data.length} opportunit${payload.data.length === 1 ? "y" : "ies"} ${payload.mode === "unpersisted-demo" ? "added to this preview" : "saved to the workspace"}.`,
        variant: payload.mode === "unpersisted-demo" ? "info" : "success",
      });
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "AI research failed.",
      );
    } finally {
      setResearching(false);
    }
  }

  async function saveManual() {
    if (manual.keyword.trim().length < 2) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/opportunities", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(manual),
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error ?? "Could not save opportunity.");
      setManualOpen(false);
      setManual(manualDefaults);
      if (payload.mode === "demo")
        setRows((current) => [payload.data, ...current]);
      else await load();
      toast({
        title: "Opportunity saved",
        description: `“${payload.data.keyword}” is ready for review.`,
        variant: "success",
      });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not save opportunity.",
      );
    } finally {
      setSaving(false);
    }
  }

  function resetResearchImport() {
    setImportCsv("");
    setImportFileName("");
    setImportPreview(null);
    setImportError("");
  }

  async function requestResearchImportPreview(csv: string, commit: boolean) {
    const response = await fetch("/api/opportunities/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ csv, commit }),
    });
    const payload = await response.json();
    if (payload.data) setImportPreview(payload.data as ResearchImportPreview);
    if (!response.ok)
      throw new Error(payload.error ?? "Could not process the research CSV.");
    return payload;
  }

  async function validateResearchCsv(csv = importCsv) {
    if (!csv.trim()) {
      setImportError("Choose a CSV file or paste research CSV content first.");
      return;
    }
    setImportBusy(true);
    setImportError("");
    setImportPreview(null);
    try {
      await requestResearchImportPreview(csv, false);
    } catch (caught) {
      setImportError(
        caught instanceof Error
          ? caught.message
          : "Could not validate research CSV.",
      );
    } finally {
      setImportBusy(false);
    }
  }

  async function selectResearchCsv(file: File | undefined) {
    if (!file) return;
    if (file.size > 1_000_000) {
      setImportError("CSV must be no larger than 1MB.");
      return;
    }
    const csv = await file.text();
    setImportFileName(file.name);
    setImportCsv(csv);
    await validateResearchCsv(csv);
  }

  async function importResearchTopics() {
    if (!importPreview?.valid) return;
    setImportBusy(true);
    setImportError("");
    try {
      const payload = await requestResearchImportPreview(importCsv, true);
      const created = (payload.data.opportunities ?? []) as Opportunity[];
      setRows((current) => [...created, ...current].slice(0, pageSize));
      setPagination((current) => ({
        ...current,
        total: current.total + created.length,
        totalPages: Math.ceil(
          (current.total + created.length) / current.pageSize,
        ),
      }));
      setImportOpen(false);
      resetResearchImport();
      toast({
        title: "Research CSV imported",
        description: `${created.length} opportunit${created.length === 1 ? "y was" : "ies were"} added.`,
        variant: "success",
      });
    } catch (caught) {
      setImportError(
        caught instanceof Error
          ? caught.message
          : "Could not import research topics.",
      );
    } finally {
      setImportBusy(false);
    }
  }

  function openFilters() {
    setDraftFilters({
      type: typeFilter,
      status: statusFilter,
      region: regionFilter,
      minScore: minimumScore,
      maxScore: maximumScore,
      competition: competitionFilter,
      withoutBrief,
      from: dateFrom,
      to: dateTo,
    });
    setFilterOpen(true);
  }

  function changeSort(nextSort: string) {
    setSort(nextSort);
    setPage(1);
    pushUrlFilters({ sort: nextSort, page: 1 });
  }

  function openDateFilter(open: boolean) {
    setDateOpen(open);
    if (open) {
      setToolbarDateRange({
        from: parseDateOnly(dateFrom),
        to: parseDateOnly(dateTo),
      });
    }
  }

  function applyToolbarDate() {
    const from = formatDateOnly(toolbarDateRange?.from);
    const to = formatDateOnly(toolbarDateRange?.to);
    setDateFrom(from);
    setDateTo(to);
    setDraftFilters((current) => ({ ...current, from, to }));
    setPage(1);
    pushUrlFilters({ from: from || null, to: to || null, page: 1 });
    setDateOpen(false);
  }

  function chooseCreateMode(mode: "manual" | "ai") {
    setCreateOpen(false);
    window.requestAnimationFrame(() => {
      if (mode === "manual") setManualOpen(true);
      else setResearchOpen(true);
    });
  }

  return (
    <>
      <PageHeader
        title="Opportunities"
        description="Research and score commercially useful image topics."
        actions={
          <>
            <Button
              aria-label="Import research CSV"
              variant="outline"
              onClick={() => setImportOpen(true)}
            >
              <Upload /> Import CSV
            </Button>
            <Button onClick={() => setCreateOpen(true)}>
              <Plus /> Add opportunity
            </Button>
          </>
        }
      />

      <ToastFeedback
        message={error}
        title="Research workflow needs attention"
        variant="error"
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Total opportunities"
          value={String(summary.total)}
          trend={summary.weekly.total}
          icon={Search}
        />
        <Metric
          label="Awaiting review"
          value={String(summary.researching)}
          trend={summary.weekly.researching}
          trendTone={summary.weekly.researching > 0 ? "negative" : "neutral"}
          tone="warning"
          icon={Clock3}
        />
        <Metric
          label="Ready for brief"
          value={String(summary.shortlisted)}
          trend={summary.weekly.shortlisted}
          icon={CheckCircle2}
        />
        <Metric
          label="Briefed"
          value={String(summary.briefed)}
          trend={summary.weekly.briefed}
          icon={FilePlus2}
        />
      </div>

      <FilterDialog
        open={filterOpen}
        onOpenChange={setFilterOpen}
        title="Filter opportunities"
        onClear={() =>
          setDraftFilters({
            type: "all",
            status: "all",
            region: "",
            minScore: "",
            maxScore: "",
            competition: "all",
            withoutBrief: false,
            from: "",
            to: "",
          })
        }
        onApply={applyFilters}
      >
        <FilterSection label="Type">
          <div className="flex flex-wrap gap-2">
            {["all", "evergreen", "seasonal", "trending"].map((value) => (
              <FilterChoice
                key={value}
                active={draftFilters.type === value}
                onClick={() => setDraftFilters((v) => ({ ...v, type: value }))}
              >
                {value === "all" ? "Any behavior" : value}
              </FilterChoice>
            ))}
          </div>
        </FilterSection>
        <FilterSection label="Target region">
          <Input
            value={draftFilters.region}
            onChange={(event) =>
              setDraftFilters((current) => ({
                ...current,
                region: event.target.value,
              }))
            }
            placeholder="e.g. Indonesia"
          />
        </FilterSection>
        <FilterSection label="Opportunity score">
          <div className="grid grid-cols-2 gap-3">
            <Input
              type="number"
              min={0}
              max={100}
              value={draftFilters.minScore}
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  minScore: event.target.value,
                }))
              }
              placeholder="Minimum"
            />
            <Input
              type="number"
              min={0}
              max={100}
              value={draftFilters.maxScore}
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  maxScore: event.target.value,
                }))
              }
              placeholder="Maximum"
            />
          </div>
        </FilterSection>
        <FilterSection label="Competition">
          <div className="flex flex-wrap gap-2">
            {[
              ["all", "Any supply"],
              ["lower", "Lower supply"],
              ["moderate", "Moderate"],
              ["high", "High supply"],
            ].map(([value, label]) => (
              <FilterChoice
                key={value}
                active={draftFilters.competition === value}
                onClick={() =>
                  setDraftFilters((current) => ({
                    ...current,
                    competition: value,
                  }))
                }
              >
                {label}
              </FilterChoice>
            ))}
          </div>
        </FilterSection>
        <FilterSection label="Created date">
          <div className="grid gap-3 sm:grid-cols-2">
            <DateFilterPicker
              id="opportunity-date-from"
              label="Created from"
              value={draftFilters.from}
              max={draftFilters.to || undefined}
              ariaLabel="Opportunities created from"
              onChange={(value) =>
                setDraftFilters((v) => ({ ...v, from: value }))
              }
            />
            <DateFilterPicker
              id="opportunity-date-to"
              label="Created through"
              value={draftFilters.to}
              min={draftFilters.from || undefined}
              ariaLabel="Opportunities created through"
              onChange={(value) =>
                setDraftFilters((v) => ({ ...v, to: value }))
              }
            />
          </div>
        </FilterSection>
        <label className="flex items-center justify-between gap-3">
          <span>
            <span className="block text-sm">Only topics without briefs</span>
            <span className="text-[11px] text-muted-foreground">
              Show opportunities still needing production briefs.
            </span>
          </span>
          <Switch
            checked={draftFilters.withoutBrief}
            onCheckedChange={(withoutBrief) =>
              setDraftFilters((current) => ({ ...current, withoutBrief }))
            }
          />
        </label>
      </FilterDialog>

      <section className="workspace-panel overflow-hidden">
        <div className="flex flex-col gap-3 border-b p-3 lg:flex-row lg:items-center">
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
              placeholder="Search opportunities…"
              aria-label="Filter opportunities"
            />
          </div>
          <Popover open={dateOpen} onOpenChange={openDateFilter}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant={dateFrom || dateTo ? "accent" : "outline"}
                aria-label="Filter opportunities by created date"
                className="justify-start lg:min-w-40"
              >
                <CalendarDays />
                {dateLabel}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="range"
                selected={toolbarDateRange}
                onSelect={setToolbarDateRange}
                numberOfMonths={2}
                defaultMonth={toolbarDateRange?.from}
              />
              <div className="flex items-center justify-between gap-2 border-t p-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setToolbarDateRange(undefined)}
                >
                  Clear
                </Button>
                <Button type="button" size="sm" onClick={applyToolbarDate}>
                  Apply dates
                </Button>
              </div>
            </PopoverContent>
          </Popover>
          <FilterButton
            count={urlFilterCount([
              typeFilter,
              statusFilter,
              regionFilter,
              minimumScore || maximumScore,
              competitionFilter,
              withoutBrief ? "true" : "",
            ])}
            onClick={openFilters}
          />
        </div>

        <ActiveFilterChips
          className="border-b bg-muted/10 px-3 py-2.5"
          filters={activeFilters}
          onClear={clearFilters}
        />

        {loading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 7 }, (_, index) => (
              <Skeleton key={index} className="h-12 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <section className="px-6 py-14 text-center">
            <Sparkles className="mx-auto size-6 text-primary" />
            <h2 className="mt-4 text-lg font-semibold">
              No opportunities match this view
            </h2>
            <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
              Adjust the filters or add a manually researched topic or an
              AI-assisted research run.
            </p>
            <Button className="mt-5" onClick={() => setCreateOpen(true)}>
              <Plus /> Add opportunity
            </Button>
          </section>
        ) : (
          <div className="overflow-x-auto">
            <Table className="workspace-table opportunity-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Topic</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Supply estimate</TableHead>
                  <TableHead>
                    <button
                      type="button"
                      className="table-sort-trigger"
                      onClick={() =>
                        changeSort(sort === "score_desc" ? "score_asc" : "score_desc")
                      }
                      aria-label="Sort by opportunity score"
                    >
                      Score
                      {sort === "score_asc" ? <ArrowUp /> : <ArrowDown />}
                    </button>
                  </TableHead>
                  <TableHead>
                    <button
                      type="button"
                      className="table-sort-trigger"
                      onClick={() =>
                        changeSort(sort === "newest" ? "oldest" : "newest")
                      }
                      aria-label="Sort by created date"
                    >
                      Created
                      {sort === "oldest" ? <ArrowUp /> : <ArrowDown />}
                    </button>
                  </TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const supply = getSupplyLevel(row.adobeResultCount);
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="min-w-64 max-w-md">
                        <div className="flex items-center gap-3">
                          <span className="opportunity-topic-mark control-raised grid size-10 shrink-0 place-items-center rounded-lg border text-primary">
                            <Search className="size-4" />
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-medium leading-snug">
                              {row.keyword}
                            </p>
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                              {row.targetRegion}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={`badge-raised badge-${row.type}`}
                        >
                          {row.type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className={`badge-raised badge-supply-${supply}`}
                          >
                            {supply === "lower"
                              ? "Low"
                              : supply === "moderate"
                                ? "Medium"
                                : "High"}
                          </Badge>
                          <InfoTooltip label={`Supply details for ${row.keyword}`}>
                            {formatNumber(row.adobeResultCount)} estimated Adobe
                            Stock results. This is available supply, not proven
                            demand, and should be verified manually.
                          </InfoTooltip>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-base font-semibold text-emerald-700 tabular-nums dark:text-emerald-300">
                          {Math.round(Number(row.opportunityScore))}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatAppDateTime(row.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label={`Actions for ${row.keyword}`}
                            >
                              <MoreVertical />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link
                                href={`/briefs?dialog=create-ai&source-opportunity=${row.id}`}
                              >
                                <FilePlus2 /> Create briefs
                              </Link>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {!loading && rows.length > 0 && (
          <DataPagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            totalItems={pagination.total}
            pageSize={pagination.pageSize}
            itemLabel="opportunities"
            disabled={loading}
            onPageChange={(value) => {
              setPage(value);
              pushUrlFilters({ page: value });
            }}
          />
        )}
      </section>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add an opportunity</DialogTitle>
            <DialogDescription>
              Choose how you want to add the next researched image topic.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Card className="group overflow-hidden transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-primary/35">
              <button
                type="button"
                className="flex h-full w-full flex-col items-start p-5 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                onClick={() => chooseCreateMode("manual")}
              >
                <span className="control-raised grid size-11 place-items-center rounded-xl border bg-emerald-50 text-emerald-700 dark:bg-emerald-950/45 dark:text-emerald-300">
                  <Plus className="size-5" />
                </span>
                <span className="mt-5 text-base font-semibold">
                  Add manually
                </span>
                <span className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  Enter a topic and the research signals you already verified.
                </span>
              </button>
            </Card>
            <Card className="group overflow-hidden transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-primary/35">
              <button
                type="button"
                className="flex h-full w-full flex-col items-start p-5 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                onClick={() => chooseCreateMode("ai")}
              >
                <span className="control-raised grid size-11 place-items-center rounded-xl border bg-emerald-50 text-emerald-700 dark:bg-emerald-950/45 dark:text-emerald-300">
                  <Sparkles className="size-5" />
                </span>
                <span className="mt-5 text-base font-semibold">
                  Research with AI
                </span>
                <span className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  Expand a broad seed into scored, commercially useful topics.
                </span>
              </button>
            </Card>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={importOpen}
        onOpenChange={(open) => {
          setImportOpen(open);
          if (!open) resetResearchImport();
        }}
      >
        <DialogContent className="max-w-6xl overflow-hidden p-0">
          <DialogHeader className="border-b px-6 pb-5 pt-6 pr-14">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary">
                <FileSpreadsheet className="size-5" />
              </span>
              <div>
                <DialogTitle>Import researched topics from CSV</DialogTitle>
                <DialogDescription className="mt-1">
                  Bring current topic research from your chat agent into
                  Opportunities before importing the connected brief CSV.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="max-h-[65dvh] space-y-5 overflow-y-auto px-6 py-5">
            <Alert>
              <Search />
              <AlertTitle>Research estimates remain estimates</AlertTitle>
              <AlertDescription>
                Competition must be a numeric available-supply estimate, not a
                sales claim. The four signal fields must be numbers from 0–100.
                Thoock calculates the opportunity score during validation.
              </AlertDescription>
            </Alert>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/20 p-4">
              <div>
                <p className="text-sm font-medium">
                  Use the exact research headers
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Maximum 200 topics and 1MB. Use | between buyer uses and
                  source links.
                </p>
              </div>
              <Button variant="outline" asChild>
                <a href="/api/opportunities/import" download>
                  <Download /> Download template
                </a>
              </Button>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div className="grid content-start gap-2">
                <Label htmlFor="research-csv-file">Upload research CSV</Label>
                <Input
                  id="research-csv-file"
                  type="file"
                  accept=".csv,text/csv"
                  disabled={importBusy}
                  onChange={(event) =>
                    void selectResearchCsv(event.target.files?.[0])
                  }
                />
                <p className="text-[11px] text-muted-foreground">
                  {importFileName ||
                    "UTF-8 CSV; quoted commas and multiline notes are supported."}
                </p>
              </div>
              <div className="grid content-start gap-2">
                <Label htmlFor="research-csv-content">
                  Or paste research CSV
                </Label>
                <Textarea
                  id="research-csv-content"
                  className="min-h-32 font-mono text-xs"
                  value={importCsv}
                  disabled={importBusy}
                  placeholder="keyword,target_region,type,competition_estimate,…"
                  onChange={(event) => {
                    setImportCsv(event.target.value);
                    setImportFileName("");
                    setImportPreview(null);
                  }}
                />
              </div>
            </div>

            {importError && (
              <Alert className="border-destructive/40">
                <AlertTitle>Research CSV needs attention</AlertTitle>
                <AlertDescription>{importError}</AlertDescription>
              </Alert>
            )}

            {importPreview && (
              <section className="overflow-hidden rounded-lg border">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/20 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">Research preview</p>
                    <p className="text-xs text-muted-foreground">
                      {importPreview.rowCount} topic
                      {importPreview.rowCount === 1 ? "" : "s"} parsed
                    </p>
                  </div>
                  <Badge
                    variant={importPreview.valid ? "success" : "destructive"}
                  >
                    {importPreview.valid ? (
                      <>
                        <CheckCircle2 /> Ready to import
                      </>
                    ) : (
                      `${importPreview.errors.length} validation error${importPreview.errors.length === 1 ? "" : "s"}`
                    )}
                  </Badge>
                </div>
                {importPreview.errors.length > 0 ? (
                  <div className="space-y-2 p-4">
                    {importPreview.errors.slice(0, 20).map((issue, index) => (
                      <div
                        key={`${issue.row}-${issue.field}-${index}`}
                        className="grid gap-1 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs sm:grid-cols-[7rem_12rem_1fr]"
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
                          <TableHead>Topic</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Supply estimate</TableHead>
                          <TableHead>Signals</TableHead>
                          <TableHead>Score</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {importPreview.rows.slice(0, 20).map((row) => (
                          <TableRow key={row.row}>
                            <TableCell>
                              <p className="max-w-80 font-medium">
                                {row.keyword}
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {row.targetRegion}
                              </p>
                            </TableCell>
                            <TableCell className="capitalize">
                              {row.type}
                            </TableCell>
                            <TableCell className="font-mono">
                              {formatNumber(row.competitionEstimate)}
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                <Badge variant="outline">
                                  T {Math.round(row.trendGrowth)}
                                </Badge>
                                <Badge variant="outline">
                                  C {Math.round(row.commercialIntent)}
                                </Badge>
                                <Badge variant="outline">
                                  S {Math.round(row.seasonality)}
                                </Badge>
                                <Badge variant="outline">
                                  P {Math.round(row.portfolioPerformance)}
                                </Badge>
                              </div>
                            </TableCell>
                            <TableCell>
                              <span className="font-mono text-lg font-semibold text-primary">
                                {row.score}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                /100
                              </span>
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
              onClick={() => setImportOpen(false)}
              disabled={importBusy}
            >
              Cancel
            </Button>
            <Button
              variant="outline"
              onClick={() => void validateResearchCsv()}
              disabled={importBusy || !importCsv.trim()}
            >
              {importBusy ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <FileSpreadsheet />
              )}
              Validate CSV
            </Button>
            <Button
              onClick={importResearchTopics}
              disabled={importBusy || !importPreview?.valid}
            >
              {importBusy ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Upload />
              )}
              {importBusy
                ? "Importing…"
                : `Import ${importPreview?.rowCount ?? 0} topic${importPreview?.rowCount === 1 ? "" : "s"}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={researchOpen} onOpenChange={setResearchOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Research topic opportunities with AI</DialogTitle>
            <DialogDescription>
              Start broad. The assistant returns narrower, visually producible
              commercial topics with explainable provisional scores.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-5">
            <Field
              label="Topic seed"
              helper="A market, behavior, season, or buyer problem"
            >
              <Input
                value={research.seedTopic}
                onChange={(event) =>
                  setResearch({ ...research, seedTopic: event.target.value })
                }
                placeholder="Example: affordable healthy eating"
              />
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Target region">
                <Input
                  value={research.targetRegion}
                  onChange={(event) =>
                    setResearch({
                      ...research,
                      targetRegion: event.target.value,
                    })
                  }
                />
              </Field>
              <Field label="Topic behavior">
                <Select
                  value={research.type}
                  onValueChange={(value: OpportunityInput["type"]) =>
                    setResearch({ ...research, type: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="evergreen">Evergreen</SelectItem>
                    <SelectItem value="seasonal">Seasonal</SelectItem>
                    <SelectItem value="trending">Trending</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Research assistant">
                <Select
                  value={research.provider}
                  onValueChange={(provider: ResearchProviderId) =>
                    setResearch({ ...research, provider })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mock-research-ai">
                      Deterministic mock (free)
                    </SelectItem>
                    <SelectItem value="gemini-research-ai">
                      Gemini AI
                    </SelectItem>
                    <SelectItem value="openai-research-ai">
                      OpenAI with web research
                    </SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Number of topic angles">
                <Input
                  type="number"
                  min={1}
                  max={12}
                  value={research.count}
                  onChange={(event) =>
                    setResearch({
                      ...research,
                      count: Number(event.target.value),
                    })
                  }
                />
              </Field>
            </div>
            <Field
              label="Optional portfolio context"
              helper="Helps the AI avoid repeating what you already have"
            >
              <Textarea
                value={research.portfolioContext}
                onChange={(event) =>
                  setResearch({
                    ...research,
                    portfolioContext: event.target.value,
                  })
                }
                placeholder="Example: I already have many generic office images; I want Indonesian small-business scenes."
              />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResearchOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={runResearch}
              disabled={researching || research.seedTopic.trim().length < 2}
            >
              {researching ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Sparkles />
              )}
              {researching
                ? "Researching…"
                : `Research and save ${research.count}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Add an opportunity manually</DialogTitle>
            <DialogDescription>
              Use measured or personally verified inputs when you already know
              the topic.
            </DialogDescription>
          </DialogHeader>
          <div className="grid max-h-[58dvh] gap-5 overflow-y-auto pr-2 sm:grid-cols-2">
            <Field label="Keyword">
              <Input
                value={manual.keyword}
                onChange={(event) =>
                  setManual({ ...manual, keyword: event.target.value })
                }
              />
            </Field>
            <Field label="Target region">
              <Input
                value={manual.targetRegion}
                onChange={(event) =>
                  setManual({ ...manual, targetRegion: event.target.value })
                }
              />
            </Field>
            <Field label="Topic behavior">
              <Select
                value={manual.type}
                onValueChange={(type: OpportunityInput["type"]) =>
                  setManual({ ...manual, type })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="evergreen">Evergreen</SelectItem>
                  <SelectItem value="seasonal">Seasonal</SelectItem>
                  <SelectItem value="trending">Trending</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field
              label="Adobe result count"
              helper="Available supply, not demand"
            >
              <Input
                type="number"
                min={0}
                value={manual.competition}
                onChange={(event) =>
                  setManual({
                    ...manual,
                    competition: Number(event.target.value),
                  })
                }
              />
            </Field>
            {(
              [
                ["Trend growth", "trendGrowth"],
                ["Commercial intent", "commercialIntent"],
                ["Seasonal fit", "seasonality"],
                ["Personal portfolio fit", "portfolioPerformance"],
              ] as const
            ).map(([label, key]) => (
              <Field key={key} label={`${label}: ${manual[key]}`}>
                <Slider
                  min={0}
                  max={100}
                  step={1}
                  value={[manual[key]]}
                  onValueChange={([value]) =>
                    setManual({ ...manual, [key]: value })
                  }
                />
              </Field>
            ))}
          </div>
          <div className="mt-5 rounded-lg border border-primary/20 bg-primary/5 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">Opportunity score</span>
              <span className="font-mono text-2xl font-semibold text-primary">
                {manualScore}/100
              </span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {manual.keyword
                ? explainOpportunityScore(manual)
                : "Enter a keyword to complete the explanation."}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManualOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={saveManual}
              disabled={saving || manual.keyword.trim().length < 2}
            >
              {saving && <LoaderCircle className="animate-spin" />} Save
              opportunity
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
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
