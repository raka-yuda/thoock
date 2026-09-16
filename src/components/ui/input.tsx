import * as React from "react";
import { cn } from "@/lib/utils";
export function Input({
  className,
  type,
  ...props
}: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "control-inset h-[var(--control-height)] w-full rounded-[var(--radius-control)] border border-input bg-background px-3 text-sm outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 disabled:opacity-50",
        type === "file" &&
          "flex items-center py-1 leading-7 file:mr-3 file:inline-flex file:h-7 file:items-center file:border-0 file:bg-transparent file:p-0 file:text-sm file:font-semibold file:text-foreground",
        className,
      )}
      {...props}
    />
  );
}
