"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  AlertCircle,
  CheckCircle2,
  Clock3,
  Eye,
  Download,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Metric } from "@/components/metric";
import { DateFilterPicker } from "@/components/date-filter-picker";
import { DateRangeToolbar } from "@/components/date-range-toolbar";
import { DataPagination } from "@/components/data-pagination";
import {
  ActiveFilterChips,
  FilterButton,
  FilterChoice,
  FilterDialog,
  FilterSection,
} from "@/components/filter-dialog";
import {
  pushUrlFilters,
  readUrlFilter,
  urlFilterCount,
} from "@/lib/client/url-filters";
import { formatAppDateTime } from "@/lib/format/date";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToastFeedback } from "@/components/ui/toaster";

type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

type ProviderLog = {
  id: string;
  generationJobId: string | null;
  sourcePath: string;
  idempotencyKey: string;
  provider: string;
  model: string;
  operation: string;
  status: "started" | "succeeded" | "failed";
  requestBody: JsonValue;
  providerRequestBody: JsonValue;
  responseBody: JsonValue | null;
  providerRequestIds: string[];
  estimatedCostUsd: string | null;
  actualCostUsd: string | null;
  durationMs: number | null;
  errorDetails: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function isRecord(value: JsonValue): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function valueAt(record: JsonValue, key: string) {
  return isRecord(record) ? record[key] : undefined;
}

function formatCost(value: string | null) {
  if (value === null) return "Unavailable";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 3,
    maximumFractionDigits: 6,
  }).format(Number(value));
}

function formatDuration(value: number | null) {
  if (value === null) return "In progress";
  if (value < 1_000) return `${value} ms`;
  return `${(value / 1_000).toFixed(2)} s`;
}

function operationLabel(operation: string) {
  if (operation === "topic_research") return "Topic research";
  if (operation === "brief_generation") return "Brief generation";
  if (operation === "prompt_generation") return "Prompt generation";
  if (operation === "metadata_generation") return "Metadata generation";
  if (operation === "history_search") return "History search";
  if (operation === "history_lookup") return "History lookup";
  if (operation === "logo_removal") return "Logo removal";
  return "Image generation";
}

function StatusBadge({ status }: { status: ProviderLog["status"] }) {
  if (status === "succeeded")
    return (
      <Badge variant="success">
        <CheckCircle2 className="size-3" /> Succeeded
      </Badge>
    );
  if (status === "failed")
    return (
      <Badge variant="destructive">
        <AlertCircle className="size-3" /> Failed
      </Badge>
    );
  return (
    <Badge variant="warning">
      <Clock3 className="size-3" /> Started
    </Badge>
  );
}

function JsonBlock({ value }: { value: JsonValue | null }) {
  return (
    <pre className="max-h-80 overflow-auto rounded-xl border bg-muted/50 p-4 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words">
      {value === null
        ? "No response was recorded."
        : JSON.stringify(value, null, 2)}
    </pre>
  );
}

export function ProviderLogsWorkspace({ jobId }: { jobId?: string }) {
  const [logs, setLogs] = useState<ProviderLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [providerFilter, setProviderFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [query, setQuery] = useState("");
  const [operationFilter, setOperationFilter] = useState("all");
  const [modelFilter, setModelFilter] = useState("all");
  const [requestType, setRequestType] = useState("all");
  const [minimumDuration, setMinimumDuration] = useState("");
  const [maximumDuration, setMaximumDuration] = useState("");
  const [onlyErrors, setOnlyErrors] = useState(false);
  const [missingUuid, setMissingUuid] = useState(false);
  const [selected, setSelected] = useState<ProviderLog | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [sort, setSort] = useState("newest");
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 0,
  });
  const [providers, setProviders] = useState<string[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [draftFilters, setDraftFilters] = useState({
    status: "all",
    provider: "all",
    operation: "all",
    model: "all",
    requestType: "all",
    minimumDuration: "",
    maximumDuration: "",
    onlyErrors: false,
    missingUuid: false,
    from: "",
    to: "",
  });

  useEffect(() => {
    const syncFromUrl = () => {
      const next = {
        status: readUrlFilter("status", "all"),
        provider: readUrlFilter("provider", "all"),
        operation: readUrlFilter("operation", "all"),
        model: readUrlFilter("model", "all"),
        requestType: readUrlFilter("requestType", "all"),
        minimumDuration: readUrlFilter("minDuration"),
        maximumDuration: readUrlFilter("maxDuration"),
        onlyErrors: readUrlFilter("errors") === "true",
        missingUuid: readUrlFilter("missingUuid") === "true",
        from: readUrlFilter("from"),
        to: readUrlFilter("to"),
      };
      setQuery(readUrlFilter("q"));
      setPage(Math.max(1, Number(readUrlFilter("page", "1")) || 1));
      setSort(readUrlFilter("sort", "newest"));
      setStatusFilter(next.status);
      setProviderFilter(next.provider);
      setOperationFilter(next.operation);
      setModelFilter(next.model);
      setRequestType(next.requestType);
      setMinimumDuration(next.minimumDuration);
      setMaximumDuration(next.maximumDuration);
      setOnlyErrors(next.onlyErrors);
      setMissingUuid(next.missingUuid);
      setDateFrom(next.from);
      setDateTo(next.to);
      setDraftFilters(next);
    };
    syncFromUrl();
    window.addEventListener("popstate", syncFromUrl);
    return () => window.removeEventListener("popstate", syncFromUrl);
  }, []);

  const loadLogs = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        sort,
      });
      if (jobId) params.set("job", jobId);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (providerFilter !== "all") params.set("provider", providerFilter);
      if (query.trim()) params.set("q", query.trim());
      if (operationFilter !== "all") params.set("operation", operationFilter);
      if (modelFilter !== "all") params.set("model", modelFilter);
      if (requestType !== "all") params.set("requestType", requestType);
      if (minimumDuration) params.set("minDuration", minimumDuration);
      if (maximumDuration) params.set("maxDuration", maximumDuration);
      if (onlyErrors) params.set("errors", "true");
      if (missingUuid) params.set("missingUuid", "true");
      if (dateFrom) params.set("from", dateFrom);
      if (dateTo) params.set("to", dateTo);
      const response = await fetch(`/api/provider-logs?${params}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as {
        data?: ProviderLog[];
        pagination?: {
          page: number;
          pageSize: number;
          total: number;
          totalPages: number;
        };
        facets?: { providers: string[]; models: string[] };
        error?: string;
      };
      if (!response.ok)
        throw new Error(payload.error ?? "Provider logs could not be loaded.");
      setLogs(payload.data ?? []);
      setPagination(
        payload.pagination ?? {
          page,
          pageSize,
          total: payload.data?.length ?? 0,
          totalPages: payload.data?.length ? 1 : 0,
        },
      );
      setProviders(payload.facets?.providers ?? []);
      setModels(payload.facets?.models ?? []);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Provider logs could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [
    dateFrom,
    dateTo,
    jobId,
    maximumDuration,
    minimumDuration,
    missingUuid,
    modelFilter,
    onlyErrors,
    operationFilter,
    page,
    pageSize,
    providerFilter,
    query,
    requestType,
    sort,
    statusFilter,
  ]);

  function refreshLogs() {
    setLoading(true);
    setError("");
    void loadLogs();
  }

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadLogs(), 0);
    return () => window.clearTimeout(initialLoad);
  }, [loadLogs]);

  function applyFilters() {
    setStatusFilter(draftFilters.status);
    setProviderFilter(draftFilters.provider);
    setOperationFilter(draftFilters.operation);
    setModelFilter(draftFilters.model);
    setRequestType(draftFilters.requestType);
    setMinimumDuration(draftFilters.minimumDuration);
    setMaximumDuration(draftFilters.maximumDuration);
    setOnlyErrors(draftFilters.onlyErrors);
    setMissingUuid(draftFilters.missingUuid);
    setDateFrom(draftFilters.from);
    setDateTo(draftFilters.to);
    setPage(1);
    pushUrlFilters({
      status: draftFilters.status,
      provider: draftFilters.provider,
      operation: draftFilters.operation,
      model: draftFilters.model,
      requestType: draftFilters.requestType,
      minDuration: draftFilters.minimumDuration,
      maxDuration: draftFilters.maximumDuration,
      errors: draftFilters.onlyErrors ? "true" : null,
      missingUuid: draftFilters.missingUuid ? "true" : null,
      from: draftFilters.from,
      to: draftFilters.to,
      page: 1,
    });
    setFilterOpen(false);
  }
  function clearFilters() {
    const next = {
      status: "all",
      provider: "all",
      operation: "all",
      model: "all",
      requestType: "all",
      minimumDuration: "",
      maximumDuration: "",
      onlyErrors: false,
      missingUuid: false,
      from: "",
      to: "",
    };
    setDraftFilters(next);
    setStatusFilter("all");
    setProviderFilter("all");
    setOperationFilter("all");
    setModelFilter("all");
    setRequestType("all");
    setMinimumDuration("");
    setMaximumDuration("");
    setOnlyErrors(false);
    setMissingUuid(false);
    setDateFrom("");
    setDateTo("");
    setPage(1);
    pushUrlFilters({
      status: null,
      provider: null,
      operation: null,
      model: null,
      requestType: null,
      minDuration: null,
      maxDuration: null,
      errors: null,
      missingUuid: null,
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
            setDraftFilters((value) => ({ ...value, status: "all" }));
            pushUrlFilters({ status: null });
          },
        }
      : null,
    providerFilter !== "all"
      ? {
          key: "provider",
          label: `Provider: ${providerFilter}`,
          onRemove: () => {
            setProviderFilter("all");
            setDraftFilters((value) => ({ ...value, provider: "all" }));
            pushUrlFilters({ provider: null });
          },
        }
      : null,
    dateFrom
      ? {
          key: "from",
          label: `From ${dateFrom}`,
          onRemove: () => {
            setDateFrom("");
            setDraftFilters((value) => ({ ...value, from: "" }));
            pushUrlFilters({ from: null });
          },
        }
      : null,
    dateTo
      ? {
          key: "to",
          label: `Through ${dateTo}`,
          onRemove: () => {
            setDateTo("");
            setDraftFilters((value) => ({ ...value, to: "" }));
            pushUrlFilters({ to: null });
          },
        }
      : null,
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));
  const succeededCount = logs.filter(
    (log) => log.status === "succeeded",
  ).length;
  const failedCount = logs.filter((log) => log.status === "failed").length;
  const measuredDurations = logs.flatMap((log) =>
    log.durationMs === null ? [] : [log.durationMs],
  );
  const averageDuration = measuredDurations.length
    ? measuredDurations.reduce((sum, value) => sum + value, 0) /
      measuredDurations.length
    : 0;

  function exportLogs() {
    const blob = new Blob([JSON.stringify(logs, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `thoock-provider-logs-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <PageHeader
        title="Provider logs"
        description="Inspect provider requests, responses, timing, and recovery operations."
        actions={
          <>
            <Button variant="outline" onClick={exportLogs}>
              <Download />
              Export logs
            </Button>
            <Button onClick={refreshLogs} disabled={loading}>
              {loading ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <RefreshCw />
              )}
              Refresh
            </Button>
          </>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Requests"
          value={String(pagination.total)}
          note="Matching this view"
          icon={Eye}
        />
        <Metric
          label="Succeeded"
          value={String(succeededCount)}
          note="On this page"
          icon={CheckCircle2}
        />
        <Metric
          label="Failed"
          value={String(failedCount)}
          note="On this page"
          icon={AlertCircle}
        />
        <Metric
          label="Avg duration"
          value={formatDuration(Math.round(averageDuration))}
          note="On this page"
          icon={Clock3}
        />
      </div>

      {jobId && (
        <Alert className="mb-5">
          <HistoryLinkLabel />
          <AlertTitle>Filtered to one generation attempt</AlertTitle>
          <AlertDescription>
            Showing provider calls linked to job <code>{jobId}</code>. Clear the
            filter to review every request.
            <Button className="ml-2" variant="link" size="sm" asChild>
              <a href="/provider-logs">Clear filter</a>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <section className="workspace-panel overflow-hidden">
        <div className="flex flex-col gap-3 border-b p-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              onBlur={() => pushUrlFilters({ q: query || null, page: 1 })}
              className="pl-9"
              placeholder="Search logs…"
            />
          </div>
          <DateRangeToolbar
            from={dateFrom}
            to={dateTo}
            ariaLabel="Filter provider logs by date"
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
              providerFilter,
              operationFilter,
              modelFilter,
              requestType,
              minimumDuration,
              maximumDuration,
              onlyErrors ? "true" : "",
              missingUuid ? "true" : "",
            ])}
            onClick={() => {
              setDraftFilters({
                status: statusFilter,
                provider: providerFilter,
                operation: operationFilter,
                model: modelFilter,
                requestType,
                minimumDuration,
                maximumDuration,
                onlyErrors,
                missingUuid,
                from: dateFrom,
                to: dateTo,
              });
              setFilterOpen(true);
            }}
          />
          <p className="self-center whitespace-nowrap text-xs text-muted-foreground">
            {pagination.total} requests
          </p>
        </div>
        <ActiveFilterChips
          className="border-b bg-muted/10 px-3 py-2.5"
          filters={activeFilters}
          onClear={clearFilters}
        />
      <FilterDialog
        open={filterOpen}
        onOpenChange={setFilterOpen}
        title="Filter provider logs"
        onClear={() =>
          setDraftFilters({
            status: "all",
            provider: "all",
            operation: "all",
            model: "all",
            requestType: "all",
            minimumDuration: "",
            maximumDuration: "",
            onlyErrors: false,
            missingUuid: false,
            from: "",
            to: "",
          })
        }
        onApply={applyFilters}
      >
        <FilterSection label="Provider">
          <div className="flex flex-wrap gap-2">
            <FilterChoice
              active={draftFilters.provider === "all"}
              onClick={() =>
                setDraftFilters((current) => ({ ...current, provider: "all" }))
              }
            >
              All
            </FilterChoice>
            {providers.map((provider) => (
              <FilterChoice
                key={provider}
                active={draftFilters.provider === provider}
                onClick={() =>
                  setDraftFilters((current) => ({ ...current, provider }))
                }
              >
                {provider}
              </FilterChoice>
            ))}
          </div>
        </FilterSection>
        <FilterSection label="Operation">
          <div className="flex flex-wrap gap-2">
            {[
              ["all", "Any"],
              ["topic_research", "Topic research"],
              ["brief_generation", "Brief generation"],
              ["prompt_generation", "Prompt generation"],
              ["metadata_generation", "Metadata generation"],
              ["image_generation", "Image generation"],
              ["history_search", "History search"],
              ["history_lookup", "History lookup"],
              ["logo_removal", "Logo removal"],
            ].map(([value, label]) => (
              <FilterChoice
                key={value}
                active={draftFilters.operation === value}
                onClick={() =>
                  setDraftFilters((current) => ({
                    ...current,
                    operation: value,
                  }))
                }
              >
                {label}
              </FilterChoice>
            ))}
          </div>
        </FilterSection>
        <FilterSection label="Status">
          <div className="flex flex-wrap gap-2">
            {["all", "started", "succeeded", "failed"].map((value) => (
              <FilterChoice
                key={value}
                active={draftFilters.status === value}
                onClick={() =>
                  setDraftFilters((current) => ({ ...current, status: value }))
                }
              >
                {value === "all" ? "Any status" : value}
              </FilterChoice>
            ))}
          </div>
        </FilterSection>
        <FilterSection label="Model">
          <Select
            value={draftFilters.model}
            onValueChange={(model) =>
              setDraftFilters((current) => ({ ...current, model }))
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All models</SelectItem>
              {models.map((model) => (
                <SelectItem key={model} value={model}>
                  {model}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterSection>
        <FilterSection label="Request type">
          <div className="flex flex-wrap gap-2">
            {["all", "free", "paid", "unknown"].map((value) => (
              <FilterChoice
                key={value}
                active={draftFilters.requestType === value}
                onClick={() =>
                  setDraftFilters((current) => ({
                    ...current,
                    requestType: value,
                  }))
                }
              >
                {value === "all" ? "Any" : value}
              </FilterChoice>
            ))}
          </div>
        </FilterSection>
        <FilterSection label="Duration">
          <div className="grid grid-cols-2 gap-3">
            <Input
              inputMode="numeric"
              value={draftFilters.minimumDuration}
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  minimumDuration: event.target.value,
                }))
              }
              placeholder="Minimum ms"
            />
            <Input
              inputMode="numeric"
              value={draftFilters.maximumDuration}
              onChange={(event) =>
                setDraftFilters((current) => ({
                  ...current,
                  maximumDuration: event.target.value,
                }))
              }
              placeholder="Maximum ms"
            />
          </div>
        </FilterSection>
        <FilterSection label="Request date">
          <div className="grid gap-3 sm:grid-cols-2">
            <DateFilterPicker
              id="log-date-from"
              label="Requested from"
              value={draftFilters.from}
              max={draftFilters.to || undefined}
              ariaLabel="Provider logs requested from"
              onChange={(from) =>
                setDraftFilters((current) => ({ ...current, from }))
              }
            />
            <DateFilterPicker
              id="log-date-to"
              label="Requested through"
              value={draftFilters.to}
              min={draftFilters.from || undefined}
              ariaLabel="Provider logs requested through"
              onChange={(to) =>
                setDraftFilters((current) => ({ ...current, to }))
              }
            />
          </div>
        </FilterSection>
        <label className="flex items-center justify-between gap-3">
          <span className="text-sm">Only requests with errors</span>
          <Switch
            checked={draftFilters.onlyErrors}
            onCheckedChange={(onlyErrors) =>
              setDraftFilters((current) => ({ ...current, onlyErrors }))
            }
          />
        </label>
        <label className="flex items-center justify-between gap-3">
          <span className="text-sm">Only requests missing provider UUID</span>
          <Switch
            checked={draftFilters.missingUuid}
            onCheckedChange={(missingUuid) =>
              setDraftFilters((current) => ({ ...current, missingUuid }))
            }
          />
        </label>
      </FilterDialog>

      <ToastFeedback
        message={error}
        title="Could not load provider logs"
        variant="error"
      />

        {loading ? (
          <div className="space-y-3 p-5" aria-label="Loading provider logs">
            {[0, 1, 2, 3].map((item) => (
              <Skeleton key={item} className="h-14 w-full" />
            ))}
          </div>
        ) : logs.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <ShieldCheck className="mx-auto mb-3 size-7 text-muted-foreground" />
            <p className="font-medium">No provider requests found</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              Provider calls from generation, research, recovery, and image
              preparation appear here. Requests rejected before a provider is
              invoked are not recorded.
            </p>
          </div>
        ) : (
          <Table className="workspace-table">
            <TableHeader>
              <TableRow>
                <TableHead>
                  <button
                    type="button"
                    className="table-sort-trigger"
                    onClick={() => {
                      const next = sort === "newest" ? "oldest" : "newest";
                      setSort(next);
                      setPage(1);
                      pushUrlFilters({ sort: next, page: 1 });
                    }}
                  >
                    Started
                    {sort === "oldest" ? <ArrowUp /> : <ArrowDown />}
                  </button>
                </TableHead>
                <TableHead>Provider / model</TableHead>
                <TableHead>Request</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>
                  <button
                    type="button"
                    className="table-sort-trigger"
                    onClick={() => {
                      const next =
                        sort === "duration_desc"
                          ? "duration_asc"
                          : "duration_desc";
                      setSort(next);
                      setPage(1);
                      pushUrlFilters({ sort: next, page: 1 });
                    }}
                  >
                    Duration
                    {sort === "duration_asc" ? <ArrowUp /> : <ArrowDown />}
                  </button>
                </TableHead>
                <TableHead>Estimated / actual</TableHead>
                <TableHead className="text-right">Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => {
                const calls = valueAt(log.providerRequestBody, "calls");
                const firstCall = Array.isArray(calls) ? calls[0] : null;
                const firstBody = firstCall ? valueAt(firstCall, "body") : null;
                const width =
                  valueAt(log.providerRequestBody, "requestedWidth") ??
                  (firstBody ? valueAt(firstBody, "width") : undefined);
                const height =
                  valueAt(log.providerRequestBody, "requestedHeight") ??
                  (firstBody ? valueAt(firstBody, "height") : undefined);
                const candidates =
                  valueAt(log.providerRequestBody, "candidates") ??
                  (Array.isArray(calls) ? calls.length : undefined);
                const topicCount = valueAt(
                  log.providerRequestBody,
                  "count",
                );
                const targetRegion = valueAt(
                  log.providerRequestBody,
                  "targetRegion",
                );
                return (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatAppDateTime(log.createdAt)}
                    </TableCell>
                    <TableCell>
                      <p className="font-medium">{log.provider}</p>
                      <p
                        className="max-w-52 truncate text-xs text-muted-foreground"
                        title={log.model}
                      >
                        {log.model}
                      </p>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <p>
                        {log.operation === "image_generation"
                          ? `${String(candidates ?? "—")} image(s)`
                          : log.operation === "topic_research"
                            ? `${String(topicCount ?? "—")} topic(s)`
                          : operationLabel(log.operation)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {log.operation === "image_generation"
                          ? width && height
                            ? `${String(width)} × ${String(height)}`
                            : "Dimensions unavailable"
                          : log.operation === "topic_research"
                            ? String(targetRegion ?? "Region unavailable")
                          : (log.providerRequestIds[0] ??
                            "Provider ID pending")}
                      </p>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={log.status} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatDuration(log.durationMs)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <p>{formatCost(log.estimatedCostUsd)}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatCost(log.actualCostUsd)}
                      </p>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelected(log)}
                      >
                        <Eye /> View
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
        <DataPagination
          page={pagination.page}
          totalPages={pagination.totalPages}
          totalItems={pagination.total}
          pageSize={pagination.pageSize}
          itemLabel="requests"
          disabled={loading}
          onPageChange={(value) => {
            setPage(value);
            pushUrlFilters({ page: value });
          }}
        />
      </section>

      <Sheet
        open={selected !== null}
        onOpenChange={(open) => !open && setSelected(null)}
      >
        <SheetContent className="max-w-2xl overflow-y-auto sm:w-[640px]">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle>Provider request details</SheetTitle>
                <SheetDescription>
                  {selected.provider} · {selected.model} ·{" "}
                  {formatAppDateTime(selected.createdAt)}
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-6">
                <div className="grid gap-3 rounded-xl border bg-card p-4 text-sm sm:grid-cols-2">
                  <div>
                    <p className="text-xs text-muted-foreground">Status</p>
                    <div className="mt-1">
                      <StatusBadge status={selected.status} />
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Duration</p>
                    <p className="mt-1 font-medium">
                      {formatDuration(selected.durationMs)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Generation job
                    </p>
                    <p className="mt-1 break-all font-mono text-xs">
                      {selected.generationJobId ?? "Not persisted"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Operation</p>
                    <p className="mt-1 font-medium">
                      {operationLabel(selected.operation)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Provider request ID
                    </p>
                    <p className="mt-1 break-all font-mono text-xs">
                      {selected.providerRequestIds.join(", ") || "Unavailable"}
                    </p>
                  </div>
                  <div className="sm:col-span-2">
                    <p className="text-xs text-muted-foreground">
                      Idempotency key
                    </p>
                    <p className="mt-1 break-all font-mono text-xs">
                      {selected.idempotencyKey}
                    </p>
                  </div>
                </div>
                {selected.errorDetails && (
                  <Alert className="border-destructive/30">
                    <AlertCircle className="text-destructive" />
                    <AlertTitle>Provider error</AlertTitle>
                    <AlertDescription className="break-words">
                      {selected.errorDetails}
                    </AlertDescription>
                  </Alert>
                )}
                <section>
                  <h2 className="mb-2 text-sm font-semibold">
                    Thoock request body
                  </h2>
                  <JsonBlock value={selected.requestBody} />
                </section>
                <section>
                  <h2 className="mb-2 text-sm font-semibold">
                    Normalized provider request
                  </h2>
                  <JsonBlock value={selected.providerRequestBody} />
                </section>
                <section>
                  <h2 className="mb-2 text-sm font-semibold">
                    Provider response summary
                  </h2>
                  <JsonBlock value={selected.responseBody} />
                </section>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

function HistoryLinkLabel() {
  return <Eye className="text-primary" />;
}
