import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

type LogLevel = "debug" | "info" | "warn" | "error";
type LogValue =
  | string
  | number
  | boolean
  | null
  | LogValue[]
  | { [key: string]: LogValue };

type RequestLogContext = {
  requestId: string;
  method: string;
  path: string;
};

type ApiHandler<TArguments extends unknown[]> = (
  ...args: TArguments
) => Response | Promise<Response>;

const requestContext = new AsyncLocalStorage<RequestLogContext>();
const sensitiveKeyPattern =
  /authorization|api[-_]?key|access[-_]?token|refresh[-_]?token|secret|password|cookie|session/i;
const levelWeight: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function configuredLevel(): LogLevel {
  const value = process.env.APP_LOG_LEVEL?.toLowerCase();
  if (value === "debug" || value === "warn" || value === "error") return value;
  return "info";
}

function redactString(value: string) {
  let result = value.replace(/Bearer\s+[^\s,;]+/gi, "Bearer [REDACTED]");
  const secrets = [
    process.env.SNAPGEN_API_KEY,
    process.env.BFL_API_KEY,
    process.env.GEMINI_API_KEY,
    process.env.OPENAI_API_KEY,
    process.env.CLOUDFLARE_WORKER_AI_API_KEY,
    process.env.STABILITY_API_KEY,
    process.env.SESSION_SECRET,
  ].filter((secret): secret is string => Boolean(secret));
  for (const secret of secrets) result = result.replaceAll(secret, "[REDACTED]");
  return result.length > 4_000 ? `${result.slice(0, 4_000)}…` : result;
}

export function sanitizeLogData(
  value: unknown,
  seen = new WeakSet<object>(),
  depth = 0,
): LogValue {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return redactString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    if (seen.has(value)) return "[CIRCULAR]";
    seen.add(value);
    const errorData: Record<string, LogValue> = {
      name: value.name,
      message: redactString(value.message),
      ...(process.env.NODE_ENV !== "production" && value.stack
        ? { stack: redactString(value.stack) }
        : {}),
    };
    if (value.cause !== undefined)
      errorData.cause = sanitizeLogData(value.cause, seen, depth + 1);
    for (const [key, child] of Object.entries(value).slice(0, 100)) {
      if (key === "name" || key === "message" || key === "stack" || key === "cause")
        continue;
      errorData[key] = sensitiveKeyPattern.test(key)
        ? "[REDACTED]"
        : sanitizeLogData(child, seen, depth + 1);
    }
    seen.delete(value);
    return errorData;
  }
  if (Buffer.isBuffer(value) || value instanceof Uint8Array)
    return { binaryData: "[NOT LOGGED]", byteLength: value.byteLength };
  if (depth >= 8) return "[MAX DEPTH]";
  if (Array.isArray(value))
    return value
      .slice(0, 100)
      .map((item) => sanitizeLogData(item, seen, depth + 1));
  if (typeof value !== "object") return redactString(String(value));
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);
  const result: Record<string, LogValue> = {};
  for (const [key, child] of Object.entries(value).slice(0, 100)) {
    result[key] = sensitiveKeyPattern.test(key)
      ? "[REDACTED]"
      : sanitizeLogData(child, seen, depth + 1);
  }
  seen.delete(value);
  return result;
}

function writeLog(
  level: LogLevel,
  event: string,
  data: Record<string, unknown> = {},
) {
  if (levelWeight[level] < levelWeight[configuredLevel()]) return;
  const context = requestContext.getStore();
  const sanitizedData = sanitizeLogData(data) as Record<string, LogValue>;
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    service: "thoock",
    event,
    ...(context ?? {}),
    ...sanitizedData,
  };
  const output = JSON.stringify(entry);
  if (level === "error") console.error(output);
  else if (level === "warn") console.warn(output);
  else if (level === "debug") console.debug(output);
  else console.info(output);
}

export const appLogger = {
  debug: (event: string, data?: Record<string, unknown>) =>
    writeLog("debug", event, data),
  info: (event: string, data?: Record<string, unknown>) =>
    writeLog("info", event, data),
  warn: (event: string, data?: Record<string, unknown>) =>
    writeLog("warn", event, data),
  error: (event: string, data?: Record<string, unknown>) =>
    writeLog("error", event, data),
};

export function getRequestLogContext() {
  return requestContext.getStore();
}

function resolveRequestId(request: Request) {
  const supplied = request.headers.get("x-request-id")?.trim();
  return supplied && /^[a-zA-Z0-9._:-]{1,128}$/.test(supplied)
    ? supplied
    : randomUUID();
}

function sanitizedQuery(url: URL) {
  const query: Record<string, string | string[]> = {};
  for (const [key, value] of url.searchParams) {
    if (sensitiveKeyPattern.test(key)) {
      query[key] = "[REDACTED]";
      continue;
    }
    const safeValue = value.length > 500 ? `${value.slice(0, 500)}…` : value;
    const current = query[key];
    query[key] = current
      ? Array.isArray(current)
        ? [...current, safeValue]
        : [current, safeValue]
      : safeValue;
  }
  return query;
}

export function withApiLogging<TArguments extends unknown[]>(
  handler: ApiHandler<TArguments>,
): ApiHandler<TArguments> {
  return async (...args: TArguments) => {
    const request = args[0] instanceof Request ? args[0] : null;
    const method = request?.method ?? "UNKNOWN";
    const url = request ? new URL(request.url) : null;
    const path = url?.pathname ?? "unknown";
    const requestId = request ? resolveRequestId(request) : randomUUID();
    const startedAt = performance.now();

    return requestContext.run({ requestId, method, path }, async () => {
      appLogger.info("api.request.started", {
        query: url ? sanitizedQuery(url) : {},
      });
      try {
        const response = await handler(...args);
        const durationMs = Math.round((performance.now() - startedAt) * 100) / 100;
        const details = {
          status: response.status,
          durationMs,
          contentType: response.headers.get("content-type"),
          contentLength: response.headers.get("content-length"),
        };
        if (response.status >= 500) appLogger.error("api.request.completed", details);
        else if (response.status >= 400)
          appLogger.warn("api.request.completed", details);
        else appLogger.info("api.request.completed", details);
        response.headers.set("x-request-id", requestId);
        return response;
      } catch (error) {
        appLogger.error("api.request.failed", {
          durationMs:
            Math.round((performance.now() - startedAt) * 100) / 100,
          error,
        });
        throw error;
      }
    });
  };
}
