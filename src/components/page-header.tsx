import type { ReactNode } from "react";
export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[.08em] text-primary">{eyebrow}</p>
        )}
        <h1 className="text-[length:var(--font-size-page-title)] font-semibold leading-[var(--line-height-heading)] tracking-[-.04em]">
          {title}
        </h1>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap gap-2.5">{actions}</div>
      )}
    </header>
  );
}
