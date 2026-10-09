import "server-only";

import { z } from "zod";

const responseSchema = z
  .object({
    id: z.string().optional(),
    output_text: z.string().nullable().optional(),
    output: z
      .array(
        z
          .object({
            content: z
              .array(
                z
                  .object({
                    type: z.string().optional(),
                    text: z.string().optional(),
                    refusal: z.string().optional(),
                  })
                  .passthrough(),
              )
              .optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

export function openAITextModel() {
  return process.env.OPENAI_TEXT_MODEL ?? "gpt-5.6-luna";
}

export function extractOpenAIText(value: unknown) {
  const response = responseSchema.parse(value);
  if (response.output_text?.trim()) return response.output_text;
  const text = response.output
    ?.flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text" && item.text)
    .map((item) => item.text)
    .join("");
  if (text?.trim()) return text;
  const refusal = response.output
    ?.flatMap((item) => item.content ?? [])
    .find((item) => item.type === "refusal" && item.refusal)?.refusal;
  throw new Error(refusal || "OpenAI returned no text result.");
}

function errorMessage(value: unknown, status: number) {
  const parsed = z
    .object({ error: z.object({ message: z.string() }).optional() })
    .safeParse(value);
  return parsed.success && parsed.data.error?.message
    ? `OpenAI request failed with status ${status}: ${parsed.data.error.message}`
    : `OpenAI request failed with status ${status}.`;
}

export async function requestOpenAIStructuredOutput<T>(input: {
  model?: string;
  instructions: string;
  prompt: string;
  schemaName: string;
  schema: Record<string, unknown>;
  parse: (value: unknown) => T;
  maxOutputTokens?: number;
}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");
  const baseUrl = (process.env.OPENAI_API_BASE_URL ?? "https://api.openai.com/v1")
    .replace(/\/+$/, "");
  const timeout = Number(process.env.OPENAI_TEXT_TIMEOUT_MS ?? "120000");
  const response = await fetch(`${baseUrl}/responses`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: input.model ?? openAITextModel(),
      store: false,
      instructions: input.instructions,
      input: input.prompt,
      max_output_tokens: input.maxOutputTokens ?? 6_000,
      text: {
        format: {
          type: "json_schema",
          name: input.schemaName,
          strict: true,
          schema: input.schema,
        },
      },
    }),
    signal: AbortSignal.timeout(
      Number.isFinite(timeout) && timeout > 0 ? timeout : 120_000,
    ),
    cache: "no-store",
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(errorMessage(payload, response.status));
  return {
    data: input.parse(JSON.parse(extractOpenAIText(payload))),
    responseId: responseSchema.parse(payload).id ?? null,
  };
}
