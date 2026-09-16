import type { AssetMetadata } from "@/lib/domain/metadata";

export type StoredObject = { key: string; size: number; mimeType: string };

export interface StorageProvider {
  put(key: string, data: Buffer, mimeType: string): Promise<StoredObject>;
  get(key: string): Promise<Buffer>;
  exists(key: string): Promise<boolean>;
  publicUrl(key: string): string;
}

export interface StockResearchProvider {
  readonly id: string;
  readonly label: string;
  search(
    keyword: string,
    region: string,
  ): Promise<{
    resultCount: number;
    competitionEstimate: boolean;
    relatedKeywords: string[];
    source: string;
  }>;
}

export type TopicResearchRequest = {
  seedTopic: string;
  targetRegion: string;
  type: "evergreen" | "seasonal" | "trending";
  count: number;
  portfolioContext?: string;
};

export type ResearchedTopic = {
  keyword: string;
  type: "evergreen" | "seasonal" | "trending";
  targetEventDate?: string;
  competitionEstimate: number;
  trendGrowth: number;
  commercialIntent: number;
  seasonality: number;
  portfolioPerformance: number;
  rationale: string;
  buyerUseCases: string[];
};

export interface TopicResearchProvider {
  readonly id: string;
  readonly label: string;
  isConfigured(): boolean;
  research(input: TopicResearchRequest): Promise<ResearchedTopic[]>;
}

export type CommercialPromptBrief = {
  name: string;
  targetBuyer: string;
  intendedUsage: string;
  targetMarket: string;
  mainSubject: string;
  supportingSubjects: string;
  environment: string;
  visualStyle: string;
  orientation: string;
  composition: string;
  copySpaceLocation: string;
  lighting: string;
  mood: string;
  representationNotes: string;
  prohibitedElements: string;
};

export type CommercialPromptResult = {
  prompt: string;
  negativePrompt: string;
  rationale: string;
};

export interface PromptGenerationProvider {
  readonly id: string;
  readonly label: string;
  isConfigured(): boolean;
  generate(input: CommercialPromptBrief): Promise<CommercialPromptResult>;
}

export type BriefGenerationRequest = {
  opportunity: {
    keyword: string;
    targetRegion: string;
    type: "evergreen" | "seasonal" | "trending";
    scoreExplanation: string;
  };
  count: number;
  preset?: string;
};

export type GeneratedCommercialBrief = CommercialPromptBrief & {
  generationPrompt: string;
  negativePrompt: string;
  rationale: string;
  metadataTitle: string;
  metadataCategory: string;
  metadataKeywords: string;
  metadataLanguage: string;
  metadataFictionalPeopleProperty: boolean;
  metadataNotes: string;
};

export interface BriefGenerationProvider {
  readonly id: string;
  readonly label: string;
  isConfigured(): boolean;
  generate(input: BriefGenerationRequest): Promise<GeneratedCommercialBrief[]>;
}

export type GenerationRequest = {
  prompt: string;
  negativePrompt?: string;
  model: string;
  requestedWidth: number;
  requestedHeight: number;
  aspectRatio: string;
  resolution: string;
  quality?: string;
  candidates: number;
  seed?: number;
  referenceImages?: Array<{
    buffer: Buffer;
    mimeType: string;
    filename: string;
  }>;
  importedImages?: Array<{
    buffer: Buffer;
    mimeType: string;
    filename: string;
  }>;
};

export type GeneratedImage = {
  buffer: Buffer;
  mimeType: string;
  providerRequestId: string;
  providerReportedWidth: number | null;
  providerReportedHeight: number | null;
  actualCostUsd?: number;
};

export type GenerationExecutionHooks = {
  onProviderRequestAccepted?: (
    providerRequestId: string,
    candidateIndex: number,
  ) => void | Promise<void>;
};

export interface ImageGenerationProvider {
  readonly id: string;
  readonly label: string;
  readonly paid: boolean;
  isConfigured(): boolean;
  normalizeRequestForProvider?(request: GenerationRequest): unknown;
  generate(
    request: GenerationRequest,
    hooks?: GenerationExecutionHooks,
  ): Promise<GeneratedImage[]>;
}

export interface ImageInspectionProvider {
  inspect(input: Buffer): Promise<{
    width: number;
    height: number;
    format: string;
    fileSize: number;
    megapixels: number;
    checksum: string;
    perceptualHash: string;
    hasMetadata: boolean;
  }>;
}

export type UpscaleMethod =
  "noop" | "sharp" | "local_ai" | "fast" | "conservative" | "creative";
export type UpscaleRequest = {
  input: Buffer;
  mimeType: string;
  width: number;
  height: number;
  targetWidth: number;
  targetHeight: number;
  method: UpscaleMethod;
  prompt?: string;
};

export interface ImageUpscaleProvider {
  readonly id: string;
  readonly label: string;
  readonly isAi: boolean;
  readonly mayReinterpretDetail: boolean;
  isConfigured(): boolean;
  inspectInput(
    input: Buffer,
  ): Promise<{ width: number; height: number; megapixels: number }>;
  estimateCost(request: UpscaleRequest): Promise<number | null>;
  upscale(request: UpscaleRequest): Promise<{
    id: string;
    status: "succeeded" | "running";
    buffer?: Buffer;
    actualCostUsd?: number;
  }>;
  getJobStatus(id: string): Promise<"running" | "succeeded" | "failed">;
  downloadResult(id: string): Promise<Buffer>;
}

export interface MetadataGenerationProvider {
  readonly id: string;
  readonly label: string;
  generate(input: {
    briefName: string;
    prompt: string;
    filenameHint: string;
    briefPlan?: {
      title: string;
      category: string;
      language: string;
      keywords: string[];
      fictionalPeopleProperty: boolean;
      notes: string;
    };
  }): Promise<AssetMetadata>;
}
