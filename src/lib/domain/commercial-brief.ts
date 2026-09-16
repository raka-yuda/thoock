import { z } from "zod";
import { ADOBE_CATEGORY_CODES, normalizeAdobeCategory } from "./adobe-categories";
import { normalizeKeywords } from "./metadata";

const metadataCategorySchema = z.preprocess(
  (value) => {
    if (typeof value !== "string" && typeof value !== "number") return value;
    const normalized = normalizeAdobeCategory(value);
    return normalized ?? String(value).trim();
  },
  z.union([z.enum(ADOBE_CATEGORY_CODES), z.literal("")]),
);

const metadataKeywordsSchema = z.preprocess(
  (value) =>
    typeof value === "string" || Array.isArray(value)
      ? normalizeKeywords(value as string | string[])
      : value,
  z.array(z.string().trim().min(1)).max(50),
);

export const commercialBriefInputSchema = z.object({
  opportunityId: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(2).max(160),
  targetBuyer: z.string().trim().min(2).max(500),
  intendedUsage: z.string().trim().min(2).max(500),
  targetMarket: z.string().trim().min(2).max(100),
  mainSubject: z.string().trim().min(2).max(1_000),
  supportingSubjects: z.array(z.string().trim().min(1)).max(30),
  environment: z.string().trim().min(2).max(500),
  visualStyle: z.string().trim().min(2).max(500),
  orientation: z.enum(["horizontal", "square", "vertical"]),
  composition: z.string().trim().min(2).max(500),
  copySpaceLocation: z.string().trim().min(2).max(100),
  lighting: z.string().trim().min(2).max(500),
  mood: z.string().trim().min(2).max(200),
  representationNotes: z.string().trim().max(1_000),
  prohibitedElements: z.array(z.string().trim().min(1)).max(30),
  candidateCount: z.number().int().min(1).max(6),
  generationPrompt: z.string().trim().max(10_000).default(""),
  negativePrompt: z.string().trim().max(10_000).default(""),
  metadataTitle: z.string().trim().max(70).default(""),
  metadataCategory: metadataCategorySchema.default(""),
  metadataLanguage: z.string().trim().min(2).max(10).default("en"),
  metadataKeywords: metadataKeywordsSchema.default([]),
  metadataFictionalPeopleProperty: z.boolean().default(false),
  metadataNotes: z.string().trim().max(2_000).default(""),
});

export type CommercialBriefInput = z.infer<typeof commercialBriefInputSchema>;

export const commercialBriefDefaults = {
  targetBuyer: "Commercial marketing teams",
  intendedUsage: "Website, social campaign, and presentation",
  targetMarket: "Indonesia",
  supportingSubjects: [] as string[],
  environment: "Contemporary everyday setting",
  visualStyle: "Natural commercial lifestyle photography",
  orientation: "horizontal" as const,
  composition: "Clear focal subject with useful negative space",
  copySpaceLocation: "left",
  lighting: "Soft natural daylight",
  mood: "Credible and optimistic",
  representationNotes: "Authentic representation; avoid stereotypes",
  prohibitedElements: ["logos", "trademarks", "legible text"],
  candidateCount: 1,
  generationPrompt: "",
  negativePrompt: "",
  metadataTitle: "",
  metadataCategory: "",
  metadataLanguage: "en",
  metadataKeywords: [] as string[],
  metadataFictionalPeopleProperty: false,
  metadataNotes: "",
};

export function completeBriefPrompts(input: CommercialBriefInput) {
  const generationPrompt =
    input.generationPrompt ||
    `${input.visualStyle} of ${input.mainSubject} in ${input.environment}. ${input.orientation} composition, ${input.composition}, with copy space ${input.copySpaceLocation}. ${input.lighting}. ${input.mood} mood. Designed for ${input.intendedUsage} in ${input.targetMarket}. No visible brands or embedded typography.`;
  const negativePrompt =
    input.negativePrompt ||
    [
      ...input.prohibitedElements,
      "logos",
      "trademarks",
      "watermarks",
      "legible text",
      "malformed anatomy",
    ]
      .filter((value, index, values) => values.indexOf(value) === index)
      .join(", ");
  return { generationPrompt, negativePrompt };
}
