"use client";

import { format } from "date-fns";
import { CalendarDays } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

function parseDateOnly(value?: string) {
  if (!value) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return undefined;
  return new Date(year, month - 1, day);
}

function formatDateOnly(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function DateFilterPicker({
  id,
  label,
  value,
  onChange,
  min,
  max,
  ariaLabel,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = parseDateOnly(value);
  const minimum = parseDateOnly(min);
  const maximum = parseDateOnly(max);
  const disabled = [
    ...(minimum ? [{ before: minimum }] : []),
    ...(maximum ? [{ after: maximum }] : []),
  ];

  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            aria-label={ariaLabel}
            className={cn(
              "w-full min-w-48 justify-start font-normal",
              !selected && "text-muted-foreground",
            )}
          >
            <CalendarDays />
            {selected ? format(selected, "PP") : "Pick a date"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selected}
            defaultMonth={selected ?? maximum ?? minimum}
            disabled={disabled}
            onSelect={(date) => {
              if (!date) return;
              onChange(formatDateOnly(date));
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
