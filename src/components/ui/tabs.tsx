"use client";
import * as React from "react";
import { Tabs as TabsPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";
export const Tabs = TabsPrimitive.Root;
export function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn(
        "control-inset inline-flex h-[var(--control-height)] items-center gap-1 rounded-[var(--radius-control)] border bg-muted/75 p-1 text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}
export function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "inline-flex h-[var(--control-height-compact)] items-center justify-center rounded-[var(--radius-control-compact)] border border-transparent px-3 text-xs font-semibold outline-none transition-[background-color,border-color,box-shadow,color] focus-visible:ring-2 focus-visible:ring-primary/30 data-[state=active]:border-primary/35 data-[state=active]:bg-accent data-[state=active]:text-accent-foreground data-[state=active]:shadow-[inset_0_1px_0_var(--control-highlight),0_1px_1px_var(--control-shadow)]",
        className,
      )}
      {...props}
    />
  );
}
export function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      className={cn("mt-4 outline-none", className)}
      {...props}
    />
  );
}
