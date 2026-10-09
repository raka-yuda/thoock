"use client";

import * as React from "react";
import {
  CheckCircle2,
  CircleAlert,
  Info,
  TriangleAlert,
  X,
} from "lucide-react";
import { Toast as Primitive } from "radix-ui";
import { cn } from "@/lib/utils";

export type ToastVariant = "success" | "error" | "warning" | "info";

export type ToastInput = {
  title: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
};

type ToastRecord = Required<Pick<ToastInput, "title" | "variant">> &
  Omit<ToastInput, "title" | "variant"> & {
    id: number;
    open: boolean;
  };

type ToastListener = (toast: ToastRecord) => void;

const listeners = new Set<ToastListener>();
let queuedToasts: ToastRecord[] = [];
let toastSequence = 0;

const defaultDuration: Record<ToastVariant, number> = {
  success: 4_500,
  info: 5_000,
  warning: 6_000,
  error: 7_000,
};

const variantStyles: Record<
  ToastVariant,
  { root: string; icon: string; Icon: typeof CheckCircle2 }
> = {
  success: {
    root: "border-emerald-600/25",
    icon:
      "border-emerald-600/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
    Icon: CheckCircle2,
  },
  error: {
    root: "border-destructive/30",
    icon: "border-destructive/30 bg-destructive/10 text-destructive",
    Icon: CircleAlert,
  },
  warning: {
    root: "border-amber-500/35",
    icon:
      "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
    Icon: TriangleAlert,
  },
  info: {
    root: "border-sky-600/25",
    icon:
      "border-sky-600/25 bg-sky-500/10 text-sky-700 dark:text-sky-300",
    Icon: Info,
  },
};

export function toast({
  title,
  description,
  variant = "info",
  duration,
}: ToastInput) {
  const nextToast: ToastRecord = {
    id: ++toastSequence,
    title,
    description,
    variant,
    duration: duration ?? defaultDuration[variant],
    open: true,
  };

  if (listeners.size === 0) {
    queuedToasts = [...queuedToasts, nextToast].slice(-5);
    return;
  }

  listeners.forEach((listener) => listener(nextToast));
}

function subscribe(listener: ToastListener) {
  listeners.add(listener);
  if (queuedToasts.length > 0) {
    const pending = queuedToasts;
    queuedToasts = [];
    pending.forEach(listener);
  }
  return () => {
    listeners.delete(listener);
  };
}

export function ToastFeedback({
  message,
  title,
  variant,
  duration,
}: {
  message?: string | null;
  title: string;
  variant: ToastVariant;
  duration?: number;
}) {
  const previousMessage = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!message) {
      previousMessage.current = null;
      return;
    }
    if (message === previousMessage.current) return;
    previousMessage.current = message;
    toast({ title, description: message, variant, duration });
  }, [duration, message, title, variant]);

  return null;
}

export function Toaster() {
  const [toasts, setToasts] = React.useState<ToastRecord[]>([]);

  React.useEffect(
    () =>
      subscribe((nextToast) => {
        setToasts((current) => [...current, nextToast].slice(-5));
      }),
    [],
  );

  function closeToast(id: number) {
    setToasts((current) =>
      current.map((item) =>
        item.id === id ? { ...item, open: false } : item,
      ),
    );
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, 180);
  }

  return (
    <Primitive.Provider swipeDirection="right">
      {toasts.map((item) => {
        const style = variantStyles[item.variant];
        const Icon = style.Icon;
        return (
          <Primitive.Root
            key={item.id}
            open={item.open}
            duration={item.duration}
            onOpenChange={(open) => {
              if (!open) closeToast(item.id);
            }}
            data-variant={item.variant}
            role={item.variant === "error" ? "alert" : "status"}
            className={cn(
              "app-toast surface-raised pointer-events-auto relative grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 overflow-hidden rounded-[var(--radius-panel)] border bg-background p-3.5 shadow-[0_18px_45px_-22px_rgb(8_40_28/0.48),inset_0_1px_0_rgb(255_255_255/0.8)] dark:shadow-[0_18px_45px_-18px_rgb(0_0_0/0.72),inset_0_1px_0_rgb(255_255_255/0.08)]",
              style.root,
            )}
          >
            <span
              className={cn(
                "grid size-8 shrink-0 place-items-center rounded-[var(--radius-control-compact)] border shadow-[inset_0_1px_0_rgb(255_255_255/0.75),0_2px_5px_rgb(10_40_28/0.1)]",
                style.icon,
              )}
              aria-hidden="true"
            >
              <Icon className="size-4" />
            </span>
            <div className="min-w-0 pt-0.5">
              <Primitive.Title className="text-sm font-semibold leading-5">
                {item.title}
              </Primitive.Title>
              {item.description ? (
                <Primitive.Description className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                  {item.description}
                </Primitive.Description>
              ) : null}
            </div>
            <Primitive.Close
              aria-label="Dismiss notification"
              className="grid size-7 place-items-center rounded-[var(--radius-control-compact)] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-3.5" />
            </Primitive.Close>
          </Primitive.Root>
        );
      })}
      <Primitive.Viewport className="pointer-events-none fixed inset-x-3 bottom-3 z-[120] flex max-h-[100dvh] flex-col-reverse gap-2 outline-none sm:left-auto sm:right-5 sm:bottom-5 sm:w-[390px]" />
    </Primitive.Provider>
  );
}
