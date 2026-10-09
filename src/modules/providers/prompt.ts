import "server-only";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import type {
  CommercialPromptBrief,
  CommercialPromptResult,
  PromptGenerationProvider,
} from "./contracts";
import {
  openAITextModel,
  requestOpenAIStructuredOutput,
} from "./openai-text";

const resultSchema = z.object({
  prompt: z.string().min(40).max(4_000),
  negativePrompt: z.string().min(5).max(2_000),
  rationale: z.string().min(10).max(1_000),
});

const openAIPromptJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["prompt", "negativePrompt", "rationale"],
  properties: {
    prompt: { type: "string", minLength: 40, maxLength: 4_000 },
    negativePrompt: { type: "string", minLength: 5, maxLength: 2_000 },
    rationale: { type: "string", minLength: 10, maxLength: 1_000 },
  },
} as const;

export class DeterministicPromptProvider implements PromptGenerationProvider {
  readonly id = "mock-prompt";
  readonly label = "Deterministic prompt builder";
  readonly model = "deterministic-prompt-v1";
  isConfigured() {
    return true;
  }
  async generate(
    input: CommercialPromptBrief,
  ): Promise<CommercialPromptResult> {
    const supporting = input.supportingSubjects.trim()
      ? ` Supporting details: ${input.supportingSubjects.trim()}.`
      : "";
    const representation = input.representationNotes.trim()
      ? ` Representation: ${input.representationNotes.trim()}.`
      : "";
    return {
      prompt:
        `${input.visualStyle.trim()} of ${input.mainSubject.trim()} in ${input.environment.trim()}. Designed for ${input.intendedUsage.trim()} by ${input.targetBuyer.trim()} in ${input.targetMarket.trim()}.${supporting} ${input.orientation.trim()} composition, ${input.composition.trim()}, copy space ${input.copySpaceLocation.trim()}, ${input.lighting.trim()}, ${input.mood.trim()} mood.${representation} Commercially useful, realistic details, visually coherent subject and background, no visible brands or embedded typography.`
          .replaceAll(/\s+/g, " ")
          .trim(),
      negativePrompt:
        `${input.prohibitedElements.trim()}, logos, trademarks, watermarks, legible text, malformed hands, extra fingers, distorted anatomy, inconsistent reflections, duplicated objects, oversharpening, compression artifacts`
          .replaceAll(/\s+/g, " ")
          .trim(),
      rationale: `The prompt prioritizes the intended buyer and usage, preserves the requested composition and copy space, and converts prohibited elements into explicit negative constraints.`,
    };
  }
}

export class GeminiPromptProvider implements PromptGenerationProvider {
  readonly id = "gemini-prompt";
  readonly label = "Gemini commercial prompt writer";
  get model() {
    return process.env.GEMINI_TEXT_MODEL ?? "gemini-2.5-flash";
  }
  isConfigured() {
    return Boolean(process.env.GEMINI_API_KEY);
  }
  async generate(
    input: CommercialPromptBrief,
  ): Promise<CommercialPromptResult> {
    if (!this.isConfigured())
      throw new Error("GEMINI_API_KEY is not configured.");
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
    const response = await ai.models.generateContent({
      model: this.model,
      contents: `Create one production-ready commercial stock-image prompt from this structured brief. Return JSON with prompt, negativePrompt, and rationale. The prompt must describe only visible content and art direction, prioritize commercial usefulness and copy space, avoid artist names, brands, copyrighted characters, news-event implications, camera-setting spam, and claims that cannot be visually verified. The negative prompt must reinforce the prohibited elements and common image defects. Brief: ${JSON.stringify(input)}`,
      config: { responseMimeType: "application/json" },
    });
    return resultSchema.parse(JSON.parse(response.text ?? "{}"));
  }
}

export class OpenAIPromptProvider implements PromptGenerationProvider {
  readonly id = "openai-prompt";
  readonly label = "OpenAI commercial prompt writer";
  get model() {
    return openAITextModel();
  }
  isConfigured() {
    return Boolean(process.env.OPENAI_API_KEY);
  }
  async generate(input: CommercialPromptBrief) {
    const response = await requestOpenAIStructuredOutput({
      model: this.model,
      schemaName: "commercial_image_prompt",
      schema: openAIPromptJsonSchema,
      instructions:
        "Write one commercially useful stock-image generation prompt from a structured brief. Describe visible content and art direction only. Avoid brands, artist names, copyrighted properties, famous people, misleading news implications, embedded typography, camera-setting spam, and unverifiable claims.",
      prompt: `Create the prompt, negative prompt, and a concise rationale for this brief: ${JSON.stringify(input)}`,
      maxOutputTokens: 2_500,
      parse: (value) => resultSchema.parse(value),
    });
    return response.data;
  }
}

export function createPromptProvider(
  providerId: string,
): PromptGenerationProvider {
  const providers: PromptGenerationProvider[] = [
    new DeterministicPromptProvider(),
    new GeminiPromptProvider(),
    new OpenAIPromptProvider(),
  ];
  const provider = providers.find((candidate) => candidate.id === providerId);
  if (!provider) throw new Error(`Unknown prompt provider: ${providerId}`);
  return provider;
}
