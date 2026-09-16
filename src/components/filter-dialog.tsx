"use client";

import { Filter, Info, X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";

export function FilterButton({
  count,
  onClick,
}: {
  count: number;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant={count ? "accent" : "outline"}
      onClick={onClick}
      aria-label={`Filter options${count ? `, ${count} active` : ""}`}
    >
      <Filter /> Filter{count ? ` (${count})` : ""}
    </Button>
  );
}

export function FilterDialog({
  open,
  onOpenChange,
  title,
  children,
  onClear,
  onApply,
  applying = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  onClear: () => void;
  onApply: () => void;
  applying?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md overflow-hidden p-0">
        <DialogHeader className="mb-0 border-b px-5 pb-4 pt-5 pr-16">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[66dvh] space-y-5 overflow-y-auto px-5 py-5">
          {children}
        </div>
        <div className="flex items-center gap-2 border-t bg-muted/22 px-5 py-3 text-[11px] text-muted-foreground">
          <Info className="size-3.5 shrink-0" />
          Filters are reflected in the page URL for sharing and browser history.
        </div>
        <DialogFooter className="mt-0 border-t px-5 py-4 sm:justify-between">
          <Button type="button" variant="danger" onClick={onClear}>
            Clear all
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="button" onClick={onApply} disabled={applying}>
              Apply filters
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function FilterSection({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="space-y-2.5">
      <legend className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground">
        {label.toUpperCase()}
      </legend>
      {children}
    </fieldset>
  );
}

export function FilterChoice({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant={active ? "accent" : "outline"}
      size="sm"
      onClick={onClick}
      aria-pressed={active}
    >
      {children}
    </Button>
  );
}

export type ActiveFilter = {
  key: string;
  label: string;
  onRemove: () => void;
};

export function ActiveFilterChips({
  filters,
  onClear,
  className,
}: {
  filters: ActiveFilter[];
  onClear?: () => void;
  className?: string;
}) {
  if (!filters.length) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {filters.map((filter) => (
        <Badge
          key={filter.key}
          variant="outline"
          className="control-raised badge-evergreen h-[var(--control-height-compact)] min-w-0 gap-1.5 rounded-[var(--radius-control-compact)] px-3 py-0 pr-1.5 text-xs normal-case"
        >
          {filter.label}
          <button
            type="button"
            onClick={filter.onRemove}
            className="grid size-4 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label={`Remove ${filter.label} filter`}
          >
            <X className="size-3" />
          </button>
        </Badge>
      ))}
      {onClear && filters.length > 1 && (
        <Button type="button" variant="danger" size="sm" onClick={onClear}>
          Clear all
        </Button>
      )}
    </div>
  );
}
