"use client";

import * as React from "react";
import { PanelLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TooltipContent } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function SidebarTrigger({
  className,
  onClick,
  ...props
}: React.ComponentProps<typeof Button>) {
  return (
    <Button
      data-slot="sidebar-trigger"
      data-sidebar="trigger"
      variant="ghost"
      size="icon"
      className={cn("size-9", className)}
      onClick={(event) => onClick?.(event)}
      {...props}
    >
      <PanelLeft aria-hidden="true" />
      <span className="sr-only">Toggle sidebar</span>
    </Button>
  );
}

export function SidebarTooltipContent({
  className,
  sideOffset = 10,
  ...props
}: React.ComponentProps<typeof TooltipContent>) {
  return (
    <TooltipContent
      sideOffset={sideOffset}
      className={cn("px-3.5 py-2.5 text-sm font-medium", className)}
      {...props}
    />
  );
}
