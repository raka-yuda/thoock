import "server-only";
import { randomUUID } from "node:crypto";
import { GoogleGenAI } from "@google/genai";
import sharp from "sharp";
import type {
  GenerationExecutionHooks,
  GeneratedImage,
  GenerationRequest,
  ImageGenerationProvider,
} from "./contracts";

type UnknownRecord = Record<string, unknown>;

function escapeXml(value: string) {
  return value.replace(
    /[<>&'\"]/g,
    (character) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        "'": "&apos;",
        '"': "&quot;",
      })[character]!,
  );
}

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function downloadImage(url: string) {
  const parsedUrl = new URL(url);
  if (!new Set(["http:", "https:"]).has(parsedUrl.protocol))
    throw new Error("Provider image URL uses an unsupported protocol.");
  const response = await fetch(parsedUrl, { cache: "no-store" });
  if (!response.ok)
    throw new Error(
      `Provider image download failed with status ${response.status}.`,
    );
  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    mimeType:
      response.headers.get("content-type")?.split(";")[0] ??
      "application/octet-stream",
  };
}

type ExternalImage = {
  url?: string;
  base64?: string;
  mimeType?: string;
  width?: number;
  height?: number;
};

/** Accepts common provider envelopes, but rejects a response that contains no recognizable image bytes. */
export function normalizeImageResponse(payload: unknown): {
  requestId: string;
  images: ExternalImage[];
} {
  const root = asRecord(payload);
  if (!root) throw new Error("Provider returned an invalid JSON response.");
  const requestId = String(
    root.id ?? root.request_id ?? root.requestId ?? randomUUID(),
  );
  const collections = [root.data, root.images, root.output, root.outputs].find(
    Array.isArray,
  ) as unknown[] | undefined;
  const candidates = collections ?? [root];
  const images = candidates.flatMap((candidate): ExternalImage[] => {
    if (typeof candidate === "string")
      return candidate.startsWith("http")
        ? [{ url: candidate }]
        : [{ base64: candidate }];
    const item = asRecord(candidate);
    if (!item) return [];
    const nested = asRecord(item.image);
    const url = item.url ?? item.image_url ?? item.sample ?? nested?.url;
    const base64 =
      item.b64_json ?? item.base64 ?? item.image_base64 ?? nested?.base64;
    if (typeof url !== "string" && typeof base64 !== "string") return [];
    return [
      {
        url: typeof url === "string" ? url : undefined,
        base64:
          typeof base64 === "string"
            ? base64.replace(/^data:[^;]+;base64,/, "")
            : undefined,
        mimeType:
          typeof item.mime_type === "string"
            ? item.mime_type
            : typeof item.mimeType === "string"
              ? item.mimeType
              : undefined,
        width: asNumber(item.width) ?? undefined,
        height: asNumber(item.height) ?? undefined,
      },
    ];
  });
  if (!images.length)
    throw new Error("Provider returned no recognizable image output.");
  return { requestId, images };
}

async function materializeNormalizedImages(
  payload: unknown,
): Promise<GeneratedImage[]> {
  const normalized = normalizeImageResponse(payload);
  return Promise.all(
    normalized.images.map(async (image, index) => {
      const downloaded = image.url
        ? await downloadImage(image.url)
        : {
            buffer: Buffer.from(image.base64!, "base64"),
            mimeType: image.mimeType ?? "application/octet-stream",
          };
      return {
        buffer: downloaded.buffer,
        mimeType: image.mimeType ?? downloaded.mimeType,
        providerRequestId: `${normalized.requestId}-${index + 1}`,
        providerReportedWidth: image.width ?? null,
        providerReportedHeight: image.height ?? null,
      };
    }),
  );
}

export class MockImageGenerationProvider implements ImageGenerationProvider {
  readonly id = "mock";
  readonly label = "Mock studio";
  readonly paid = false;
  isConfigured() {
    return true;
  }

  async generate(request: GenerationRequest): Promise<GeneratedImage[]> {
    return Promise.all(
      Array.from({ length: request.candidates }, async (_, index) => {
        const width = request.requestedWidth;
        const height = request.requestedHeight;
        const hue =
          (index * 57 + request.prompt.length * 3 + (request.seed ?? 0)) % 360;
        const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="hsl(${hue} 34% 22%)"/><stop offset="1" stop-color="hsl(${(hue + 70) % 360} 42% 58%)"/></linearGradient></defs>
        <rect width="100%" height="100%" fill="url(#g)"/><circle cx="${width * 0.7}" cy="${height * 0.32}" r="${Math.min(width, height) * 0.22}" fill="rgba(255,255,255,.14)"/>
        <rect x="${width * 0.08}" y="${height * 0.12}" width="${width * 0.52}" height="${height * 0.72}" rx="36" fill="rgba(255,255,255,.1)"/>
        <text x="${width * 0.08}" y="${height * 0.86}" fill="white" font-family="Arial,sans-serif" font-size="${Math.max(32, width / 28)}" font-weight="700">MOCK CANDIDATE ${index + 1}</text>
        <text x="${width * 0.08}" y="${height * 0.92}" fill="rgba(255,255,255,.8)" font-family="Arial,sans-serif" font-size="${Math.max(20, width / 52)}">${escapeXml(request.prompt.slice(0, 80))}</text>
      </svg>`;
        const buffer = await sharp(Buffer.from(svg))
          .jpeg({ quality: 92, chromaSubsampling: "4:4:4" })
          .toBuffer();
        return {
          buffer,
          mimeType: "image/jpeg",
          providerRequestId: `mock-${randomUUID()}`,
          providerReportedWidth: width,
          providerReportedHeight: height,
          actualCostUsd: 0,
        };
      }),
    );
  }
}

export class ImportedImageProvider implements ImageGenerationProvider {
  readonly id = "imported";
  readonly label = "Imported image";
  readonly paid = false;
  isConfigured() {
    return true;
  }
  async generate(request: GenerationRequest): Promise<GeneratedImage[]> {
    if (!request.importedImages?.length)
      throw new Error("At least one imported image is required.");
    return Promise.all(
      request.importedImages.map(async (image) => {
        if (image.buffer.byteLength > 50 * 1024 * 1024)
          throw new Error("Imported images must be 50MB or smaller.");
        if (!new Set(["image/jpeg", "image/png", "image/webp"]).has(image.mimeType))
          throw new Error("Imported image format is not supported.");
        const metadata = await sharp(image.buffer, { failOn: "warning" }).metadata();
        if (!metadata.width || !metadata.height || !metadata.format)
          throw new Error("Imported image bytes could not be inspected.");
        return {
          buffer: image.buffer,
          mimeType: image.mimeType,
          providerRequestId: `import-${randomUUID()}`,
          providerReportedWidth: null,
          providerReportedHeight: null,
          actualCostUsd: 0,
        };
      }),
    );
  }
}

export class SnapGenImageGenerationProvider implements ImageGenerationProvider {
  readonly id = "snapgen";
  readonly label = "SnapGenAI";
  readonly paid = true;
  isConfigured() {
    return Boolean(
      process.env.SNAPGEN_API_KEY &&
      process.env.SNAPGEN_API_BASE_URL,
    );
  }

  normalizeRequestForProvider(request: GenerationRequest) {
    const endpoint = snapgenGenerationEndpoint(request.model);
    return {
      transport: "multipart-form-data",
      method: "POST",
      endpoint: endpointForLog(endpoint),
      calls: Array.from({ length: request.candidates }, () => ({
        fields: snapgenRequestFields(request),
        files: (request.referenceImages ?? []).map((image) => ({
          filename: image.filename,
          mimeType: image.mimeType,
          byteLength: image.buffer.byteLength,
        })),
      })),
      omittedHeaders: ["x-api-key"],
      responseContract: "async-history-record",
    };
  }

  normalizeHistoryRequest(providerRequestId: string) {
    return {
      method: "GET",
      endpoint: endpointForLog(
        new URL(
          `/uapi/v1/history/${encodeURIComponent(providerRequestId.trim())}`,
          snapgenBaseUrl(),
        ),
      ),
      omittedHeaders: ["x-api-key"],
      responseContract: "single-generation-history-record",
    };
  }

  normalizeHistorySearchRequest() {
    const endpoint = new URL("/uapi/v1/histories", snapgenBaseUrl());
    endpoint.searchParams.set("filter_by", "image");
    endpoint.searchParams.set("items_per_page", "100");
    endpoint.searchParams.set("page", "1");
    return {
      method: "GET",
      endpoint: endpointForLog(endpoint),
      omittedHeaders: ["x-api-key"],
      responseContract: "paginated-generation-history",
    };
  }

  async generate(request: GenerationRequest, hooks?: GenerationExecutionHooks) {
    if (!this.isConfigured())
      throw new Error(
        "SnapGenAI requires SNAPGEN_API_KEY and SNAPGEN_API_BASE_URL.",
      );
    const endpoint = snapgenGenerationEndpoint(request.model);
    const outputs: GeneratedImage[] = [];
    for (let index = 0; index < request.candidates; index += 1) {
      const form = new FormData();
      for (const [key, value] of Object.entries(snapgenRequestFields(request)))
        form.append(key, value);
      for (const image of request.referenceImages ?? []) {
        form.append(
          "files",
          new Blob([new Uint8Array(image.buffer)], { type: image.mimeType }),
          image.filename,
        );
      }
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "x-api-key": process.env.SNAPGEN_API_KEY!,
        },
        body: form,
        cache: "no-store",
      });
      const payload = await snapgenJsonResponse(response, "generation");
      const acceptedJobId = snapgenJobId(payload);
      if (acceptedJobId)
        await hooks?.onProviderRequestAccepted?.(acceptedJobId, index);
      const completed = await waitForSnapgenResult(payload);
      outputs.push(await materializeSnapgenResult(completed));
    }
    return outputs;
  }

  async checkHistory(providerRequestId: string): Promise<SnapgenHistoryCheckResult> {
    if (!this.isConfigured())
      throw new Error(
        "SnapGenAI requires SNAPGEN_API_KEY and SNAPGEN_API_BASE_URL.",
      );
    const normalizedId = providerRequestId.trim();
    if (!normalizedId)
      throw new Error("A SnapGenAI history UUID is required.");
    const historyUrl = new URL(
      `/uapi/v1/history/${encodeURIComponent(normalizedId)}`,
      snapgenBaseUrl(),
    );
    const record = await snapgenJsonResponse(
      await fetch(historyUrl, {
        headers: { "x-api-key": process.env.SNAPGEN_API_KEY! },
        cache: "no-store",
      }),
      "history lookup",
    );
    const resolvedId = snapgenJobId(record) ?? normalizedId;
    const status = snapgenStatus(record);
    if (status === 2)
      return {
        providerRequestId: resolvedId,
        status: "completed",
        image: await materializeSnapgenResult({ ...record, uuid: resolvedId }),
      };
    if (status === 3)
      return {
        providerRequestId: resolvedId,
        status: "failed",
        errorDetails: snapgenErrorMessage(record),
      };
    return {
      providerRequestId: resolvedId,
      status: "processing",
    };
  }

  async findHistoryMatches(input: {
    prompt: string;
    model: string;
    createdAt: Date;
  }): Promise<SnapgenHistoryMatch[]> {
    if (!this.isConfigured())
      throw new Error(
        "SnapGenAI requires SNAPGEN_API_KEY and SNAPGEN_API_BASE_URL.",
      );
    const endpoint = new URL("/uapi/v1/histories", snapgenBaseUrl());
    endpoint.searchParams.set("filter_by", "image");
    endpoint.searchParams.set("items_per_page", "100");
    endpoint.searchParams.set("page", "1");
    const payload = await snapgenJsonResponse(
      await fetch(endpoint, {
        headers: { "x-api-key": process.env.SNAPGEN_API_KEY! },
        cache: "no-store",
      }),
      "history search",
    );
    const rows = Array.isArray(payload.result) ? payload.result : [];
    const targetTime = input.createdAt.getTime();
    const windowMs = 15 * 60 * 1_000;
    return rows
      .flatMap((value): SnapgenHistoryMatch[] => {
        const row = asRecord(value);
        if (!row) return [];
        const providerRequestId = snapgenJobId(row);
        const model = row.model_name ?? row.model;
        const prompt = row.input_text ?? row.custom_prompt ?? row.prompt;
        const createdAt = row.created_at;
        if (
          !providerRequestId ||
          model !== input.model ||
          prompt !== input.prompt ||
          typeof createdAt !== "string"
        )
          return [];
        const providerTime = parseSnapgenDate(createdAt);
        if (
          providerTime === null ||
          Math.abs(providerTime - targetTime) > windowMs
        )
          return [];
        return [
          {
            providerRequestId,
            model,
            status: snapgenStatus(row),
            createdAt,
          },
        ];
      })
      .sort(
        (left, right) =>
          Math.abs(parseSnapgenDate(left.createdAt)! - targetTime) -
          Math.abs(parseSnapgenDate(right.createdAt)! - targetTime),
      );
  }
}

export type SnapgenHistoryCheckResult = {
  providerRequestId: string;
  status: "processing" | "completed" | "failed";
  image?: GeneratedImage;
  errorDetails?: string;
};

export type SnapgenHistoryMatch = {
  providerRequestId: string;
  model: string;
  status: number | null;
  createdAt: string;
};

function parseSnapgenDate(value: string) {
  const hasZone = /(?:z|[+-]\d{2}:?\d{2})$/i.test(value);
  const parsed = Date.parse(hasZone ? value : `${value}Z`);
  return Number.isFinite(parsed) ? parsed : null;
}

function snapgenBaseUrl() {
  const endpoint = new URL(process.env.SNAPGEN_API_BASE_URL!);
  if (!new Set(["http:", "https:"]).has(endpoint.protocol))
    throw new Error("SnapGenAI base URL must use HTTP or HTTPS.");
  return endpoint;
}

function isSnapgenGptImage2(model: string) {
  return model === "gpt-image-2" || model.startsWith("gpt-image-2-");
}

function isSnapgenGrokImage(model: string) {
  return model === "grok-image";
}

function snapgenGenerationEndpoint(model: string) {
  return new URL(
    isSnapgenGrokImage(model)
      ? "/uapi/v1/imagen/grok"
      : isSnapgenGptImage2(model)
        ? "/uapi/v1/imagen/gpt-image-2"
        : "/uapi/v1/generate_image",
    snapgenBaseUrl(),
  );
}

function snapgenGptMode(request: GenerationRequest) {
  if (["low", "medium", "high"].includes(request.quality ?? ""))
    return request.quality!;
  return request.model.match(/-(low|medium|high)$/)?.[1] ?? "low";
}

function snapgenGrokOrientation(aspectRatio: string) {
  if (["landscape", "portrait", "square"].includes(aspectRatio))
    return aspectRatio;
  const match = aspectRatio.match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
  if (!match) return "landscape";
  const width = Number(match[1]);
  const height = Number(match[2]);
  return width === height ? "square" : width > height ? "landscape" : "portrait";
}

function snapgenGrokMode(request: GenerationRequest) {
  const mode = request.quality?.toUpperCase();
  return mode === "QUALITY" ? "QUALITY" : "SPEED";
}

function snapgenRequestFields(request: GenerationRequest) {
  if (isSnapgenGrokImage(request.model))
    return {
      prompt: request.prompt,
      orientation: snapgenGrokOrientation(request.aspectRatio),
      num_result: "1",
      mode: snapgenGrokMode(request),
    };
  const common = {
    prompt: request.prompt,
    aspect_ratio: request.aspectRatio,
    resolution: request.resolution,
  };
  return isSnapgenGptImage2(request.model)
    ? { ...common, mode: snapgenGptMode(request) }
    : { ...common, model: request.model };
}

async function snapgenJsonResponse(response: Response, operation: string) {
  if (!response.ok) {
    const responseText = await response.text();
    const returnedHtml =
      response.headers.get("content-type")?.includes("text/html") ||
      /^\s*<!doctype html|^\s*<html/i.test(responseText);
    throw new Error(
      returnedHtml
        ? `SnapGenAI ${operation} failed with status ${response.status}. The provider gateway returned an HTML error page instead of JSON.`
        : `SnapGenAI ${operation} failed with status ${response.status}: ${responseText.slice(0, 300)}`,
    );
  }
  const payload: unknown = await response.json();
  const root = asRecord(payload);
  const nested = asRecord(root?.data) ?? asRecord(root?.result);
  const record = nested ?? root;
  if (!record) throw new Error(`SnapGenAI returned invalid ${operation} JSON.`);
  return record;
}

function snapgenStatus(record: UnknownRecord) {
  const status = asNumber(record.status);
  return status ??
    (typeof record.status === "string" ? Number(record.status) : null);
}

function snapgenJobId(record: UnknownRecord) {
  const value = record.uuid ?? record.conversion_uuid ?? record.id;
  return typeof value === "string" && value ? value : null;
}

function snapgenErrorMessage(record: UnknownRecord) {
  const value = record.error_message ?? record.error ?? record.message;
  return typeof value === "string" ? value : "SnapGenAI generation failed.";
}

async function waitForSnapgenResult(initial: UnknownRecord) {
  let record = initial;
  const jobId = snapgenJobId(record);
  if (!jobId) throw new Error("SnapGenAI response did not include a job UUID.");
  const configuredDelay = Number(process.env.SNAPGEN_POLL_INTERVAL_MS ?? 2000);
  const delay = Number.isFinite(configuredDelay)
    ? Math.max(0, Math.min(configuredDelay, 10_000))
    : 2000;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const status = snapgenStatus(record);
    if (status === 2) return record;
    if (status === 3) throw new Error(snapgenErrorMessage(record));
    if (attempt === 59)
      throw new Error("SnapGenAI generation did not complete before timeout.");
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    const historyUrl = new URL(
      `/uapi/v1/history/${encodeURIComponent(jobId)}`,
      snapgenBaseUrl(),
    );
    record = await snapgenJsonResponse(
      await fetch(historyUrl, {
        headers: { "x-api-key": process.env.SNAPGEN_API_KEY! },
        cache: "no-store",
      }),
      "history lookup",
    );
  }
  throw new Error("SnapGenAI generation did not complete.");
}

function snapgenOutput(record: UnknownRecord) {
  if (typeof record.generate_result === "string")
    return { url: record.generate_result };
  const generated = Array.isArray(record.generated_image)
    ? record.generated_image
    : [];
  const first = asRecord(generated[0]);
  if (!first) return null;
  const url = first.file_download_url ?? first.image_url ?? first.image_uri;
  const base64 = first.base64_data;
  return {
    url: typeof url === "string" ? url : undefined,
    base64: typeof base64 === "string" ? base64 : undefined,
    mimeType:
      typeof first.mime_type === "string" ? first.mime_type : undefined,
    width: asNumber(first.width),
    height: asNumber(first.height),
  };
}

async function materializeSnapgenResult(
  record: UnknownRecord,
): Promise<GeneratedImage> {
  const jobId = snapgenJobId(record)!;
  const output = snapgenOutput(record);
  if (!output?.url && !output?.base64)
    throw new Error("SnapGenAI completed without a recognizable image result.");
  const downloaded = output.url
    ? await downloadImage(new URL(output.url, snapgenBaseUrl()).toString())
    : {
        buffer: Buffer.from(
          output.base64!.replace(/^data:[^;]+;base64,/, ""),
          "base64",
        ),
        mimeType: output.mimeType ?? "application/octet-stream",
      };
  return {
    buffer: downloaded.buffer,
    mimeType: output.mimeType ?? downloaded.mimeType,
    // Each SnapGen candidate is submitted as its own generation job. Keep the
    // exact UUID because follow-up APIs such as logo removal require it.
    providerRequestId: jobId,
    providerReportedWidth: output.width ?? null,
    providerReportedHeight: output.height ?? null,
  };
}

function cloudflareWorkerBody(request: GenerationRequest) {
  return {
    prompt: request.prompt,
    model: request.model,
    width: request.requestedWidth,
    height: request.requestedHeight,
  };
}

function cloudflareWorkerEndpoint() {
  const endpoint = new URL(process.env.CLOUDFLARE_WORKER_AI_URL!);
  if (!new Set(["http:", "https:"]).has(endpoint.protocol))
    throw new Error("Cloudflare Worker URL must use HTTP or HTTPS.");
  return endpoint;
}

function endpointForLog(endpoint: URL) {
  const safe = new URL(endpoint);
  safe.username = "";
  safe.password = "";
  for (const key of safe.searchParams.keys())
    safe.searchParams.set(key, "[REDACTED]");
  return safe.toString();
}

/** Adapter for the owner-controlled Cloudflare Worker image endpoint. */
export class CloudflareWorkersAiImageGenerationProvider
  implements ImageGenerationProvider
{
  readonly id = "cloudflare-workers-ai";
  readonly label = "Cloudflare Workers AI";
  readonly paid = true;

  isConfigured() {
    return Boolean(
      process.env.CLOUDFLARE_WORKER_AI_URL &&
        process.env.CLOUDFLARE_WORKER_AI_API_KEY,
    );
  }

  normalizeRequestForProvider(request: GenerationRequest) {
    const endpoint = cloudflareWorkerEndpoint();
    return {
      transport: "http-json",
      method: "POST",
      endpoint: endpointForLog(endpoint),
      calls: Array.from({ length: request.candidates }, () => ({
        body: cloudflareWorkerBody(request),
      })),
      omittedHeaders: ["authorization"],
      responseContract: "raw-image-bytes",
    };
  }

  async generate(request: GenerationRequest): Promise<GeneratedImage[]> {
    if (!this.isConfigured())
      throw new Error(
        "Cloudflare Workers AI requires CLOUDFLARE_WORKER_AI_URL and CLOUDFLARE_WORKER_AI_API_KEY.",
      );
    const endpoint = cloudflareWorkerEndpoint();

    const outputs: GeneratedImage[] = [];
    for (let index = 0; index < request.candidates; index += 1) {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${process.env.CLOUDFLARE_WORKER_AI_API_KEY}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(cloudflareWorkerBody(request)),
        cache: "no-store",
      });
      if (!response.ok)
        throw new Error(
          `Cloudflare Workers AI generation failed with status ${response.status}: ${(await response.text()).slice(0, 300)}`,
        );
      const mimeType =
        response.headers.get("content-type")?.split(";")[0] ?? "";
      if (!mimeType.startsWith("image/"))
        throw new Error(
          `Cloudflare Workers AI returned unsupported content type ${mimeType || "unknown"}.`,
        );
      const declaredSize = Number(response.headers.get("content-length") ?? 0);
      if (declaredSize > 50 * 1024 * 1024)
        throw new Error("Cloudflare Workers AI image exceeds the 50MB limit.");
      const buffer = Buffer.from(await response.arrayBuffer());
      if (!buffer.byteLength)
        throw new Error("Cloudflare Workers AI returned an empty image.");
      if (buffer.byteLength > 50 * 1024 * 1024)
        throw new Error("Cloudflare Workers AI image exceeds the 50MB limit.");
      const requestId =
        response.headers.get("cf-ray") ??
        response.headers.get("x-request-id") ??
        randomUUID();
      outputs.push({
        buffer,
        mimeType,
        providerRequestId: `cloudflare-${requestId}-${index + 1}`,
        providerReportedWidth: null,
        providerReportedHeight: null,
      });
    }
    return outputs;
  }
}

export class BlackForestLabsImageGenerationProvider implements ImageGenerationProvider {
  readonly id = "black-forest-labs";
  readonly label = "Black Forest Labs";
  readonly paid = true;
  isConfigured() {
    return Boolean(process.env.BFL_API_KEY && process.env.BFL_API_BASE_URL);
  }
  async generate(request: GenerationRequest) {
    if (!this.isConfigured())
      throw new Error(
        "Black Forest Labs requires BFL_API_KEY and BFL_API_BASE_URL.",
      );
    const endpoint = new URL(
      `${process.env.BFL_API_BASE_URL!.replace(/\/$/, "")}/${request.model.replace(/^\//, "")}`,
    );
    const outputs: GeneratedImage[] = [];
    for (let index = 0; index < request.candidates; index += 1) {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "x-key": process.env.BFL_API_KEY!,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          prompt: request.prompt,
          width: request.requestedWidth,
          height: request.requestedHeight,
          seed: request.seed === undefined ? undefined : request.seed + index,
          output_format: "jpeg",
        }),
        cache: "no-store",
      });
      if (!response.ok)
        throw new Error(
          `Black Forest Labs generation failed with status ${response.status}: ${(await response.text()).slice(0, 300)}`,
        );
      const submitted = asRecord(await response.json());
      const pollingUrl =
        submitted && (submitted.polling_url ?? submitted.pollingUrl);
      if (typeof pollingUrl !== "string")
        throw new Error("Black Forest Labs returned no polling URL.");
      let completed: unknown;
      for (let attempt = 0; attempt < 60; attempt += 1) {
        const poll = await fetch(pollingUrl, {
          headers: { "x-key": process.env.BFL_API_KEY! },
          cache: "no-store",
        });
        if (!poll.ok)
          throw new Error(
            `Black Forest Labs polling failed with status ${poll.status}.`,
          );
        const result = asRecord(await poll.json());
        if (result?.status === "Ready" || result?.result) {
          completed = { id: submitted?.id, images: [result.result] };
          break;
        }
        if (result?.status === "Error" || result?.status === "Failed")
          throw new Error(
            "Black Forest Labs generation failed while processing.",
          );
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      if (!completed)
        throw new Error("Black Forest Labs generation timed out.");
      outputs.push(...(await materializeNormalizedImages(completed)));
    }
    return outputs;
  }
}

export class GeminiImageGenerationProvider implements ImageGenerationProvider {
  readonly id = "gemini";
  readonly label = "Google Gemini image";
  readonly paid = true;
  isConfigured() {
    return Boolean(process.env.GEMINI_API_KEY);
  }
  async generate(request: GenerationRequest): Promise<GeneratedImage[]> {
    if (!this.isConfigured())
      throw new Error("GEMINI_API_KEY is not configured.");
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
    const outputs: GeneratedImage[] = [];
    for (let index = 0; index < request.candidates; index += 1) {
      const response = await ai.models.generateContent({
        model: request.model,
        contents: [
          request.prompt,
          request.negativePrompt ? `Avoid: ${request.negativePrompt}` : "",
        ]
          .filter(Boolean)
          .join("\n\n"),
        config: {
          responseModalities: ["TEXT", "IMAGE"],
          imageConfig: {
            aspectRatio: request.aspectRatio,
            imageSize: request.resolution,
          },
        },
      });
      const inline = response.candidates?.[0]?.content?.parts?.find(
        (part) => part.inlineData,
      )?.inlineData;
      if (!inline?.data) throw new Error("Gemini returned no image data.");
      outputs.push({
        buffer: Buffer.from(inline.data, "base64"),
        mimeType: inline.mimeType ?? "image/png",
        providerRequestId: response.responseId ?? `gemini-${randomUUID()}`,
        providerReportedWidth: null,
        providerReportedHeight: null,
      });
    }
    return outputs;
  }
}

export function createGenerationProvider(
  providerId: string,
): ImageGenerationProvider {
  const providers: ImageGenerationProvider[] = [
    new MockImageGenerationProvider(),
    new SnapGenImageGenerationProvider(),
    new CloudflareWorkersAiImageGenerationProvider(),
    new BlackForestLabsImageGenerationProvider(),
    new GeminiImageGenerationProvider(),
    new ImportedImageProvider(),
  ];
  const provider = providers.find((candidate) => candidate.id === providerId);
  if (!provider)
    throw new Error(`Unknown image generation provider: ${providerId}`);
  return provider;
}
