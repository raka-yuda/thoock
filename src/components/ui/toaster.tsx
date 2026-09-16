"use client";
import * as React from "react";
import { CheckCircle2, X } from "lucide-react";
import { Toast as Primitive } from "radix-ui";
export function Toaster() {
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("stocklab:demo-toast", handler);
    return () => window.removeEventListener("stocklab:demo-toast", handler);
  }, []);
  return (
    <Primitive.Provider swipeDirection="right">
      <Primitive.Root
        open={open}
        onOpenChange={setOpen}
        className="fixed bottom-5 right-5 z-50 grid w-[360px] grid-cols-[auto_1fr_auto] items-start gap-3 rounded-[var(--radius-panel)] border bg-background p-4 shadow-xl"
      >
        <CheckCircle2 className="mt-0.5 size-4 text-primary" />
        <div>
          <Primitive.Title className="text-sm font-semibold">
            Action recorded
          </Primitive.Title>
          <Primitive.Description className="mt-1 text-xs text-muted-foreground">
            Demo mode keeps this interaction local until PostgreSQL is
            configured.
          </Primitive.Description>
        </div>
        <Primitive.Close aria-label="Close">
          <X className="size-4" />
        </Primitive.Close>
      </Primitive.Root>
      <Primitive.Viewport />
    </Primitive.Provider>
  );
}
