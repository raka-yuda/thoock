import "server-only";

type RuntimeEnvironment = Partial<
  Pick<
    NodeJS.ProcessEnv,
    "MOCK_MODE" | "OPENAI_API_KEY" | "GEMINI_API_KEY"
  >
>;

export type ResearchProviderId =
  | "mock-research-ai"
  | "gemini-research-ai"
  | "openai-research-ai";
export type BriefProviderId =
  | "mock-brief-ai"
  | "gemini-brief-ai"
  | "openai-brief-ai";
export type PromptProviderId =
  | "mock-prompt"
  | "gemini-prompt"
  | "openai-prompt";
export type MetadataProviderId =
  | "brief-metadata"
  | "mock-metadata"
  | "gemini-metadata"
  | "openai-metadata";

export function isMockModeEnabled(value: string | undefined) {
  return value?.trim().toLowerCase() !== "false";
}

export function resolveRuntimeConfig(
  environment: RuntimeEnvironment = process.env as RuntimeEnvironment,
) {
  const mockMode = isMockModeEnabled(environment.MOCK_MODE);
  const openAIConfigured = Boolean(environment.OPENAI_API_KEY?.trim());
  const geminiConfigured = Boolean(environment.GEMINI_API_KEY?.trim());

  const defaultResearchProvider: ResearchProviderId = mockMode
    ? "mock-research-ai"
    : openAIConfigured
      ? "openai-research-ai"
      : geminiConfigured
        ? "gemini-research-ai"
        : "mock-research-ai";
  const defaultBriefProvider: BriefProviderId =
    !mockMode && openAIConfigured
      ? "openai-brief-ai"
      : !mockMode && geminiConfigured
        ? "gemini-brief-ai"
        : "mock-brief-ai";
  const defaultPromptProvider: PromptProviderId =
    !mockMode && openAIConfigured
      ? "openai-prompt"
      : !mockMode && geminiConfigured
        ? "gemini-prompt"
        : "mock-prompt";
  const defaultMetadataProvider: MetadataProviderId = mockMode
    ? "brief-metadata"
    : openAIConfigured
      ? "openai-metadata"
      : geminiConfigured
        ? "gemini-metadata"
        : "brief-metadata";

  return {
    mockMode,
    defaultResearchProvider,
    defaultBriefProvider,
    defaultPromptProvider,
    defaultMetadataProvider,
  };
}
