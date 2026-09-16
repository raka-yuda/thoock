import { ArrowRight, ArrowUpRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function Metric({
  label,
  value,
  note,
  icon: Icon,
  tone = "primary",
  trend,
  trendTone = "positive",
}: {
  label: string;
  value: string;
  note?: string;
  icon: LucideIcon;
  tone?: "primary" | "warning" | "neutral";
  trend?: number;
  trendTone?: "positive" | "negative" | "neutral";
}) {
  const TrendIcon = trend === 0 ? ArrowRight : ArrowUpRight;

  return (
    <div className="metric-tile surface-raised flex min-w-0 items-center gap-4 rounded-xl border bg-card px-4 py-4">
      <span
        className={cn(
          "metric-icon control-raised grid size-12 shrink-0 place-items-center rounded-xl border",
          tone === "primary" &&
            "border-emerald-600/20 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/45 dark:text-emerald-300",
          tone === "warning" &&
            "border-amber-500/30 bg-amber-50 text-amber-700 dark:bg-amber-950/45 dark:text-amber-300",
          tone === "neutral" && "bg-muted text-foreground",
        )}
      >
        <Icon className="size-6" strokeWidth={1.9} />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <p className="mt-1 font-mono text-[1.8rem] font-semibold leading-none tracking-[-0.04em] tabular-nums">
          {value}
        </p>
        {trend !== undefined ? (
          <p
            className={cn(
              "mt-2 flex items-center gap-1 text-[11px] font-medium",
              trendTone === "positive" &&
                "text-emerald-700 dark:text-emerald-400",
              trendTone === "negative" && "text-destructive",
              trendTone === "neutral" && "text-muted-foreground",
            )}
          >
            <TrendIcon className="size-3.5" />
            {trend > 0 ? "+" : ""}
            {trend} this week
          </p>
        ) : note ? (
          <p className="mt-2 text-[11px] text-emerald-700 dark:text-emerald-400">
            {note}
          </p>
        ) : null}
      </div>
    </div>
  );
}
