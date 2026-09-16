export type GenerationFailureKind =
  | "retryable"
  | "edit_required"
  | "configuration"
  | "unknown";

export function classifyGenerationFailure(
  error: unknown,
): GenerationFailureKind {
  const message = error instanceof Error ? error.message : String(error);
  if (
    /(?:unauthori[sz]ed|forbidden|authentication|api[-_ ]?key|not configured|\b401\b|\b403\b)/i.test(
      message,
    )
  )
    return "configuration";
  if (
    /(?:moderation|safety|content policy|invalid (?:prompt|parameter|request)|unsupported|\b400\b|\b422\b)/i.test(
      message,
    )
  )
    return "edit_required";
  if (
    /(?:timed? ?out|timeout|network|fetch failed|socket|econn|rate.?limit|temporar|unavailable|\b408\b|\b425\b|\b429\b|\b500\b|\b502\b|\b503\b|\b504\b|\b520\b|\b522\b|\b524\b)/i.test(
      message,
    )
  )
    return "retryable";
  return "unknown";
}

export function generationFailureGuidance(kind: GenerationFailureKind) {
  if (kind === "retryable")
    return "The provider or network failed temporarily. You can retry after reviewing the possible additional cost.";
  if (kind === "edit_required")
    return "Edit the prompt or generation settings before trying again.";
  if (kind === "configuration")
    return "Review the provider credentials and model configuration in Settings before retrying.";
  return "The result is uncertain. Review the provider request log before retrying a paid operation.";
}
