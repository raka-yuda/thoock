"use client";
import * as React from "react";
import { X } from "lucide-react";
import { Dialog as Primitive } from "radix-ui";
import { cn } from "@/lib/utils";
export const Sheet = Primitive.Root;
export const SheetTrigger = Primitive.Trigger;
export const SheetClose = Primitive.Close;
export function SheetContent({
  className,
  children,
  side = "right",
  ...props
}: React.ComponentProps<typeof Primitive.Content> & {
  side?: "right" | "left";
}) {
  return (
    <Primitive.Portal>
      <Primitive.Overlay className="fixed inset-0 z-40 bg-foreground/40" />
      <Primitive.Content
        className={cn(
          "fixed inset-y-0 z-50 w-[92vw] max-w-md border-border bg-background p-6 shadow-xl outline-none",
          side === "right" ? "right-0 border-l" : "left-0 border-r",
          className,
        )}
        {...props}
      >
        {children}
        <Primitive.Close
          className="absolute right-4 top-4 rounded-md p-1 text-muted-foreground hover:bg-muted"
          aria-label="Close"
        >
          <X className="size-4" />
        </Primitive.Close>
      </Primitive.Content>
    </Primitive.Portal>
  );
}
export const SheetHeader = ({
  className,
  ...props
}: React.ComponentProps<"div">) => (
  <div className={cn("mb-5 space-y-1.5", className)} {...props} />
);
export const SheetTitle = ({
  className,
  ...props
}: React.ComponentProps<typeof Primitive.Title>) => (
  <Primitive.Title
    className={cn(
      "text-[length:var(--font-size-dialog-title)] font-semibold leading-snug tracking-[-.02em]",
      className,
    )}
    {...props}
  />
);
export const SheetDescription = ({
  className,
  ...props
}: React.ComponentProps<typeof Primitive.Description>) => (
  <Primitive.Description
    className={cn("text-sm leading-relaxed text-muted-foreground", className)}
    {...props}
  />
);
