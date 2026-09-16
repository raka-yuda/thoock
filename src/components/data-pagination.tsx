"use client";

import type { MouseEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
} from "@/components/ui/pagination";
import { cn } from "@/lib/utils";

export function DataPagination({
  page,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  disabled = false,
  itemLabel = "items",
}: {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
  itemLabel?: string;
}) {
  const first = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, totalItems);
  const previousDisabled = disabled || page <= 1;
  const nextDisabled = disabled || page >= totalPages;

  const pageItems = (() => {
    if (totalPages <= 7)
      return Array.from({ length: totalPages }, (_, index) => index + 1);
    if (page <= 4) return [1, 2, 3, 4, 5, "ellipsis", totalPages] as const;
    if (page >= totalPages - 3)
      return [
        1,
        "ellipsis",
        totalPages - 4,
        totalPages - 3,
        totalPages - 2,
        totalPages - 1,
        totalPages,
      ] as const;
    return [
      1,
      "ellipsis",
      page - 1,
      page,
      page + 1,
      "ellipsis-end",
      totalPages,
    ] as const;
  })();

  function move(event: MouseEvent<HTMLAnchorElement>, targetPage: number) {
    event.preventDefault();
    if (disabled || targetPage < 1 || targetPage > totalPages) return;
    onPageChange(targetPage);
  }

  return (
    <Pagination className="flex-col gap-3 border-t bg-muted/10 px-4 py-3 text-sm sm:flex-row sm:justify-between">
      <span className="text-muted-foreground">
        Showing {first}–{last} of {totalItems} {itemLabel}
      </span>
      <PaginationContent>
        <PaginationItem>
          <PaginationLink
            href="#"
            aria-label="Previous page"
            aria-disabled={previousDisabled}
            tabIndex={previousDisabled ? -1 : undefined}
            className={cn(
              "control-raised grid size-9 place-items-center border bg-card p-0",
              previousDisabled && "pointer-events-none opacity-50",
            )}
            onClick={(event) => move(event, page - 1)}
          >
            <ChevronLeft className="size-4" />
          </PaginationLink>
        </PaginationItem>
        {pageItems.map((item) =>
          typeof item === "string" ? (
            <PaginationItem key={item}>
              <PaginationEllipsis />
            </PaginationItem>
          ) : (
            <PaginationItem key={item}>
              <PaginationLink
                href="#"
                isActive={item === page}
                aria-label={`Go to page ${item}`}
                className={cn(
                  "size-9",
                  item === page &&
                    "button-primary border-primary text-white hover:text-white",
                )}
                onClick={(event) => move(event, item)}
              >
                {item}
              </PaginationLink>
            </PaginationItem>
          ),
        )}
        <PaginationItem>
          <PaginationLink
            href="#"
            aria-label="Next page"
            aria-disabled={nextDisabled}
            tabIndex={nextDisabled ? -1 : undefined}
            className={cn(
              "control-raised grid size-9 place-items-center border bg-card p-0",
              nextDisabled && "pointer-events-none opacity-50",
            )}
            onClick={(event) => move(event, page + 1)}
          >
            <ChevronRight className="size-4" />
          </PaginationLink>
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}
