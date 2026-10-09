import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { providerRequestLogs } from "@/db/schema";
import { appLogger } from "@/lib/server/logger";
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
    process.env.OPENAI_API_KEY,
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

export type ObservedProviderOperationContext<TResult> = {
  generationJobId: string | null;
  sourcePath: string;
  idempotencyKey: string;
  provider: string;
  model: string;
  operation: string;
  estimatedCostUsd: number | null;
  requestBody: unknown;
  providerRequest: unknown;
  summarizeResult?: (result: TResult) => unknown;
  providerRequestIds?: (result: TResult) => string[];
  actualCostUsd?: (result: TResult) => number | null;
};

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

export async function observeProviderOperation<TResult>(
  context: ObservedProviderOperationContext<TResult>,
  execute: () => Promise<TResult>,
  suppliedWriter?: ProviderRequestLogWriter | null,
) {
  let writer =
    suppliedWriter === undefined ? createDatabaseWriter() : suppliedWriter;
  const startedAt = Date.now();
  appLogger.info("provider.request.started", {
    provider: context.provider,
    model: context.model,
    operation: context.operation,
    sourcePath: context.sourcePath,
    idempotencyKey: context.idempotencyKey,
    estimatedCostUsd: context.estimatedCostUsd,
  });

  let logId: string | null = null;
  if (writer) {
    try {
      logId = await writer.start({
        generationJobId: context.generationJobId,
        sourcePath: context.sourcePath,
        idempotencyKey: context.idempotencyKey,
        provider: context.provider,
        model: context.model,
        operation: context.operation,
        requestBody: sanitizeProviderLogValue(context.requestBody),
        providerRequestBody: sanitizeProviderLogValue(context.providerRequest),
        estimatedCostUsd: context.estimatedCostUsd,
      });
    } catch (loggingError) {
      writer = null;
      appLogger.warn("provider.database_log.start_failed", {
        provider: context.provider,
        operation: context.operation,
        error: loggingError,
      });
    }
  }
  try {
    const result = await execute();
    const completedAt = new Date();
    const durationMs = Date.now() - startedAt;
    const providerRequestIds = context.providerRequestIds?.(result) ?? [];
    const actualCostUsd = context.actualCostUsd?.(result) ?? null;
    if (writer && logId) {
      try {
        await writer.succeed(logId, {
          responseBody: sanitizeProviderLogValue(
            context.summarizeResult?.(result) ?? result,
          ),
          providerRequestIds,
          actualCostUsd,
          durationMs,
          completedAt,
        });
      } catch (loggingError) {
        appLogger.warn("provider.database_log.completion_failed", {
          logId,
          operation: context.operation,
          error: loggingError,
        });
      }
    }
    appLogger.info("provider.request.completed", {
      provider: context.provider,
      model: context.model,
      operation: context.operation,
      idempotencyKey: context.idempotencyKey,
      durationMs,
      providerRequestIds,
      actualCostUsd,
    });
    return result;
  } catch (error) {
    const completedAt = new Date();
    const durationMs = Date.now() - startedAt;
    if (writer && logId) {
      try {
        await writer.fail(logId, {
          errorDetails: redactErrorDetails(error),
          durationMs,
          completedAt,
        });
      } catch (loggingError) {
        appLogger.warn("provider.database_log.failure_update_failed", {
          logId,
          operation: context.operation,
          error: loggingError,
        });
      }
    }
    appLogger.error("provider.request.failed", {
      provider: context.provider,
      model: context.model,
      operation: context.operation,
      idempotencyKey: context.idempotencyKey,
      durationMs,
      error,
    });
    throw error;
  }
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
  let writer =
    suppliedWriter === undefined ? createDatabaseWriter() : suppliedWriter;
  const startedAt = Date.now();
  appLogger.info("provider.request.started", {
    provider: context.provider,
    model: context.model,
    operation: "image_generation",
    sourcePath: context.sourcePath,
    idempotencyKey: context.idempotencyKey,
    estimatedCostUsd: context.estimatedCostUsd,
  });
  let logId: string | null = null;
  if (writer) {
    try {
      logId = await writer.start({
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
    } catch (loggingError) {
      writer = null;
      appLogger.warn("provider.database_log.start_failed", {
        provider: context.provider,
        operation: "image_generation",
        error: loggingError,
      });
    }
  }
  const acceptedRequestIds: string[] = [];
  try {
    const images = await execute(async (providerRequestId, candidateIndex) => {
      acceptedRequestIds[candidateIndex] = providerRequestId;
      const ids = acceptedRequestIds.filter(Boolean);
      if (writer && logId) {
        try {
          await writer.accepted?.(logId, ids);
        } catch (loggingError) {
          appLogger.warn("provider.database_log.accepted_id_failed", {
            logId,
            operation: "image_generation",
            error: loggingError,
          });
        }
      }
      try {
        await context.onProviderRequestAccepted?.(
          providerRequestId,
          candidateIndex,
        );
      } catch (persistenceError) {
        appLogger.error("provider.job.accepted_id_update_failed", {
          generationJobId: context.generationJobId,
          error: persistenceError,
        });
      }
    });
    const completedAt = new Date();
    const durationMs = Date.now() - startedAt;
    const actualCostUsd = images.every(
      (image) => image.actualCostUsd !== undefined,
    )
      ? images.reduce(
          (total, image) => total + (image.actualCostUsd ?? 0),
          0,
        )
      : null;
    const providerRequestIds = [
      ...new Set(images.map((image) => image.providerRequestId)),
    ];
    if (writer && logId) {
      try {
        await writer.succeed(logId, {
          responseBody: summarizeResponse(images),
          providerRequestIds,
          actualCostUsd,
          durationMs,
          completedAt,
        });
      } catch (loggingError) {
        appLogger.warn("provider.database_log.completion_failed", {
          logId,
          operation: "image_generation",
          error: loggingError,
        });
      }
    }
    appLogger.info("provider.request.completed", {
      provider: context.provider,
      model: context.model,
      operation: "image_generation",
      idempotencyKey: context.idempotencyKey,
      durationMs,
      providerRequestIds,
      actualCostUsd,
      imageCount: images.length,
    });
    return images;
  } catch (error) {
    const completedAt = new Date();
    const durationMs = Date.now() - startedAt;
    if (writer && logId) {
      try {
        await writer.fail(logId, {
          errorDetails: redactErrorDetails(error),
          durationMs,
          completedAt,
        });
      } catch (loggingError) {
        appLogger.warn("provider.database_log.failure_update_failed", {
          logId,
          operation: "image_generation",
          error: loggingError,
        });
      }
    }
    appLogger.error("provider.request.failed", {
      provider: context.provider,
      model: context.model,
      operation: "image_generation",
      idempotencyKey: context.idempotencyKey,
      durationMs,
      providerRequestIds: acceptedRequestIds.filter(Boolean),
      error,
    });
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
  return observeProviderOperation(
    {
      generationJobId: context.generationJobId,
      sourcePath: context.sourcePath,
      idempotencyKey: context.idempotencyKey,
      provider: "snapgen",
      model: context.model,
      operation: "logo_removal",
      estimatedCostUsd: 0,
      requestBody: { historyUuid: context.historyUuid, mode: "fast" },
      providerRequest: context.providerRequest,
      summarizeResult: (result) => ({
        mimeType: result.mimeType,
        byteLength: result.buffer.byteLength,
        historyUuid: result.historyUuid,
        removalJobId: result.removalJobId,
        mode: result.mode,
        estimatedCredits: result.estimatedCredits,
        usedCredits: result.usedCredits,
        binaryData: "[NOT STORED]",
      }),
      providerRequestIds: (result) => [
        ...new Set([result.historyUuid, result.removalJobId]),
      ],
      actualCostUsd: (result) => (result.mode === "fast" ? 0 : null),
    },
    execute,
    suppliedWriter,
  );
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
  return observeProviderOperation(
    {
      generationJobId: context.generationJobId,
      sourcePath: context.sourcePath,
      idempotencyKey: context.idempotencyKey,
      provider: "snapgen",
      model: context.model,
      operation: "history_lookup",
      estimatedCostUsd: 0,
      requestBody: { providerRequestId: context.providerRequestId },
      providerRequest: context.providerRequest,
      summarizeResult: (result) => ({
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
      providerRequestIds: (result) => [result.providerRequestId],
      actualCostUsd: () => 0,
    },
    execute,
    suppliedWriter,
  );
}

export async function observeProviderHistorySearch(
  context: ObservedHistoryLookupContext & {
    prompt: string;
    createdAt: Date;
  },
  execute: () => Promise<SnapgenHistoryMatch[]>,
  suppliedWriter?: ProviderRequestLogWriter | null,
) {
  return observeProviderOperation(
    {
      generationJobId: context.generationJobId,
      sourcePath: context.sourcePath,
      idempotencyKey: context.idempotencyKey,
      provider: "snapgen",
      model: context.model,
      operation: "history_search",
      estimatedCostUsd: 0,
      requestBody: {
        model: context.model,
        prompt: context.prompt,
        createdAt: context.createdAt,
      },
      providerRequest: context.providerRequest,
      summarizeResult: (matches) => ({
        matchCount: matches.length,
        matches,
      }),
      providerRequestIds: (matches) =>
        matches.map((match) => match.providerRequestId),
      actualCostUsd: () => 0,
    },
    execute,
    suppliedWriter,
  );
}
