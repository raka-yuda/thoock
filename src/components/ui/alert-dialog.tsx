"use client";
import * as React from "react";
import { AlertDialog as Primitive } from "radix-ui";
import { cn } from "@/lib/utils";
import { buttonVariants } from "./button";
export const AlertDialog = Primitive.Root;
export const AlertDialogTrigger = Primitive.Trigger;
export function AlertDialogContent({
  className,
  ...props
}: React.ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <Primitive.Overlay
        data-slot="alert-dialog-overlay"
        className="fixed inset-0 z-[60] bg-foreground/45 backdrop-blur-sm data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:duration-100 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:duration-150 motion-reduce:animate-none"
      />
      <Primitive.Content
        data-slot="alert-dialog-content"
        className={cn(
          "fixed left-1/2 top-1/2 z-[70] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-panel)] border bg-background p-6 shadow-xl outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=closed]:duration-100 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:duration-150 motion-reduce:animate-none",
          className,
        )}
        {...props}
      />
    </Primitive.Portal>
  );
}
export const AlertDialogHeader = ({
  className,
  ...props
}: React.ComponentProps<"div">) => (
  <div className={cn("space-y-2", className)} {...props} />
);
export const AlertDialogFooter = ({
  className,
  ...props
}: React.ComponentProps<"div">) => (
  <div className={cn("mt-6 flex justify-end gap-2", className)} {...props} />
);
export const AlertDialogTitle = ({
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
export const AlertDialogDescription = ({
  className,
  ...props
}: React.ComponentProps<typeof Primitive.Description>) => (
  <Primitive.Description
    className={cn("text-sm leading-relaxed text-muted-foreground", className)}
    {...props}
  />
);
export const AlertDialogAction = ({
  className,
  ...props
}: React.ComponentProps<typeof Primitive.Action>) => (
  <Primitive.Action className={cn(buttonVariants(), className)} {...props} />
);
export const AlertDialogCancel = ({
  className,
  ...props
}: React.ComponentProps<typeof Primitive.Cancel>) => (
  <Primitive.Cancel
    className={cn(buttonVariants({ variant: "outline" }), className)}
    {...props}
  />
);
