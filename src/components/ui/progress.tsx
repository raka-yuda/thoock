"use client";
import * as React from "react";
import { Progress as ProgressPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";
export function Progress({
  value = 0,
  className,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn(
        "control-inset relative h-2 w-full overflow-hidden rounded-full border bg-secondary",
        className,
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className="h-full bg-primary shadow-[inset_0_1px_0_rgb(255_255_255/0.28)] transition-transform"
        style={{
          transform: `translateX(-${100 - Math.min(100, Math.max(0, value ?? 0))}%)`,
        }}
      />
    </ProgressPrimitive.Root>
  );
}
