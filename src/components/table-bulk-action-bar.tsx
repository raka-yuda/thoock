import type { ReactNode } from "react";

import { Button } from "./ui/button";

type TableBulkActionBarProps = {
  count: number;
  itemLabel: string;
  description?: string;
  onClear: () => void;
  children: ReactNode;
};

export function TableBulkActionBar({
  count,
  itemLabel,
  description,
  onClear,
  children,
}: TableBulkActionBarProps) {
  if (count === 0) return null;

  const selectionLabel = `${count} ${itemLabel}${count === 1 ? "" : "s"} selected`;

  return (
    <div
      role="region"
      aria-label="Bulk selection actions"
      className="sticky bottom-0 z-10 flex flex-wrap items-center gap-x-4 gap-y-2 border-t bg-card/95 px-4 py-3 backdrop-blur"
    >
      <b className="text-sm">{selectionLabel}</b>
      {description ? (
        <span className="text-xs text-muted-foreground">{description}</span>
      ) : null}
      <Button
        type="button"
        variant="outline"
        className="ml-auto"
        onClick={onClear}
      >
        Clear selection
      </Button>
      {children}
    </div>
  );
}
