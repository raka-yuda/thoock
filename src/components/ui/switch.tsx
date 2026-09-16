"use client";
import * as React from "react";
import { Switch as SwitchPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";
export function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "control-inset inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-input bg-secondary transition-colors focus-visible:ring-2 focus-visible:ring-primary/30 data-[state=checked]:border-primary/60 data-[state=checked]:bg-primary",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="control-raised pointer-events-none ml-0.5 block size-5 rounded-full border bg-background transition-transform data-[state=checked]:translate-x-5" />
    </SwitchPrimitive.Root>
  );
}
