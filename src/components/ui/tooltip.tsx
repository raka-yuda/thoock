"use client";
import * as React from "react";
import { Tooltip as Primitive } from "radix-ui";
import { cn } from "@/lib/utils";
export const TooltipProvider = Primitive.Provider;
export const Tooltip = Primitive.Root;
export const TooltipTrigger = Primitive.Trigger;
export function TooltipContent({
  className,
  sideOffset = 5,
  children,
  ...props
}: React.ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <Primitive.Content
        sideOffset={sideOffset}
        className={cn(
          "z-[110] max-w-72 rounded-lg bg-foreground px-3 py-2 text-xs leading-relaxed text-background shadow-[0_8px_24px_-10px_color-mix(in_oklab,var(--foreground)_42%,transparent)] data-[state=delayed-open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=delayed-open]:fade-in-0 data-[side=bottom]:slide-in-from-top-1 data-[side=left]:slide-in-from-right-1 data-[side=right]:slide-in-from-left-1 data-[side=top]:slide-in-from-bottom-1",
          className,
        )}
        {...props}
      >
        {children}
        <Primitive.Arrow className="fill-foreground" />
      </Primitive.Content>
    </Primitive.Portal>
  );
}
