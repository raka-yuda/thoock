import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-control)] border text-sm font-semibold outline-none transition-[transform,filter,background-color,border-color,box-shadow,color] duration-200 ease-out focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 active:translate-y-px [&_svg]:size-4",
  {
    variants: {
      variant: {
        default: "button-primary text-white",
        destructive:
          "border-destructive/80 bg-destructive text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.2),0_2px_4px_rgb(80_10_10/0.22)] hover:brightness-105",
        danger:
          "control-raised border-destructive/25 bg-destructive/5 text-destructive hover:-translate-y-px hover:border-destructive/40 hover:bg-destructive/10 active:translate-y-px dark:bg-destructive/10 dark:hover:bg-destructive/15",
        outline:
          "control-raised border-input bg-card text-foreground hover:-translate-y-px hover:border-primary/30 hover:bg-muted/55 active:translate-y-px",
        secondary:
          "control-raised border-border bg-secondary text-secondary-foreground hover:-translate-y-px hover:bg-secondary/75 active:translate-y-px",
        accent:
          "control-raised border-primary/35 bg-accent text-accent-foreground hover:-translate-y-px hover:border-primary/55 hover:bg-accent/80 active:translate-y-px",
        ghost:
          "border-transparent text-muted-foreground shadow-none hover:bg-muted hover:text-foreground",
        link:
          "border-transparent text-primary shadow-none underline-offset-4 hover:underline",
      },
      size: {
        default: "h-[var(--control-height)] px-4",
        sm: "h-[var(--control-height-compact)] rounded-[var(--radius-control-compact)] px-3 text-xs",
        lg: "h-[var(--control-height-large)] px-6",
        icon: "size-[var(--control-height)]",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { buttonVariants };
