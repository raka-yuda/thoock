import "server-only";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import type {
  BriefGenerationProvider,
  BriefGenerationRequest,
  CommercialPromptBrief,
  GeneratedCommercialBrief,
} from "./contracts";
import { DeterministicPromptProvider } from "./prompt";

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
  isConfigured() {
    return true;
  }
  async generate(input: BriefGenerationRequest): Promise<GeneratedCommercialBrief[]> {
    const promptProvider = new DeterministicPromptProvider();
    return Promise.all(
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
          orientation: concept.orientation,
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
  }
}

export class GeminiBriefGenerationProvider implements BriefGenerationProvider {
  readonly id = "gemini-brief-ai";
  readonly label = "Gemini commercial brief writer";
  isConfigured() {
    return Boolean(process.env.GEMINI_API_KEY);
  }
  async generate(input: BriefGenerationRequest): Promise<GeneratedCommercialBrief[]> {
    if (!this.isConfigured()) throw new Error("GEMINI_API_KEY is not configured.");
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
    const response = await ai.models.generateContent({
      model: process.env.GEMINI_TEXT_MODEL ?? "gemini-2.5-flash",
      contents: `Create ${input.count} genuinely distinct, production-ready commercial stock-image briefs from this opportunity: ${JSON.stringify(input.opportunity)}. Optional preset: ${input.preset || "none"}. Return a JSON array with name, targetBuyer, intendedUsage, targetMarket, mainSubject, supportingSubjects as a comma-separated string, environment, visualStyle, orientation (horizontal, square, or vertical), composition, copySpaceLocation, lighting, mood, representationNotes, prohibitedElements as a comma-separated string, generationPrompt, negativePrompt, rationale, metadataTitle, metadataCategory, metadataKeywords as a pipe-separated relevance-ordered list, metadataLanguage, metadataFictionalPeopleProperty, and metadataNotes. Adobe category must be one of the current category names or codes. Every brief needs a different buyer use, scene, composition, and visual concept—not minor prompt variants. Prompts describe visible content, preserve useful copy space, and avoid brands, artist names, copyrighted properties, famous people, embedded typography, unverifiable claims, and misleading news context.`,
      config: { responseMimeType: "application/json" },
    });
    return generatedBriefsSchema.parse(JSON.parse(response.text ?? "[]"));
  }
}

export function createBriefGenerationProvider(id: string): BriefGenerationProvider {
  const providers: BriefGenerationProvider[] = [
    new MockBriefGenerationProvider(),
    new GeminiBriefGenerationProvider(),
  ];
  const provider = providers.find((item) => item.id === id);
  if (!provider) throw new Error(`Unknown brief generation provider: ${id}`);
  return provider;
}

export { generatedBriefsSchema };
