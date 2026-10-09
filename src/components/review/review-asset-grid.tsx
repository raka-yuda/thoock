"use client";

/* eslint-disable react-hooks/refs -- TanStack Virtual intentionally exposes an imperative measurement instance to render its current window. */

import {
  AlertTriangle,
  CheckCircle2,
  FileCheck2,
  FileImage,
  FileWarning,
  Maximize2,
} from "lucide-react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import {
  memo,
  type ComponentProps,
  type ReactNode,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ReviewAsset } from "./review-types";
import { reviewThumbnailUrl } from "./review-types";

export function ReviewAssetGrid({
  assets,
  selectedAssetIds,
  onOpen,
  onToggleSelection,
}: {
  assets: ReviewAsset[];
  selectedAssetIds: ReadonlySet<string>;
  onOpen: (asset: ReviewAsset) => void;
  onToggleSelection: (assetId: string, checked: boolean) => void;
}) {
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [layout, setLayout] = useState({ columns: 1, width: 0, offsetTop: 0 });

  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;

    const measure = () => {
      const width = grid.getBoundingClientRect().width;
      const viewportWidth = window.innerWidth;
      const columns =
        viewportWidth >= 1536 ? 5 : viewportWidth >= 1280 ? 4 : viewportWidth >= 640 ? 2 : 1;
      const offsetTop = grid.getBoundingClientRect().top + window.scrollY;
      setLayout((current) =>
        current.columns === columns &&
        Math.abs(current.width - width) < 1 &&
        Math.abs(current.offsetTop - offsetTop) < 1
          ? current
          : { columns, width, offsetTop },
      );
    };

    measure();
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    observer?.observe(grid);
    window.addEventListener("resize", measure, { passive: true });
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  const rows = useMemo(() => {
    const result: ReviewAsset[][] = [];
    for (let index = 0; index < assets.length; index += layout.columns)
      result.push(assets.slice(index, index + layout.columns));
    return result;
  }, [assets, layout.columns]);

  const estimatedCardWidth =
    layout.width > 0
      ? (layout.width - (layout.columns - 1) * 12) / layout.columns
      : 320;
  const overscanRows = layout.columns >= 4 ? 1 : layout.columns === 2 ? 2 : 3;
  const rowVirtualizer = useWindowVirtualizer<HTMLDivElement>({
    count: rows.length,
    estimateSize: () => Math.round(estimatedCardWidth * 0.75 + 105),
    getItemKey: (index) => rows[index]?.[0]?.id ?? index,
    // Overscan is expressed in rows, so a fixed value multiplies the mounted
    // image count at wide breakpoints. Keep one spare five-card row on desktop
    // and a slightly deeper buffer where each row contains fewer images.
    overscan: overscanRows,
    scrollMargin: layout.offsetTop,
    // Synchronous range commits can block the same frame as a scroll event.
    // The larger overscan makes concurrent range updates safe here.
    useFlushSync: false,
  });

  return (
    <TooltipProvider delayDuration={250}>
      <div
        ref={gridRef}
        className="relative w-full"
        data-review-grid
        data-rendered-count={assets.length}
        data-mounted-count={rowVirtualizer.getVirtualItems().length * layout.columns}
      >
        <div
          className="relative w-full"
          style={{ height: rowVirtualizer.getTotalSize() }}
          aria-rowcount={rows.length}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => (
            <div
              key={virtualRow.key}
              ref={rowVirtualizer.measureElement}
              data-index={virtualRow.index}
              data-review-row
              className="absolute left-0 w-full pb-3"
              style={{
                top: virtualRow.start - layout.offsetTop,
              }}
            >
              <div
                className="grid gap-3"
                style={{
                  gridTemplateColumns: `repeat(${layout.columns}, minmax(0, 1fr))`,
                }}
              >
                {rows[virtualRow.index]?.map((asset) => (
                  <ReviewAssetCard
                    key={asset.id}
                    asset={asset}
                    selected={selectedAssetIds.has(asset.id)}
                    onOpen={onOpen}
                    onToggleSelection={onToggleSelection}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </TooltipProvider>
  );
}

const ReviewAssetCard = memo(function ReviewAssetCard({
  asset,
  selected,
  onOpen,
  onToggleSelection,
}: {
  asset: ReviewAsset;
  selected: boolean;
  onOpen: (asset: ReviewAsset) => void;
  onToggleSelection: (assetId: string, checked: boolean) => void;
}) {
  const megapixels = Number(asset.megapixels);
  const fileFormat = asset.mimeType
    .replace("image/", "")
    .replace("application/", "")
    .toUpperCase();

  return (
    <article
      data-review-card
      className={`group min-w-0 overflow-hidden rounded-xl border bg-card transition-colors duration-150 hover:border-primary/30 ${
        selected ? "border-primary/50 ring-2 ring-primary/15" : ""
      }`}
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
        <button
          type="button"
          className="absolute inset-0 z-0 overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
          onClick={() => onOpen(asset)}
          aria-label={`Review ${asset.briefName}`}
        >
          {/* The API already creates bounded, cached Sharp thumbnails. The
              virtual window is deliberately small, so these should load as
              soon as their row mounts; adding native lazy loading here would
              delay decoding until the row is already visible. */}
          <img
            src={reviewThumbnailUrl(asset)}
            srcSet={`${reviewThumbnailUrl(asset, 320)} 320w, ${reviewThumbnailUrl(asset, 640)} 640w`}
            sizes="(min-width: 1536px) 20vw, (min-width: 1280px) 25vw, (min-width: 640px) 50vw, 100vw"
            alt={asset.briefName}
            width={640}
            height={480}
            loading="eager"
            decoding="async"
            fetchPriority="low"
            draggable={false}
            className="absolute inset-0 size-full object-cover"
          />
        </button>
        <div className="absolute left-2.5 top-2.5 z-10 grid size-8 place-items-center rounded-[var(--radius-control-compact)] border border-white/45 bg-background shadow-sm">
          <Checkbox
            checked={selected}
            onCheckedChange={(checked) =>
              onToggleSelection(asset.id, checked === true)
            }
            aria-label={`Select ${asset.briefName}`}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="absolute right-2.5 top-2.5 z-10 size-8 bg-background"
          onClick={() => onOpen(asset)}
          aria-label={`Open ${asset.briefName}`}
        >
          <Maximize2 className="size-4" />
        </Button>
      </div>
      <div className="p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="line-clamp-1 text-sm font-semibold">
              {asset.briefName}
            </h2>
            <p className="mt-1 font-mono text-[11px] text-muted-foreground">
              {asset.width} × {asset.height} · {megapixels.toFixed(2)}MP
            </p>
          </div>
          <Badge
            className="shrink-0"
            variant={
              asset.review.decision === "approved"
                ? "success"
                : asset.review.decision === "rejected"
                  ? "destructive"
                  : asset.review.decision === "regenerate"
                    ? "warning"
                    : "secondary"
            }
          >
            {asset.review.decision}
          </Badge>
        </div>
        <div className="mt-2.5 flex items-center gap-1.5">
          <AssetSignal
            label={
              megapixels < 4
                ? `${megapixels.toFixed(2)}MP: upscale required before export`
                : `${megapixels.toFixed(2)}MP: meets the 4MP minimum`
            }
            variant={megapixels < 4 ? "warning" : "success"}
          >
            {megapixels < 4 ? <AlertTriangle /> : <CheckCircle2 />}
          </AssetSignal>
          <AssetSignal label={`File format: ${fileFormat}`} variant="outline">
            <FileImage />
          </AssetSignal>
          <AssetSignal
            label={
              asset.metadata
                ? "Metadata is ready"
                : "Metadata still needs preparation"
            }
            variant={asset.metadata ? "success" : "warning"}
          >
            {asset.metadata ? <FileCheck2 /> : <FileWarning />}
          </AssetSignal>
        </div>
      </div>
    </article>
  );
});

function AssetSignal({
  label,
  variant,
  children,
}: {
  label: string;
  variant: ComponentProps<typeof Badge>["variant"];
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          tabIndex={0}
          aria-label={label}
          variant={variant}
          className="badge-icon cursor-help outline-none focus-visible:ring-2 focus-visible:ring-primary/35 [&_svg]:size-3.5"
        >
          {children}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
