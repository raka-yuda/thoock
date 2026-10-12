"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Archive,
  Clock3,
  Download,
  FileJson,
  FileSpreadsheet,
  ImageIcon,
  LoaderCircle,
  Package,
  Search,
  ShieldCheck,
} from "lucide-react";
import {
  pushUrlFilters,
  readUrlFilter,
  urlFilterCount,
} from "@/lib/client/url-filters";
import { formatAppDateTime } from "@/lib/format/date";
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
import { InfoTooltip } from "./info-help";
import { Metric } from "./metric";
import { PageHeader } from "./page-header";
import { TableBulkActionBar } from "./table-bulk-action-bar";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Checkbox } from "./ui/checkbox";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Skeleton } from "./ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";
import { toast, ToastFeedback } from "./ui/toaster";

type Asset = {
  id: string;
  briefName: string;
  width: number;
  height: number;
  megapixels: string;
  mimeType: string;
  thumbnailUrl: string;
  createdAt: string;
  review: { decision: string };
  metadata: null | {
    filename: string;
    title: string;
    category?: string;
    keywords: string[];
    validationErrors: string[];
  };
};
type ExportHistory = {
  count: number;
  latestAt: string;
  latestBatchName: string;
  batchIds: string[];
};
type ExportBatch = {
  id: string;
  name: string;
  status: string;
  itemCount: number;
  csvBytes: number | null;
  createdAt: string;
  updatedAt: string;
};
const emptyFilters = { exportState: "all", from: "", to: "" };

export function ExportWorkspace() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [batchName, setBatchName] = useState(
    `Adobe batch ${new Date().toISOString().slice(0, 10)}`,
  );
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [downloadingAssetId, setDownloadingAssetId] = useState<string | null>(
    null,
  );
  const [error, setError] = useState("");
  const [history, setHistory] = useState<Record<string, ExportHistory>>({});
  const [batches, setBatches] = useState<ExportBatch[]>([]);
  const [query, setQuery] = useState("");
  const [exportState, setExportState] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sort, setSort] = useState("newest");
  const [filterOpen, setFilterOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState(emptyFilters);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [batchPage, setBatchPage] = useState(1);
  const [batchPageSize] = useState(10);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const collected: Asset[] = [];
      let cursor: string | null = null;
      do {
        const params = new URLSearchParams({
          limit: "48",
          decision: "approved",
        });
        if (cursor) params.set("cursor", cursor);
        const response = await fetch(`/api/assets?${params}`, {
          cache: "no-store",
        });
        const payload = await response.json();
        if (!response.ok)
          throw new Error(payload.error ?? "Could not load assets.");
        collected.push(...payload.data);
        cursor = payload.pagination?.hasMore
          ? payload.pagination.nextCursor
          : null;
      } while (cursor);
      const response = await fetch("/api/exports", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error ?? "Could not load export history.");
      setAssets(collected);
      setHistory(payload.data.assets ?? {});
      setBatches(payload.data.batches ?? []);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not load exports.",
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);
  useEffect(() => {
    const sync = () => {
      const next = {
        exportState: readUrlFilter("exported", "all"),
        from: readUrlFilter("from"),
        to: readUrlFilter("to"),
      };
      setQuery(readUrlFilter("q"));
      setPage(Math.max(1, Number(readUrlFilter("page", "1")) || 1));
      setBatchPage(
        Math.max(1, Number(readUrlFilter("batchPage", "1")) || 1),
      );
      setSort(readUrlFilter("sort", "newest"));
      setExportState(next.exportState);
      setDateFrom(next.from);
      setDateTo(next.to);
      setDraftFilters(next);
    };
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);

  const ready = useMemo(
    () =>
      assets.filter(
        (asset) =>
          asset.review.decision === "approved" &&
          Number(asset.megapixels) >= 4 &&
          asset.metadata &&
          asset.metadata.validationErrors.length === 0,
      ),
    [assets],
  );
  const filteredReady = useMemo(
    () =>
      ready
        .filter(
          (asset) =>
            !query.trim() ||
            `${asset.briefName} ${asset.metadata!.filename} ${asset.metadata!.title}`
              .toLowerCase()
              .includes(query.trim().toLowerCase()),
        )
        .filter(
          (asset) =>
            exportState === "all" ||
            (exportState === "exported"
              ? Boolean(history[asset.id])
              : !history[asset.id]),
        )
        .filter((asset) => {
          if (!dateFrom && !dateTo) return true;
          const date = history[asset.id]?.latestAt?.slice(0, 10);
          return Boolean(
            date &&
            (!dateFrom || date >= dateFrom) &&
            (!dateTo || date <= dateTo),
          );
        })
        .sort((left, right) =>
          sort === "name"
            ? left.metadata!.filename.localeCompare(right.metadata!.filename)
            : sort === "exported"
              ? (history[right.id]?.latestAt ?? "").localeCompare(
                  history[left.id]?.latestAt ?? "",
                )
              : right.createdAt.localeCompare(left.createdAt),
        ),
    [dateFrom, dateTo, exportState, history, query, ready, sort],
  );
  const previouslyExported = ready.filter((asset) => history[asset.id]).length;
  const neverExported = ready.length - previouslyExported;
  const month = new Date().toISOString().slice(0, 7);
  const monthlyPackages = batches.filter(
    (batch) => batch.createdAt.slice(0, 7) === month,
  ).length;
  const readyTotalPages = Math.ceil(filteredReady.length / pageSize);
  const resolvedPage = Math.min(page, Math.max(readyTotalPages, 1));
  const pagedReady = filteredReady.slice(
    (resolvedPage - 1) * pageSize,
    resolvedPage * pageSize,
  );
  const batchTotalPages = Math.ceil(batches.length / batchPageSize);
  const resolvedBatchPage = Math.min(batchPage, Math.max(batchTotalPages, 1));
  const pagedBatches = batches.slice(
    (resolvedBatchPage - 1) * batchPageSize,
    resolvedBatchPage * batchPageSize,
  );
  const activeFilters = [
    exportState !== "all"
      ? {
          key: "exported",
          label:
            exportState === "exported"
              ? "Previously exported"
              : "Never exported",
          onRemove: () => applyFilters({ ...draftFilters, exportState: "all" }),
        }
      : null,
    dateFrom
      ? {
          key: "from",
          label: `From ${dateFrom}`,
          onRemove: () => applyFilters({ ...draftFilters, from: "" }),
        }
      : null,
    dateTo
      ? {
          key: "to",
          label: `Through ${dateTo}`,
          onRemove: () => applyFilters({ ...draftFilters, to: "" }),
        }
      : null,
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));

  function toggle(id: string, checked: boolean) {
    setSelected((current) =>
      checked
        ? [...new Set([...current, id])]
        : current.filter((item) => item !== id),
    );
  }
  function togglePage(checked: boolean) {
    const pageIds = new Set(pagedReady.map((asset) => asset.id));
    setSelected((current) =>
      checked
        ? [...new Set([...current, ...pageIds])]
        : current.filter((id) => !pageIds.has(id)),
    );
  }
  function applyFilters(next = draftFilters) {
    setDraftFilters(next);
    setExportState(next.exportState);
    setDateFrom(next.from);
    setDateTo(next.to);
    setPage(1);
    pushUrlFilters({
      exported: next.exportState,
      from: next.from,
      to: next.to,
      page: 1,
    });
    setFilterOpen(false);
  }
  function clearFilters() {
    applyFilters(emptyFilters);
  }
  async function createExport() {
    const exportedCount = selected.length;
    setExporting(true);
    setError("");
    try {
      const response = await fetch("/api/exports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: batchName, assetIds: selected }),
      });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.error ?? "Export failed.");
      }
      const blob = await response.blob();
      const filename =
        (response.headers.get("content-disposition") ?? "").match(
          /filename=([^;]+)/,
        )?.[1] ?? "adobe-stock-pack.zip";
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename.replaceAll('"', "");
      anchor.click();
      URL.revokeObjectURL(url);
      setSelected([]);
      await load();
      toast({
        title: "Export package downloaded",
        description: `${exportedCount} image${exportedCount === 1 ? " was" : "s were"} packaged with Adobe metadata and reports.`,
        variant: "success",
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  }

  async function downloadPreparedImage(asset: Asset) {
    setDownloadingAssetId(asset.id);
    setError("");
    try {
      const response = await fetch(`/api/assets/${asset.id}/download`, {
        method: "POST",
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(
          payload?.error ?? `The JPEG could not be prepared (${response.status}).`,
        );
      }
      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition") ?? "";
      const filename =
        disposition.match(/filename="?([^";]+)"?/i)?.[1] ??
        asset.metadata?.filename ??
        "adobe-stock-image.jpg";
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast({
        title: "JPEG downloaded",
        description: `${filename} is ready for your manual Adobe upload.`,
        variant: "success",
      });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The JPEG could not be downloaded.",
      );
    } finally {
      setDownloadingAssetId(null);
    }
  }

  return (
    <TooltipProvider delayDuration={180}>
      <PageHeader
        title="Adobe exports"
        description="Package approved images with Adobe-compatible metadata."
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Submission ready"
          value={String(ready.length)}
          note="Approved and compliant"
          icon={ImageIcon}
        />
        <Metric
          label="Never exported"
          value={String(neverExported)}
          note="Waiting for a package"
          icon={Clock3}
        />
        <Metric
          label="Previously exported"
          value={String(previouslyExported)}
          note="Downloaded from Thoock"
          icon={FileSpreadsheet}
        />
        <Metric
          label="Packages this month"
          value={String(monthlyPackages)}
          note="Successful and attempted"
          icon={Package}
        />
      </div>
      <ToastFeedback
        message={error}
        title="Export workflow needs attention"
        variant="error"
      />
      <Tabs id="export-tabs" defaultValue="prepare">
        <TabsList className="mb-3">
          <TabsTrigger value="prepare">Prepare package</TabsTrigger>
          <TabsTrigger value="history">Export batches</TabsTrigger>
        </TabsList>
        <TabsContent value="prepare">
          <div className="grid gap-3 xl:grid-cols-[1fr_220px]">
            <Card className="overflow-hidden">
              <div className="workspace-toolbar flex flex-col gap-3 border-b p-3 md:flex-row">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setPage(1);
                    }}
                    onBlur={() => pushUrlFilters({ q: query || null, page: 1 })}
                    placeholder="Search images, briefs, or categories…"
                  />
                </div>
                <DateRangeToolbar
                  from={dateFrom}
                  to={dateTo}
                  ariaLabel="Filter exports by latest export date"
                  onApply={(from, to) => {
                    applyFilters({ ...draftFilters, from, to });
                  }}
                />
                <FilterButton
                  count={urlFilterCount([exportState])}
                  onClick={() => {
                    setDraftFilters({
                      exportState,
                      from: dateFrom,
                      to: dateTo,
                    });
                    setFilterOpen(true);
                  }}
                />
              </div>
              <ActiveFilterChips
                className="border-b px-3 py-2"
                filters={activeFilters}
                onClear={clearFilters}
              />
              <CardContent className="p-0">
                {loading ? (
                  <div className="p-4">
                    <Skeleton className="h-72" />
                  </div>
                ) : !pagedReady.length ? (
                  <div className="px-6 py-14 text-center">
                    <ImageIcon className="mx-auto size-7 text-muted-foreground" />
                    <p className="mt-3 font-semibold">
                      No submission-ready images match
                    </p>
                    <Button className="mt-4" variant="outline" asChild>
                      <Link href="/review">Open review queue</Link>
                    </Button>
                  </div>
                ) : (
                  <Table className="workspace-table">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">
                          <Checkbox
                            aria-label="Select all images on this page"
                            checked={
                              pagedReady.every((asset) =>
                                selected.includes(asset.id),
                              )
                                ? true
                                : pagedReady.some((asset) =>
                                      selected.includes(asset.id),
                                    )
                                  ? "indeterminate"
                                  : false
                            }
                            onCheckedChange={(value) =>
                              togglePage(value === true)
                            }
                          />
                        </TableHead>
                        <TableHead>Image</TableHead>
                        <TableHead>
                          <button
                            type="button"
                            className="table-sort-trigger"
                            onClick={() => {
                              const next = sort === "name" ? "newest" : "name";
                              setSort(next);
                              setPage(1);
                              pushUrlFilters({ sort: next, page: 1 });
                            }}
                          >
                            Brief
                            {sort === "name" ? <ArrowUp /> : <ArrowDown />}
                          </button>
                        </TableHead>
                        <TableHead>Adobe category</TableHead>
                        <TableHead>Metadata</TableHead>
                        <TableHead>4MP gate</TableHead>
                        <TableHead>
                          Export status{" "}
                          <InfoTooltip label="What exported means">
                            Exported means downloaded from Thoock, not submitted
                            to Adobe.
                          </InfoTooltip>
                        </TableHead>
                        <TableHead>
                          <button
                            type="button"
                            className="table-sort-trigger"
                            onClick={() => {
                              const next = sort === "exported" ? "newest" : "exported";
                              setSort(next);
                              setPage(1);
                              pushUrlFilters({ sort: next, page: 1 });
                            }}
                          >
                            Latest export
                            {sort === "exported" ? <ArrowDown /> : <ArrowUp />}
                          </button>
                        </TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pagedReady.map((asset) => (
                        <TableRow
                          key={asset.id}
                          className={
                            selected.includes(asset.id)
                              ? "bg-emerald-50/50"
                              : undefined
                          }
                        >
                          <TableCell>
                            <Checkbox
                              aria-label={`Select ${asset.briefName}`}
                              checked={selected.includes(asset.id)}
                              onCheckedChange={(value) =>
                                toggle(asset.id, value === true)
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Image
                              src={asset.thumbnailUrl}
                              alt=""
                              width={52}
                              height={40}
                              unoptimized
                              className="h-10 w-14 rounded-lg object-cover"
                            />
                          </TableCell>
                          <TableCell>
                            <p className="font-medium">{asset.briefName}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {asset.metadata!.filename}
                            </p>
                          </TableCell>
                          <TableCell>
                            {asset.metadata!.category || "—"}
                          </TableCell>
                          <TableCell>
                            <Badge variant="success">Ready</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="success">
                              {Number(asset.megapixels).toFixed(1)}MP
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {history[asset.id] ? (
                              <Badge variant="success">
                                Exported {history[asset.id].count}×
                              </Badge>
                            ) : (
                              <Badge variant="warning">Never exported</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {history[asset.id]
                              ? formatAppDateTime(history[asset.id].latestAt)
                              : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  aria-label={`Download ${asset.briefName} JPEG`}
                                  disabled={downloadingAssetId === asset.id}
                                  onClick={() =>
                                    void downloadPreparedImage(asset)
                                  }
                                >
                                  {downloadingAssetId === asset.id ? (
                                    <LoaderCircle className="animate-spin" />
                                  ) : (
                                    <Download />
                                  )}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Download prepared JPEG</TooltipContent>
                            </Tooltip>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
                <TableBulkActionBar
                  count={selected.length}
                  itemLabel="image"
                  description="Only compliant files will be packaged."
                  onClear={() => setSelected([])}
                >
                  <Button
                    onClick={createExport}
                    disabled={exporting}
                  >
                    {exporting ? "Preparing…" : "Create package"}
                  </Button>
                </TableBulkActionBar>
                <DataPagination
                  page={resolvedPage}
                  totalPages={readyTotalPages}
                  totalItems={filteredReady.length}
                  pageSize={pageSize}
                  itemLabel="images"
                  disabled={loading}
                  onPageChange={(value) => {
                    setPage(value);
                    pushUrlFilters({ page: value });
                  }}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  Package includes{" "}
                  <InfoTooltip label="Package contents">
                    Every package contains the prepared files and audit reports
                    listed below.
                  </InfoTooltip>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Label htmlFor="batch-name">Package name</Label>
                <Input
                  id="batch-name"
                  className="mt-2"
                  value={batchName}
                  onChange={(event) => setBatchName(event.target.value)}
                />
                <div className="mt-5 space-y-3">
                  <PackageRow
                    icon={ImageIcon}
                    label={`${selected.length || "Selected"} JPEG images`}
                  />
                  <PackageRow icon={FileSpreadsheet} label="Adobe CSV" />
                  <PackageRow icon={FileJson} label="Manifest" />
                  <PackageRow icon={ShieldCheck} label="Compliance report" />
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        <TabsContent value="history">
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              <Table className="workspace-table">
                <TableHeader>
                  <TableRow>
                    <TableHead>Batch</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Images</TableHead>
                    <TableHead>CSV size</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedBatches.map((batch) => (
                    <TableRow key={batch.id}>
                      <TableCell className="font-medium">
                        {batch.name}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            batch.status === "succeeded"
                              ? "success"
                              : batch.status === "failed"
                                ? "destructive"
                                : "secondary"
                          }
                        >
                          {batch.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{batch.itemCount}</TableCell>
                      <TableCell>
                        {batch.csvBytes
                          ? `${(batch.csvBytes / 1024).toFixed(1)}KB`
                          : "—"}
                      </TableCell>
                      <TableCell>
                        {formatAppDateTime(batch.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {!batches.length && (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="py-12 text-center text-muted-foreground"
                      >
                        No export packages created yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
              <DataPagination
                page={resolvedBatchPage}
                totalPages={batchTotalPages}
                totalItems={batches.length}
                pageSize={batchPageSize}
                itemLabel="batches"
                disabled={loading}
                onPageChange={(value) => {
                  setBatchPage(value);
                  pushUrlFilters({ batchPage: value });
                }}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      <FilterDialog
        open={filterOpen}
        onOpenChange={setFilterOpen}
        title="Filter Adobe exports"
        onClear={() => setDraftFilters(emptyFilters)}
        onApply={() => applyFilters()}
      >
        <FilterSection label="Export status">
          <div className="flex flex-wrap gap-2">
            {[
              ["all", "Any status"],
              ["never", "Never exported"],
              ["exported", "Previously exported"],
            ].map(([value, label]) => (
              <FilterChoice
                key={value}
                active={draftFilters.exportState === value}
                onClick={() =>
                  setDraftFilters((current) => ({
                    ...current,
                    exportState: value,
                  }))
                }
              >
                {label}
              </FilterChoice>
            ))}
          </div>
        </FilterSection>
        <FilterSection label="Latest export date">
          <div className="grid grid-cols-2 gap-3">
            <DateFilterPicker
              id="export-from"
              label="From"
              value={draftFilters.from}
              max={draftFilters.to || undefined}
              ariaLabel="Exported from"
              onChange={(from) =>
                setDraftFilters((current) => ({ ...current, from }))
              }
            />
            <DateFilterPicker
              id="export-to"
              label="To"
              value={draftFilters.to}
              min={draftFilters.from || undefined}
              ariaLabel="Exported through"
              onChange={(to) =>
                setDraftFilters((current) => ({ ...current, to }))
              }
            />
          </div>
        </FilterSection>
      </FilterDialog>
    </TooltipProvider>
  );
}

function PackageRow({
  icon: Icon,
  label,
}: {
  icon: typeof Archive;
  label: string;
}) {
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      <span className="control-raised grid size-10 place-items-center rounded-xl border bg-card">
        <Icon className="size-4 text-foreground" />
      </span>
      <span>{label}</span>
    </div>
  );
}
