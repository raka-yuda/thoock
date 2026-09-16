import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "badge-raised inline-flex items-center gap-1 border px-2.5 py-0.5 text-[11px] font-semibold leading-5",
  {
    variants: {
      variant: {
        default: "border-primary/20 bg-primary/12 text-primary",
        secondary: "border-border bg-secondary text-secondary-foreground",
        outline: "border-border bg-card text-foreground",
        destructive: "border-destructive/20 bg-destructive/10 text-destructive",
        success:
          "border-emerald-600/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
        warning:
          "border-amber-600/20 bg-amber-500/10 text-amber-700 dark:text-amber-400",
      },
    },
    defaultVariants: { variant: "default" },
  },
);
export function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}
