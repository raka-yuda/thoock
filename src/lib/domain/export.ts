import { stringify } from "csv-stringify/sync";
import {
  assetMetadataSchema,
  validateAdobeMetadata,
  type AssetMetadata,
} from "./metadata";

export const ADOBE_CSV_COLUMNS = [
  "Filename",
  "Title",
  "Keywords",
  "Category",
  "Releases",
] as const;

export function generateAdobeCsv(rows: AssetMetadata[]) {
  if (rows.length > 5_000)
    throw new Error("Adobe CSV export supports at most 5,000 rows.");
  const normalizedRows = rows.map((row) => {
    const parsed = assetMetadataSchema.safeParse(row);
    if (!parsed.success || !validateAdobeMetadata(parsed.data).valid)
      throw new Error("Adobe CSV contains invalid metadata.");
    return parsed.data;
  });
  const csv = stringify(
    normalizedRows.map((row) => ({
      Filename: row.filename,
      Title: row.title,
      Keywords: row.keywords.join(","),
      Category: row.category,
      Releases: "",
    })),
    { header: true, columns: ADOBE_CSV_COLUMNS },
  );
  if (Buffer.byteLength(csv, "utf8") > 1_000_000)
    throw new Error("Adobe CSV export must be 1MB or smaller.");
  return csv;
}
