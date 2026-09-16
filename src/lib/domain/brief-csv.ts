import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import {
  commercialBriefDefaults,
  commercialBriefInputSchema,
  type CommercialBriefInput,
} from "./commercial-brief";

export const BRIEF_CSV_COLUMNS = [
  "name",
  "target_buyer",
  "intended_usage",
  "target_market",
  "main_subject",
  "supporting_subjects",
  "environment",
  "visual_style",
  "orientation",
  "composition",
  "copy_space_location",
  "lighting",
  "mood",
  "representation_notes",
  "prohibited_elements",
  "candidate_count",
  "generation_prompt",
  "negative_prompt",
  "metadata_title",
  "adobe_category",
  "metadata_keywords",
  "metadata_language",
  "fictional_people_property",
  "metadata_notes",
  "opportunity_keyword",
] as const;

type CsvColumn = (typeof BRIEF_CSV_COLUMNS)[number];
type CsvRecord = Partial<Record<CsvColumn, string>>;

export type BriefCsvError = {
  row: number;
  field: string;
  message: string;
};

export type ParsedBriefCsvRow = {
  row: number;
  opportunityKeyword: string | null;
  brief: CommercialBriefInput;
};

const camelToCsv: Record<string, CsvColumn> = {
  name: "name",
  targetBuyer: "target_buyer",
  intendedUsage: "intended_usage",
  targetMarket: "target_market",
  mainSubject: "main_subject",
  supportingSubjects: "supporting_subjects",
  environment: "environment",
  visualStyle: "visual_style",
  orientation: "orientation",
  composition: "composition",
  copySpaceLocation: "copy_space_location",
  lighting: "lighting",
  mood: "mood",
  representationNotes: "representation_notes",
  prohibitedElements: "prohibited_elements",
  candidateCount: "candidate_count",
  generationPrompt: "generation_prompt",
  negativePrompt: "negative_prompt",
  metadataTitle: "metadata_title",
  metadataCategory: "adobe_category",
  metadataKeywords: "metadata_keywords",
  metadataLanguage: "metadata_language",
  metadataFictionalPeopleProperty: "fictional_people_property",
  metadataNotes: "metadata_notes",
  opportunityId: "opportunity_keyword",
};

function parseBoolean(value: string | undefined) {
  if (!value?.trim()) return false;
  const normalized = value.trim().toLocaleLowerCase();
  if (["true", "yes", "1"].includes(normalized)) return true;
  if (["false", "no", "0"].includes(normalized)) return false;
  return value;
}

function splitList(value: string | undefined, fallback: string[]) {
  if (!value?.trim()) return [...fallback];
  const seen = new Set<string>();
  return value
    .split("|")
    .map((item) => item.trim())
    .filter((item) => {
      const normalized = item.toLocaleLowerCase();
      if (!item || seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
}

export function generateBriefCsvTemplate() {
  return stringify([], { header: true, columns: BRIEF_CSV_COLUMNS });
}

export function parseBriefCsv(csv: string): {
  rows: ParsedBriefCsvRow[];
  errors: BriefCsvError[];
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
  const errors: BriefCsvError[] = [];
  const duplicates = headers.filter(
    (header, index) => headers.indexOf(header) !== index,
  );
  for (const header of new Set(duplicates))
    errors.push({ row: 1, field: header, message: "Duplicate column." });
  for (const header of headers)
    if (!BRIEF_CSV_COLUMNS.includes(header))
      errors.push({ row: 1, field: header, message: "Unknown column." });
  for (const required of ["name", "main_subject"] as const)
    if (!headers.includes(required))
      errors.push({ row: 1, field: required, message: "Required column is missing." });
  if (errors.length) return { rows: [], errors };
  if (records.length === 1)
    return {
      rows: [],
      errors: [{ row: 2, field: "csv", message: "Add at least one brief row." }],
    };
  if (records.length - 1 > 200)
    return {
      rows: [],
      errors: [{ row: 0, field: "csv", message: "Import at most 200 briefs at once." }],
    };

  const rows: ParsedBriefCsvRow[] = [];
  for (let index = 1; index < records.length; index += 1) {
    const source = Object.fromEntries(
      headers.map((header, columnIndex) => [
        header,
        records[index][columnIndex] ?? "",
      ]),
    ) as CsvRecord;
    const candidateCount = source.candidate_count?.trim()
      ? Number(source.candidate_count)
      : commercialBriefDefaults.candidateCount;
    const input = {
      name: source.name ?? "",
      targetBuyer:
        source.target_buyer || commercialBriefDefaults.targetBuyer,
      intendedUsage:
        source.intended_usage || commercialBriefDefaults.intendedUsage,
      targetMarket:
        source.target_market || commercialBriefDefaults.targetMarket,
      mainSubject: source.main_subject ?? "",
      supportingSubjects: splitList(
        source.supporting_subjects,
        commercialBriefDefaults.supportingSubjects,
      ),
      environment: source.environment || commercialBriefDefaults.environment,
      visualStyle: source.visual_style || commercialBriefDefaults.visualStyle,
      orientation: (source.orientation || commercialBriefDefaults.orientation).toLocaleLowerCase(),
      composition: source.composition || commercialBriefDefaults.composition,
      copySpaceLocation:
        source.copy_space_location || commercialBriefDefaults.copySpaceLocation,
      lighting: source.lighting || commercialBriefDefaults.lighting,
      mood: source.mood || commercialBriefDefaults.mood,
      representationNotes:
        source.representation_notes ||
        commercialBriefDefaults.representationNotes,
      prohibitedElements: splitList(
        source.prohibited_elements,
        commercialBriefDefaults.prohibitedElements,
      ),
      candidateCount,
      generationPrompt: source.generation_prompt ?? "",
      negativePrompt: source.negative_prompt ?? "",
      metadataTitle: source.metadata_title ?? "",
      metadataCategory: source.adobe_category ?? "",
      metadataKeywords: splitList(source.metadata_keywords, []),
      metadataLanguage:
        source.metadata_language || commercialBriefDefaults.metadataLanguage,
      metadataFictionalPeopleProperty: parseBoolean(
        source.fictional_people_property,
      ),
      metadataNotes: source.metadata_notes ?? "",
    };
    const parsed = commercialBriefInputSchema.safeParse(input);
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
    rows.push({
      row: index + 1,
      opportunityKeyword: source.opportunity_keyword?.trim() || null,
      brief: parsed.data,
    });
  }
  return { rows, errors };
}
