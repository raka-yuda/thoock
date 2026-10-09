import "server-only";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { appLogger } from "@/lib/server/logger";
import type {
  BriefGenerationProvider,
  BriefGenerationRequest,
  CommercialPromptBrief,
  GeneratedCommercialBrief,
} from "./contracts";
import { DeterministicPromptProvider } from "./prompt";
import {
  openAITextModel,
  requestOpenAIStructuredOutput,
} from "./openai-text";

const generatedBriefSchema = z.object({
  name: z.string().min(3).max(160),
  targetBuyer: z.string().min(2).max(500),
  intendedUsage: z.string().min(2).max(500),
  targetMarket: z.string().min(2).max(100),
  mainSubject: z.string().min(5).max(1_000),
  supportingSubjects: z.string().max(1_000),
  environment: z.string().min(2).max(500),
  visualStyle: z.string().min(2).max(500),
  orientation: z.enum(["horizontal", "square", "vertical"]),
  composition: z.string().min(2).max(500),
  copySpaceLocation: z.string().min(2).max(100),
  lighting: z.string().min(2).max(500),
  mood: z.string().min(2).max(200),
  representationNotes: z.string().max(1_000),
  prohibitedElements: z.string().max(1_000),
  generationPrompt: z.string().min(40).max(4_000),
  negativePrompt: z.string().min(5).max(2_000),
  rationale: z.string().min(10).max(1_000),
  metadataTitle: z.string().min(5).max(70),
  metadataCategory: z.string().min(1).max(80),
  metadataKeywords: z.string().min(5).max(2_000),
  metadataLanguage: z.string().min(2).max(10).default("en"),
  metadataFictionalPeopleProperty: z.boolean().default(false),
  metadataNotes: z.string().max(2_000).default(""),
});
const generatedBriefsSchema = z.array(generatedBriefSchema).min(1).max(12);

type BriefOrientation = GeneratedCommercialBrief["orientation"];

const presetOrientations: Record<string, BriefOrientation> = {
  "horizontal website banner": "horizontal",
  "square social-media image": "square",
  "vertical mobile advertisement": "vertical",
};

function getPresetOrientation(preset?: string): BriefOrientation | null {
  if (!preset) return null;
  return presetOrientations[preset.trim().toLowerCase()] ?? null;
}

function describePresetRequirement(preset?: string) {
  if (!preset) return "No creative preset was selected.";
  const orientation = getPresetOrientation(preset);
  if (!orientation)
    return `The selected creative preset is "${preset}". Treat it as a required creative direction for every brief.`;
  return `The selected creative preset is "${preset}". It is mandatory: EVERY brief must use the "${orientation}" orientation and its composition, copy space, intended usage, and generation prompt must be suitable for that ${orientation} format.`;
}

function applyPresetConstraints(
  briefs: GeneratedCommercialBrief[],
  preset?: string,
) {
  const orientation = getPresetOrientation(preset);
  if (!orientation) return briefs;
  return briefs.map((brief) => ({ ...brief, orientation }));
}

const briefProperties = {
  name: { type: "string", minLength: 3, maxLength: 160 },
  targetBuyer: { type: "string", minLength: 2, maxLength: 500 },
  intendedUsage: { type: "string", minLength: 2, maxLength: 500 },
  targetMarket: { type: "string", minLength: 2, maxLength: 100 },
  mainSubject: { type: "string", minLength: 5, maxLength: 1_000 },
  supportingSubjects: { type: "string", maxLength: 1_000 },
  environment: { type: "string", minLength: 2, maxLength: 500 },
  visualStyle: { type: "string", minLength: 2, maxLength: 500 },
  orientation: { type: "string", enum: ["horizontal", "square", "vertical"] },
  composition: { type: "string", minLength: 2, maxLength: 500 },
  copySpaceLocation: { type: "string", minLength: 2, maxLength: 100 },
  lighting: { type: "string", minLength: 2, maxLength: 500 },
  mood: { type: "string", minLength: 2, maxLength: 200 },
  representationNotes: { type: "string", maxLength: 1_000 },
  prohibitedElements: { type: "string", maxLength: 1_000 },
  generationPrompt: { type: "string", minLength: 40, maxLength: 4_000 },
  negativePrompt: { type: "string", minLength: 5, maxLength: 2_000 },
  rationale: { type: "string", minLength: 10, maxLength: 1_000 },
  metadataTitle: { type: "string", minLength: 5, maxLength: 70 },
  metadataCategory: { type: "string", minLength: 1, maxLength: 80 },
  metadataKeywords: { type: "string", minLength: 5, maxLength: 2_000 },
  metadataLanguage: { type: "string", minLength: 2, maxLength: 10 },
  metadataFictionalPeopleProperty: { type: "boolean" },
  metadataNotes: { type: "string", maxLength: 2_000 },
} as const;

function createOpenAIBriefsJsonSchema(count: number, preset?: string) {
  const orientation = getPresetOrientation(preset);
  return {
    type: "object",
    additionalProperties: false,
    required: ["briefs"],
    properties: {
      briefs: {
        type: "array",
        minItems: count,
        maxItems: count,
        items: {
          type: "object",
          additionalProperties: false,
          required: Object.keys(briefProperties),
          properties: {
            ...briefProperties,
            orientation: {
              ...briefProperties.orientation,
              enum: orientation
                ? [orientation]
                : briefProperties.orientation.enum,
            },
          },
        },
      },
    },
  } as const;
}

const concepts = [
  {
    label: "daily decision",
    buyer: "Brand and content marketing teams",
    usage: "Website hero, campaign article, and presentation",
    orientation: "horizontal",
    composition: "Subject on the right third with a clean visual path",
    copy: "left",
  },
  {
    label: "small business moment",
    buyer: "Small-business and financial-service marketers",
    usage: "Social advertising and product education",
    orientation: "square",
    composition: "Centered action with a simple, uncluttered background",
    copy: "upper left",
  },
  {
    label: "mobile-first lifestyle",
    buyer: "Consumer-app and retail marketing teams",
    usage: "Vertical mobile advertisement and story placement",
    orientation: "vertical",
    composition: "Natural human gesture in the lower two thirds",
    copy: "upper third",
  },
  {
    label: "presentation background",
    buyer: "Corporate communications and editorial teams",
    usage: "Presentation cover and report background",
    orientation: "horizontal",
    composition: "Environmental detail on one edge with generous negative space",
    copy: "center left",
  },
] as const;

export class MockBriefGenerationProvider implements BriefGenerationProvider {
  readonly id = "mock-brief-ai";
  readonly label = "Deterministic brief builder";
  readonly model = "deterministic-brief-v1";
  isConfigured() {
    return true;
  }
  async generate(input: BriefGenerationRequest): Promise<GeneratedCommercialBrief[]> {
    const promptProvider = new DeterministicPromptProvider();
    const briefs = await Promise.all(
      Array.from({ length: input.count }, async (_, index) => {
        const concept = concepts[index % concepts.length];
        const brief: CommercialPromptBrief = {
          name: `${input.opportunity.keyword}: ${concept.label}`.slice(0, 160),
          targetBuyer: concept.buyer,
          intendedUsage: concept.usage,
          targetMarket: input.opportunity.targetRegion,
          mainSubject: `A believable commercial scene showing ${input.opportunity.keyword.toLowerCase()} through a ${concept.label} moment`,
          supportingSubjects: "Contextual everyday objects, natural human interaction, useful environmental detail",
          environment: `Contemporary setting appropriate to ${input.opportunity.targetRegion}`,
          visualStyle: "Natural, polished commercial lifestyle photography",
          orientation: getPresetOrientation(input.preset) ?? concept.orientation,
          composition: concept.composition,
          copySpaceLocation: concept.copy,
          lighting: "Soft directional daylight with realistic contrast",
          mood: "Credible, useful, optimistic",
          representationNotes: `Authentic representation appropriate to ${input.opportunity.targetRegion}; avoid stereotypes`,
          prohibitedElements: "Logos, trademarks, legible text, famous people, copyrighted characters, misleading news context",
        };
        const prompts = await promptProvider.generate(brief);
        return {
          ...brief,
          generationPrompt: prompts.prompt,
          negativePrompt: prompts.negativePrompt,
          rationale: prompts.rationale,
          metadataTitle: brief.name.slice(0, 70),
          metadataCategory: "",
          metadataKeywords: "",
          metadataLanguage: "en",
          metadataFictionalPeopleProperty: false,
          metadataNotes: "Complete the Adobe metadata plan before approval.",
        };
      }),
    );
    return applyPresetConstraints(briefs, input.preset);
  }
}

export class GeminiBriefGenerationProvider implements BriefGenerationProvider {
  readonly id = "gemini-brief-ai";
  readonly label = "Gemini commercial brief writer";
  get model() {
    return process.env.GEMINI_TEXT_MODEL ?? "gemini-2.5-flash";
  }
  isConfigured() {
    return Boolean(process.env.GEMINI_API_KEY);
  }
  async generate(input: BriefGenerationRequest): Promise<GeneratedCommercialBrief[]> {
    if (!this.isConfigured()) throw new Error("GEMINI_API_KEY is not configured.");
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
    const response = await ai.models.generateContent({
      model: this.model,
      contents: `Create ${input.count} genuinely distinct, production-ready commercial stock-image briefs from this opportunity: ${JSON.stringify(input.opportunity)}. ${describePresetRequirement(input.preset)} Return a JSON array with name, targetBuyer, intendedUsage, targetMarket, mainSubject, supportingSubjects as a comma-separated string, environment, visualStyle, orientation (horizontal, square, or vertical), composition, copySpaceLocation, lighting, mood, representationNotes, prohibitedElements as a comma-separated string, generationPrompt, negativePrompt, rationale, metadataTitle, metadataCategory, metadataKeywords as a pipe-separated relevance-ordered list, metadataLanguage, metadataFictionalPeopleProperty, and metadataNotes. Adobe category must be one of the current category names or codes. Every brief needs a different buyer use, scene, composition, and visual concept—not minor prompt variants. Prompts describe visible content, preserve useful copy space, and avoid brands, artist names, copyrighted properties, famous people, embedded typography, unverifiable claims, and misleading news context.`,
      config: { responseMimeType: "application/json" },
    });
    return applyPresetConstraints(
      generatedBriefsSchema.parse(JSON.parse(response.text ?? "[]")),
      input.preset,
    );
  }
}

export class OpenAIBriefGenerationProvider
  implements BriefGenerationProvider
{
  readonly id = "openai-brief-ai";
  readonly label = "OpenAI commercial brief writer";
  get model() {
    return openAITextModel();
  }
  isConfigured() {
    return Boolean(process.env.OPENAI_API_KEY);
  }
  async generate(input: BriefGenerationRequest) {
    const response = await requestOpenAIStructuredOutput({
      model: this.model,
      schemaName: "commercial_stock_briefs",
      schema: createOpenAIBriefsJsonSchema(input.count, input.preset),
      instructions:
        "You create commercially useful, production-ready stock-image briefs. Concepts must be visually distinct, editable, IP-safe, and suitable for human review. Never include brands, artist names, celebrities, copyrighted properties, misleading news context, or unsupported claims.",
      prompt: `Create exactly ${input.count} distinct briefs from this researched opportunity: ${JSON.stringify(input.opportunity)}. ${describePresetRequirement(input.preset)} Every brief must differ in buyer use, scene, composition, and visual story—not merely wording. metadataKeywords must be a pipe-separated, relevance-ordered list of useful nouns, adjectives, actions, concepts, uses, and locations without conjunction filler. metadataCategory must be a valid Adobe Stock category name or code. Include practical copy space and complete every field.`,
      parse: (value) =>
        generatedBriefsSchema.parse(
          z.object({ briefs: z.array(z.unknown()) }).parse(value).briefs,
        ),
    });
    if (response.data.length < input.count)
      throw new Error(
        `OpenAI returned ${response.data.length} briefs; expected ${input.count}.`,
      );
    if (response.data.length > input.count)
      appLogger.warn("provider.response.surplus_items", {
        provider: this.id,
        model: this.model,
        operation: "brief_generation",
        expectedCount: input.count,
        receivedCount: response.data.length,
        action: "trimmed_surplus",
      });
    return applyPresetConstraints(
      response.data.slice(0, input.count),
      input.preset,
    );
  }
}

export function createBriefGenerationProvider(id: string): BriefGenerationProvider {
  const providers: BriefGenerationProvider[] = [
    new MockBriefGenerationProvider(),
    new GeminiBriefGenerationProvider(),
    new OpenAIBriefGenerationProvider(),
  ];
  const provider = providers.find((item) => item.id === id);
  if (!provider) throw new Error(`Unknown brief generation provider: ${id}`);
  return provider;
}

export { generatedBriefsSchema };
