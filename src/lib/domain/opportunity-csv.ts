import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import {
  calculateOpportunityScore,
  opportunityInputSchema,
  type OpportunityInput,
} from "./opportunity";

export const OPPORTUNITY_CSV_COLUMNS = [
  "keyword",
  "target_region",
  "type",
  "target_event_date",
  "competition_estimate",
  "trend_growth",
  "commercial_intent",
  "seasonality",
  "portfolio_performance",
  "research_notes",
  "buyer_use_cases",
  "research_sources",
] as const;

type CsvColumn = (typeof OPPORTUNITY_CSV_COLUMNS)[number];
type CsvRecord = Partial<Record<CsvColumn, string>>;

export type OpportunityCsvError = {
  row: number;
  field: string;
  message: string;
};

export type ParsedOpportunityCsvRow = {
  row: number;
  input: OpportunityInput;
  score: number;
  researchNotes: string;
  buyerUseCases: string[];
  researchSources: string[];
};

const requiredColumns: CsvColumn[] = [
  "keyword",
  "target_region",
  "type",
  "competition_estimate",
  "trend_growth",
  "commercial_intent",
  "seasonality",
  "portfolio_performance",
];

const camelToCsv: Record<string, CsvColumn> = {
  keyword: "keyword",
  targetRegion: "target_region",
  type: "type",
  targetEventDate: "target_event_date",
  competition: "competition_estimate",
  trendGrowth: "trend_growth",
  commercialIntent: "commercial_intent",
  seasonality: "seasonality",
  portfolioPerformance: "portfolio_performance",
};

function splitList(value: string | undefined) {
  const seen = new Set<string>();
  return (value ?? "")
    .split("|")
    .map((item) => item.trim())
    .filter((item) => {
      const normalized = item.toLocaleLowerCase();
      if (!item || seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
}

function numberValue(value: string | undefined) {
  return value?.trim() ? Number(value) : Number.NaN;
}

function isIsoCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function generateOpportunityCsvTemplate() {
  return stringify([], { header: true, columns: OPPORTUNITY_CSV_COLUMNS });
}

export function parseOpportunityCsv(csv: string): {
  rows: ParsedOpportunityCsvRow[];
  errors: OpportunityCsvError[];
} {
  let records: string[][];
  try {
    records = parse(csv, {
      bom: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: false,
      max_record_size: 100_000,
    }) as string[][];
  } catch (error) {
    return {
      rows: [],
      errors: [
        {
          row: 0,
          field: "csv",
          message:
            error instanceof Error ? error.message : "CSV could not be parsed.",
        },
      ],
    };
  }
  if (!records.length)
    return {
      rows: [],
      errors: [{ row: 1, field: "csv", message: "CSV is empty." }],
    };

  const headers = records[0].map((header) => header.trim()) as CsvColumn[];
  const errors: OpportunityCsvError[] = [];
  const duplicates = headers.filter(
    (header, index) => headers.indexOf(header) !== index,
  );
  for (const header of new Set(duplicates))
    errors.push({ row: 1, field: header, message: "Duplicate column." });
  for (const header of headers)
    if (!OPPORTUNITY_CSV_COLUMNS.includes(header))
      errors.push({ row: 1, field: header, message: "Unknown column." });
  for (const required of requiredColumns)
    if (!headers.includes(required))
      errors.push({
        row: 1,
        field: required,
        message: "Required column is missing.",
      });
  if (errors.length) return { rows: [], errors };
  if (records.length === 1)
    return {
      rows: [],
      errors: [{ row: 2, field: "csv", message: "Add at least one research topic row." }],
    };
  if (records.length - 1 > 200)
    return {
      rows: [],
      errors: [{ row: 0, field: "csv", message: "Import at most 200 topics at once." }],
    };

  const rows: ParsedOpportunityCsvRow[] = [];
  const seenTopics = new Map<string, number>();
  for (let index = 1; index < records.length; index += 1) {
    const source = Object.fromEntries(
      headers.map((header, columnIndex) => [
        header,
        records[index][columnIndex] ?? "",
      ]),
    ) as CsvRecord;
    const input = {
      keyword: source.keyword ?? "",
      targetRegion: source.target_region ?? "",
      type: (source.type ?? "").toLocaleLowerCase(),
      targetEventDate: source.target_event_date || undefined,
      competition: numberValue(source.competition_estimate),
      trendGrowth: numberValue(source.trend_growth),
      commercialIntent: numberValue(source.commercial_intent),
      seasonality: numberValue(source.seasonality),
      portfolioPerformance: numberValue(source.portfolio_performance),
    };
    const parsed = opportunityInputSchema.safeParse(input);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "row");
        errors.push({
          row: index + 1,
          field: camelToCsv[key] ?? key,
          message: issue.message,
        });
      }
      continue;
    }
    if (
      parsed.data.targetEventDate &&
      !isIsoCalendarDate(parsed.data.targetEventDate)
    ) {
      errors.push({
        row: index + 1,
        field: "target_event_date",
        message: "Use YYYY-MM-DD format.",
      });
      continue;
    }
    const topicKey = `${parsed.data.keyword.toLocaleLowerCase()}\u0000${parsed.data.targetRegion.toLocaleLowerCase()}`;
    const previousRow = seenTopics.get(topicKey);
    if (previousRow) {
      errors.push({
        row: index + 1,
        field: "keyword",
        message: `Duplicates row ${previousRow} for the same target region.`,
      });
      continue;
    }
    seenTopics.set(topicKey, index + 1);
    rows.push({
      row: index + 1,
      input: parsed.data,
      score: calculateOpportunityScore(parsed.data),
      researchNotes: source.research_notes?.trim() ?? "",
      buyerUseCases: splitList(source.buyer_use_cases),
      researchSources: splitList(source.research_sources),
    });
  }
  return { rows, errors };
}
