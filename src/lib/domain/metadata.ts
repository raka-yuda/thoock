import { z } from "zod";
import { ADOBE_CATEGORY_CODES } from "./adobe-categories";

export const DEFAULT_PROHIBITED_TERMS = [
  "generative ai",
  "midjourney",
  "stable diffusion",
  "--ar",
  "--stylize",
  "disney",
  "marvel",
  "star wars",
  "harry potter",
  "pokemon",
];

// Conservative function-word list for Adobe's comma-separated, single-word
// keyword format. Content words remain in their original relevance order.
const KEYWORD_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "been",
  "being",
  "but",
  "by",
  "dan",
  "dari",
  "dengan",
  "di",
  "for",
  "from",
  "had",
  "has",
  "have",
  "in",
  "ini",
  "is",
  "it",
  "its",
  "itu",
  "ke",
  "of",
  "on",
  "or",
  "atau",
  "oleh",
  "pada",
  "sebagai",
  "that",
  "the",
  "these",
  "this",
  "those",
  "to",
  "untuk",
  "was",
  "were",
  "with",
  "without",
  "yang",
]);

export function normalizeFilename(input: string) {
  const withoutExtension = input.replace(/\.[^/.]+$/, "");
  const safe =
    withoutExtension
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "stock-image";
  return `${safe.slice(0, 26).replace(/-+$/g, "")}.jpg`;
}

export function normalizeKeywords(input: string | string[]) {
  const values = Array.isArray(input) ? input : input.split(",");
  const seen = new Set<string>();
  return values
    .flatMap(
      (value) =>
        value
          .normalize("NFKC")
          .toLowerCase()
          .match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)?/gu) ?? [],
    )
    .map((value) => value.replaceAll("’", "'"))
    .filter((value) => {
      if (!value || KEYWORD_STOP_WORDS.has(value) || seen.has(value))
        return false;
      seen.add(value);
      return true;
    })
    .slice(0, 50);
}

export function findProhibitedTerms(
  text: string,
  terms = DEFAULT_PROHIBITED_TERMS,
) {
  const value = text.toLowerCase();
  return terms.filter((term) => value.includes(term.toLowerCase()));
}

export const assetMetadataSchema = z
  .object({
    filename: z
      .string()
      .min(5)
      .max(30)
      .regex(/\.jpe?g$/i, "Filename must end in .jpg or .jpeg"),
    title: z.string().trim().min(5).max(70),
    category: z.enum(ADOBE_CATEGORY_CODES, {
      error: "Select a valid Adobe Stock category",
    }),
    language: z.string().trim().min(2),
    keywords: z.preprocess(
      (value) => {
        if (typeof value === "string") return normalizeKeywords(value);
        if (
          Array.isArray(value) &&
          value.every((keyword) => typeof keyword === "string")
        )
          return normalizeKeywords(value);
        return value;
      },
      z.array(z.string().trim().min(1)).min(5).max(50),
    ),
    generativeAi: z.boolean(),
    fictionalPeopleProperty: z.boolean(),
    internalNotes: z.string().max(2_000).optional(),
  })
  .superRefine((metadata, context) => {
    const titleProblems = findProhibitedTerms(metadata.title);
    if (titleProblems.length)
      context.addIssue({
        code: "custom",
        path: ["title"],
        message: `Title contains prohibited terms: ${titleProblems.join(", ")}`,
      });
    if (
      /\b(?:cfg|steps|seed|sampler|aspect ratio|4k|8k|prompt)\b/i.test(
        metadata.title,
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["title"],
        message: "Title contains technical prompt wording",
      });
    }
  });

export type AssetMetadata = z.infer<typeof assetMetadataSchema>;
export type AssetMetadataCandidate = Omit<AssetMetadata, "category"> & {
  category: string;
};

export function validateAdobeMetadata(
  input: AssetMetadataCandidate,
  prohibitedTerms = DEFAULT_PROHIBITED_TERMS,
) {
  const result = assetMetadataSchema.safeParse(input);
  const prohibited = findProhibitedTerms(
    `${input.title} ${input.keywords.join(" ")}`,
    prohibitedTerms,
  );
  return {
    valid: result.success && prohibited.length === 0,
    errors: result.success
      ? []
      : result.error.issues.map((issue) => issue.message),
    prohibited,
  };
}
