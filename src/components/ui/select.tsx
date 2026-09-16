"use client";
import * as React from "react";
import { Check, ChevronDown } from "lucide-react";
import { Select as Primitive } from "radix-ui";
import { cn } from "@/lib/utils";
export const Select = Primitive.Root;
export const SelectValue = Primitive.Value;
export function SelectTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof Primitive.Trigger>) {
  return (
    <Primitive.Trigger
      className={cn(
        "control-inset flex h-[var(--control-height)] w-full items-center justify-between rounded-[var(--radius-control)] border border-input bg-background px-3 text-sm outline-none transition-[border-color,box-shadow] focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20 disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
      <Primitive.Icon asChild>
        <ChevronDown className="size-4 text-muted-foreground" />
      </Primitive.Icon>
    </Primitive.Trigger>
  );
}
export function SelectContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <Primitive.Content
        className={cn(
          "surface-raised z-[100] max-h-72 min-w-[8rem] overflow-hidden rounded-[var(--radius-control)] border border-border bg-popover text-popover-foreground",
          className,
        )}
        position="popper"
        sideOffset={5}
        {...props}
      >
        <Primitive.Viewport className="p-1">{children}</Primitive.Viewport>
      </Primitive.Content>
    </Primitive.Portal>
  );
}
export function SelectItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof Primitive.Item>) {
  return (
    <Primitive.Item
      className={cn(
        "relative flex cursor-default select-none items-center rounded-md py-2 pl-8 pr-2 text-sm outline-none focus:bg-muted",
        className,
      )}
      {...props}
    >
      <span className="absolute left-2 grid size-4 place-items-center">
        <Primitive.ItemIndicator>
          <Check className="size-4" />
        </Primitive.ItemIndicator>
      </span>
      <Primitive.ItemText>{children}</Primitive.ItemText>
    </Primitive.Item>
  );
}
