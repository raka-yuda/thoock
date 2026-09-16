import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { providerRequestLogs } from "@/db/schema";
import type { GeneratedImage } from "./contracts";
import type {
  SnapgenHistoryCheckResult,
  SnapgenHistoryMatch,
} from "./generation";
import type { SnapGenLogoRemovalResult } from "./snapgen-logo-removal";

type JsonPrimitive = string | number | boolean | null;
export type LoggableJson =
  | JsonPrimitive
  | LoggableJson[]
  | { [key: string]: LoggableJson };

const sensitiveKeyPattern =
  /authorization|api[-_]?key|access[-_]?token|refresh[-_]?token|secret|password|cookie/i;

export function sanitizeProviderLogValue(
  value: unknown,
  seen = new WeakSet<object>(),
): LoggableJson {
  if (value === null || value === undefined) return null;
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  )
    return value;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value) || value instanceof Uint8Array)
    return {
      binaryData: "[NOT STORED]",
      byteLength: value.byteLength,
    };
  if (Array.isArray(value))
    return value.map((item) => sanitizeProviderLogValue(item, seen));
  if (typeof value !== "object") return String(value);
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);
  const result: Record<string, LoggableJson> = {};
  for (const [key, child] of Object.entries(value)) {
    result[key] = sensitiveKeyPattern.test(key)
      ? "[REDACTED]"
      : sanitizeProviderLogValue(child, seen);
  }
  seen.delete(value);
  return result;
}

function redactErrorDetails(error: unknown) {
  let message = error instanceof Error ? error.message : String(error);
  message = message.replace(/Bearer\s+[^\s,;]+/gi, "Bearer [REDACTED]");
  const configuredSecrets = [
    process.env.SNAPGEN_API_KEY,
    process.env.BFL_API_KEY,
    process.env.GEMINI_API_KEY,
    process.env.CLOUDFLARE_WORKER_AI_API_KEY,
    process.env.STABILITY_API_KEY,
  ].filter((secret): secret is string => Boolean(secret));
  for (const secret of configuredSecrets)
    message = message.replaceAll(secret, "[REDACTED]");
  return message.slice(0, 4_000);
}

type LogStart = {
  generationJobId: string | null;
  sourcePath: string;
  idempotencyKey: string;
  provider: string;
  model: string;
  operation: string;
  requestBody: LoggableJson;
  providerRequestBody: LoggableJson;
  estimatedCostUsd: number | null;
};

type LogSuccess = {
  responseBody: LoggableJson;
  providerRequestIds: string[];
  actualCostUsd: number | null;
  durationMs: number;
  completedAt: Date;
};

type LogFailure = {
  errorDetails: string;
  durationMs: number;
  completedAt: Date;
};

export interface ProviderRequestLogWriter {
  start(input: LogStart): Promise<string>;
  accepted?(id: string, providerRequestIds: string[]): Promise<void>;
  succeed(id: string, input: LogSuccess): Promise<void>;
  fail(id: string, input: LogFailure): Promise<void>;
}

function createDatabaseWriter(): ProviderRequestLogWriter | null {
  if (!process.env.DATABASE_URL) return null;
  return {
    async start(input) {
      const [row] = await getDb()
        .insert(providerRequestLogs)
        .values({
          generationJobId: input.generationJobId,
          sourcePath: input.sourcePath,
          idempotencyKey: input.idempotencyKey,
          provider: input.provider,
          model: input.model,
          operation: input.operation,
          requestBody: input.requestBody,
          providerRequestBody: input.providerRequestBody,
          estimatedCostUsd:
            input.estimatedCostUsd === null
              ? null
              : String(input.estimatedCostUsd),
          status: "started",
        })
        .returning({ id: providerRequestLogs.id });
      return row.id;
    },
    async succeed(id, input) {
      await getDb()
        .update(providerRequestLogs)
        .set({
          status: "succeeded",
          responseBody: input.responseBody,
          providerRequestIds: input.providerRequestIds,
          actualCostUsd:
            input.actualCostUsd === null ? null : String(input.actualCostUsd),
          durationMs: input.durationMs,
          completedAt: input.completedAt,
          updatedAt: input.completedAt,
        })
        .where(eq(providerRequestLogs.id, id));
    },
    async accepted(id, providerRequestIds) {
      await getDb()
        .update(providerRequestLogs)
        .set({ providerRequestIds, updatedAt: new Date() })
        .where(eq(providerRequestLogs.id, id));
    },
    async fail(id, input) {
      await getDb()
        .update(providerRequestLogs)
        .set({
          status: "failed",
          errorDetails: input.errorDetails,
          durationMs: input.durationMs,
          completedAt: input.completedAt,
          updatedAt: input.completedAt,
        })
        .where(eq(providerRequestLogs.id, id));
    },
  };
}

export type ObservedGenerationContext = {
  generationJobId: string | null;
  sourcePath: string;
  idempotencyKey: string;
  provider: string;
  model: string;
  estimatedCostUsd: number | null;
  requestBody: unknown;
  providerRequest: unknown;
  onProviderRequestAccepted?: (
    providerRequestId: string,
    candidateIndex: number,
  ) => void | Promise<void>;
};

function summarizeResponse(images: GeneratedImage[]): LoggableJson {
  return {
    imageCount: images.length,
    images: images.map((image) => ({
      mimeType: image.mimeType,
      byteLength: image.buffer.byteLength,
      providerReportedWidth: image.providerReportedWidth,
      providerReportedHeight: image.providerReportedHeight,
      providerRequestId: image.providerRequestId,
      actualCostUsd: image.actualCostUsd ?? null,
    })),
    binaryData: "[NOT STORED]",
  };
}

export async function observeProviderGeneration(
  context: ObservedGenerationContext,
  execute: (
    onProviderRequestAccepted?: (
      providerRequestId: string,
      candidateIndex: number,
    ) => void | Promise<void>,
  ) => Promise<GeneratedImage[]>,
  suppliedWriter?: ProviderRequestLogWriter | null,
) {
  const writer =
    suppliedWriter === undefined ? createDatabaseWriter() : suppliedWriter;
  if (!writer) return execute(context.onProviderRequestAccepted);

  // Starting the audit record before the external request gives paid calls a
  // durable correlation ID. If this fails, the provider is not called.
  const logId = await writer.start({
    generationJobId: context.generationJobId,
    sourcePath: context.sourcePath,
    idempotencyKey: context.idempotencyKey,
    provider: context.provider,
    model: context.model,
    operation: "image_generation",
    requestBody: sanitizeProviderLogValue(context.requestBody),
    providerRequestBody: sanitizeProviderLogValue(context.providerRequest),
    estimatedCostUsd: context.estimatedCostUsd,
  });
  const startedAt = Date.now();
  const acceptedRequestIds: string[] = [];
  try {
    const images = await execute(async (providerRequestId, candidateIndex) => {
      acceptedRequestIds[candidateIndex] = providerRequestId;
      const ids = acceptedRequestIds.filter(Boolean);
      try {
        await writer.accepted?.(logId, ids);
      } catch (loggingError) {
        console.error("Provider accepted-ID log update failed", {
          logId,
          error:
            loggingError instanceof Error
              ? loggingError.message
              : "Unknown logging error",
        });
      }
      try {
        await context.onProviderRequestAccepted?.(
          providerRequestId,
          candidateIndex,
        );
      } catch (persistenceError) {
        console.error("Provider accepted-ID job update failed", {
          generationJobId: context.generationJobId,
          error:
            persistenceError instanceof Error
              ? persistenceError.message
              : "Unknown persistence error",
        });
      }
    });
    const completedAt = new Date();
    const actualCostUsd = images.every(
      (image) => image.actualCostUsd !== undefined,
    )
      ? images.reduce(
          (total, image) => total + (image.actualCostUsd ?? 0),
          0,
        )
      : null;
    try {
      await writer.succeed(logId, {
        responseBody: summarizeResponse(images),
        providerRequestIds: [
          ...new Set(images.map((image) => image.providerRequestId)),
        ],
        actualCostUsd,
        durationMs: Date.now() - startedAt,
        completedAt,
      });
    } catch (loggingError) {
      console.error("Provider request log completion failed", {
        logId,
        error:
          loggingError instanceof Error
            ? loggingError.message
            : "Unknown logging error",
      });
    }
    return images;
  } catch (error) {
    const completedAt = new Date();
    try {
      await writer.fail(logId, {
        errorDetails: redactErrorDetails(error),
        durationMs: Date.now() - startedAt,
        completedAt,
      });
    } catch (loggingError) {
      console.error("Provider request log failure update failed", {
        logId,
        error:
          loggingError instanceof Error
            ? loggingError.message
            : "Unknown logging error",
      });
    }
    throw error;
  }
}

export type ObservedLogoRemovalContext = {
  generationJobId: string | null;
  sourcePath: string;
  idempotencyKey: string;
  model: string;
  historyUuid: string;
  providerRequest: unknown;
};

export async function observeProviderLogoRemoval(
  context: ObservedLogoRemovalContext,
  execute: () => Promise<SnapGenLogoRemovalResult>,
  suppliedWriter?: ProviderRequestLogWriter | null,
) {
  const writer =
    suppliedWriter === undefined ? createDatabaseWriter() : suppliedWriter;
  if (!writer) return execute();

  const logId = await writer.start({
    generationJobId: context.generationJobId,
    sourcePath: context.sourcePath,
    idempotencyKey: context.idempotencyKey,
    provider: "snapgen",
    model: context.model,
    operation: "logo_removal",
    requestBody: sanitizeProviderLogValue({
      historyUuid: context.historyUuid,
      mode: "fast",
    }),
    providerRequestBody: sanitizeProviderLogValue(context.providerRequest),
    estimatedCostUsd: 0,
  });
  const startedAt = Date.now();
  try {
    const result = await execute();
    const completedAt = new Date();
    try {
      await writer.succeed(logId, {
        responseBody: {
          mimeType: result.mimeType,
          byteLength: result.buffer.byteLength,
          historyUuid: result.historyUuid,
          removalJobId: result.removalJobId,
          mode: result.mode,
          estimatedCredits: result.estimatedCredits,
          usedCredits: result.usedCredits,
          binaryData: "[NOT STORED]",
        },
        providerRequestIds: [
          ...new Set([result.historyUuid, result.removalJobId]),
        ],
        actualCostUsd: result.mode === "fast" ? 0 : null,
        durationMs: Date.now() - startedAt,
        completedAt,
      });
    } catch (loggingError) {
      console.error("Provider logo-removal log completion failed", {
        logId,
        error:
          loggingError instanceof Error
            ? loggingError.message
            : "Unknown logging error",
      });
    }
    return result;
  } catch (error) {
    const completedAt = new Date();
    try {
      await writer.fail(logId, {
        errorDetails: redactErrorDetails(error),
        durationMs: Date.now() - startedAt,
        completedAt,
      });
    } catch (loggingError) {
      console.error("Provider logo-removal log failure update failed", {
        logId,
        error:
          loggingError instanceof Error
            ? loggingError.message
            : "Unknown logging error",
      });
    }
    throw error;
  }
}

export type ObservedHistoryLookupContext = {
  generationJobId: string;
  sourcePath: string;
  idempotencyKey: string;
  model: string;
  providerRequestId: string;
  providerRequest: unknown;
};

export async function observeProviderHistoryLookup(
  context: ObservedHistoryLookupContext,
  execute: () => Promise<SnapgenHistoryCheckResult>,
  suppliedWriter?: ProviderRequestLogWriter | null,
) {
  const writer =
    suppliedWriter === undefined ? createDatabaseWriter() : suppliedWriter;
  if (!writer) return execute();

  const logId = await writer.start({
    generationJobId: context.generationJobId,
    sourcePath: context.sourcePath,
    idempotencyKey: context.idempotencyKey,
    provider: "snapgen",
    model: context.model,
    operation: "history_lookup",
    requestBody: sanitizeProviderLogValue({
      providerRequestId: context.providerRequestId,
    }),
    providerRequestBody: sanitizeProviderLogValue(context.providerRequest),
    estimatedCostUsd: 0,
  });
  const startedAt = Date.now();
  try {
    const result = await execute();
    const completedAt = new Date();
    try {
      await writer.succeed(logId, {
        responseBody: sanitizeProviderLogValue({
          providerRequestId: result.providerRequestId,
          status: result.status,
          errorDetails: result.errorDetails ?? null,
          image: result.image
            ? {
                mimeType: result.image.mimeType,
                byteLength: result.image.buffer.byteLength,
                providerReportedWidth: result.image.providerReportedWidth,
                providerReportedHeight: result.image.providerReportedHeight,
                binaryData: "[NOT STORED]",
              }
            : null,
        }),
        providerRequestIds: [result.providerRequestId],
        actualCostUsd: 0,
        durationMs: Date.now() - startedAt,
        completedAt,
      });
    } catch (loggingError) {
      console.error("Provider history log completion failed", {
        logId,
        error:
          loggingError instanceof Error
            ? loggingError.message
            : "Unknown logging error",
      });
    }
    return result;
  } catch (error) {
    const completedAt = new Date();
    try {
      await writer.fail(logId, {
        errorDetails: redactErrorDetails(error),
        durationMs: Date.now() - startedAt,
        completedAt,
      });
    } catch (loggingError) {
      console.error("Provider history log failure update failed", {
        logId,
        error:
          loggingError instanceof Error
            ? loggingError.message
            : "Unknown logging error",
      });
    }
    throw error;
  }
}

export async function observeProviderHistorySearch(
  context: ObservedHistoryLookupContext & {
    prompt: string;
    createdAt: Date;
  },
  execute: () => Promise<SnapgenHistoryMatch[]>,
  suppliedWriter?: ProviderRequestLogWriter | null,
) {
  const writer =
    suppliedWriter === undefined ? createDatabaseWriter() : suppliedWriter;
  if (!writer) return execute();

  const logId = await writer.start({
    generationJobId: context.generationJobId,
    sourcePath: context.sourcePath,
    idempotencyKey: context.idempotencyKey,
    provider: "snapgen",
    model: context.model,
    operation: "history_search",
    requestBody: sanitizeProviderLogValue({
      model: context.model,
      prompt: context.prompt,
      createdAt: context.createdAt,
    }),
    providerRequestBody: sanitizeProviderLogValue(context.providerRequest),
    estimatedCostUsd: 0,
  });
  const startedAt = Date.now();
  try {
    const matches = await execute();
    const completedAt = new Date();
    try {
      await writer.succeed(logId, {
        responseBody: sanitizeProviderLogValue({
          matchCount: matches.length,
          matches,
        }),
        providerRequestIds: matches.map((match) => match.providerRequestId),
        actualCostUsd: 0,
        durationMs: Date.now() - startedAt,
        completedAt,
      });
    } catch (loggingError) {
      console.error("Provider history-search log completion failed", {
        logId,
        error:
          loggingError instanceof Error
            ? loggingError.message
            : "Unknown logging error",
      });
    }
    return matches;
  } catch (error) {
    const completedAt = new Date();
    try {
      await writer.fail(logId, {
        errorDetails: redactErrorDetails(error),
        durationMs: Date.now() - startedAt,
        completedAt,
      });
    } catch (loggingError) {
      console.error("Provider history-search log failure update failed", {
        logId,
        error:
          loggingError instanceof Error
            ? loggingError.message
            : "Unknown logging error",
      });
    }
    throw error;
  }
}
