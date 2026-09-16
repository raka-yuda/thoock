"use client";

import { format } from "date-fns";
import { CalendarDays } from "lucide-react";
import { useState } from "react";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

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

export function DateRangeToolbar({
  from,
  to,
  onApply,
  ariaLabel = "Filter by date",
}: {
  from: string;
  to: string;
  onApply: (from: string, to: string) => void;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<DateRange | undefined>();

  const parsedFrom = parseDateOnly(from);
  const parsedTo = parseDateOnly(to);
  const label = parsedFrom
    ? parsedTo && to !== from
      ? `${format(parsedFrom, "MMM d")} – ${format(parsedTo, "MMM d")}`
      : format(parsedFrom, "MMM d, yyyy")
    : "All dates";

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen)
          setRange({ from: parsedFrom, to: parsedTo });
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant={from || to ? "accent" : "outline"}
          aria-label={ariaLabel}
          className="justify-start whitespace-nowrap"
        >
          <CalendarDays />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <Calendar
          mode="range"
          selected={range}
          onSelect={setRange}
          numberOfMonths={2}
          defaultMonth={range?.from}
        />
        <div className="flex items-center justify-between gap-2 border-t p-3">
          <Button
            type="button"
            variant="danger"
            size="sm"
            onClick={() => setRange(undefined)}
          >
            Clear dates
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              onApply(formatDateOnly(range?.from), formatDateOnly(range?.to ?? range?.from));
              setOpen(false);
            }}
          >
            Apply dates
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
