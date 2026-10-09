export type UrlFilterValue = string | number | null | undefined;

export function readUrlFilter(key: string, fallback = "") {
  if (typeof window === "undefined") return fallback;
  return new URLSearchParams(window.location.search).get(key) ?? fallback;
}

export function pushUrlFilters(values: Record<string, UrlFilterValue>) {
  writeUrlFilters("push", values);
}

export function replaceUrlFilters(values: Record<string, UrlFilterValue>) {
  writeUrlFilters("replace", values);
}

function writeUrlFilters(
  mode: "push" | "replace",
  values: Record<string, UrlFilterValue>,
) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(values)) {
    if (value === null || value === undefined || value === "" || value === "all")
      url.searchParams.delete(key);
    else url.searchParams.set(key, String(value));
  }
  const next = `${url.pathname}${url.search}${url.hash}`;
  window.history[`${mode}State`](null, "", next);
  window.dispatchEvent(new Event("thoock:urlchange"));
}

export function urlFilterCount(values: Array<string | boolean | null | undefined>) {
  return values.filter((value) => Boolean(value && value !== "all")).length;
}
