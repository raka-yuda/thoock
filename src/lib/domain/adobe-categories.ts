export const ADOBE_CATEGORY_CODES = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "11",
  "12",
  "13",
  "14",
  "15",
  "16",
  "17",
  "18",
  "19",
  "20",
  "21",
] as const;

export type AdobeCategoryCode = (typeof ADOBE_CATEGORY_CODES)[number];

/**
 * Labels and portal keys captured from the Adobe Contributor category selector.
 * Adobe CSV exports use the positional category code (1–21), not portalKey.
 */
export const ADOBE_STOCK_CATEGORIES: ReadonlyArray<{
  code: AdobeCategoryCode;
  label: string;
  portalKey: string;
}> = [
  { code: "1", label: "Animals", portalKey: "10001" },
  { code: "2", label: "Buildings and Architecture", portalKey: "10092" },
  { code: "3", label: "Business", portalKey: "10162" },
  { code: "4", label: "Drinks", portalKey: "10209" },
  { code: "5", label: "The Environment", portalKey: "10235" },
  { code: "6", label: "States of Mind", portalKey: "10255" },
  { code: "7", label: "Food", portalKey: "10283" },
  { code: "8", label: "Graphic Resources", portalKey: "10432" },
  { code: "9", label: "Hobbies and Leisure", portalKey: "10486" },
  { code: "10", label: "Industry", portalKey: "10556" },
  { code: "11", label: "Landscapes", portalKey: "10584" },
  { code: "12", label: "Lifestyle", portalKey: "10631" },
  { code: "13", label: "People", portalKey: "10683" },
  { code: "14", label: "Plants and Flowers", portalKey: "10733" },
  { code: "15", label: "Culture and Religion", portalKey: "10778" },
  { code: "16", label: "Science", portalKey: "10797" },
  { code: "17", label: "Social Issues", portalKey: "10834" },
  { code: "18", label: "Sports", portalKey: "10868" },
  { code: "19", label: "Technology", portalKey: "10927" },
  { code: "20", label: "Transport", portalKey: "10958" },
  { code: "21", label: "Travel", portalKey: "10988" },
];

export function normalizeAdobeCategory(
  value: string | number | null | undefined,
): AdobeCategoryCode | null {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim().toLocaleLowerCase();
  if (!normalized) return null;
  const category = ADOBE_STOCK_CATEGORIES.find(
    (item) =>
      item.code === normalized ||
      item.portalKey === normalized ||
      item.label.toLocaleLowerCase() === normalized ||
      (item.code === "11" && normalized === "landscape"),
  );
  return category?.code ?? null;
}

export function getAdobeCategoryLabel(code: string) {
  return ADOBE_STOCK_CATEGORIES.find((item) => item.code === code)?.label ?? null;
}
