import * as React from "react";
import { cn } from "@/lib/utils";
export function Alert({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      role="alert"
      className={cn(
        "grid grid-cols-[auto_1fr] gap-x-3 rounded-[var(--radius-panel)] border border-border bg-card p-4 text-sm [&>svg]:mt-0.5 [&>svg]:size-4",
        className,
      )}
      {...props}
    />
  );
}
export function AlertTitle({
  className,
  ...props
}: React.ComponentProps<"h5">) {
  return (
    <h5 className={cn("col-start-2 font-semibold", className)} {...props} />
  );
}
export function AlertDescription({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "col-start-2 mt-1 text-muted-foreground [&_p]:leading-relaxed",
        className,
      )}
      {...props}
    />
  );
}
