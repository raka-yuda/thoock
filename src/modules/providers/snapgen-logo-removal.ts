import "server-only";

type UnknownRecord = Record<string, unknown>;

export type SnapGenLogoRemovalMode = "fast" | "pro";

export type SnapGenLogoRemovalResult = {
  buffer: Buffer;
  mimeType: string;
  historyUuid: string;
  removalJobId: string;
  mode: SnapGenLogoRemovalMode;
  estimatedCredits: number | null;
  usedCredits: number | null;
};

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function baseUrl() {
  const configured = process.env.SNAPGEN_API_BASE_URL;
  if (!configured) throw new Error("SNAPGEN_API_BASE_URL is not configured.");
  const url = new URL(configured);
  if (!new Set(["http:", "https:"]).has(url.protocol))
    throw new Error("SnapGenAI base URL must use HTTP or HTTPS.");
  return url;
}

function apiHeaders(json = false) {
  const apiKey = process.env.SNAPGEN_API_KEY;
  if (!apiKey) throw new Error("SNAPGEN_API_KEY is not configured.");
  return {
    "x-api-key": apiKey,
    ...(json ? { "content-type": "application/json" } : {}),
  };
}

async function jsonResponse(response: Response, operation: string) {
  if (!response.ok)
    throw new Error(
      `SnapGenAI ${operation} failed with status ${response.status}: ${(await response.text()).slice(0, 300)}`,
    );
  return (await response.json()) as unknown;
}

function removalRecords(payload: unknown): UnknownRecord[] {
  if (Array.isArray(payload))
    return payload.map(asRecord).filter((item): item is UnknownRecord => Boolean(item));
  const root = asRecord(payload);
  if (!root) return [];
  for (const value of [
    root.data,
    root.result,
    root.jobs,
    root.watermark_removal,
  ]) {
    if (Array.isArray(value))
      return value
        .map(asRecord)
        .filter((item): item is UnknownRecord => Boolean(item));
    const nested = asRecord(value);
    if (nested) {
      const nestedJobs = nested.watermark_removal ?? nested.jobs ?? nested.data;
      if (Array.isArray(nestedJobs))
        return nestedJobs
          .map(asRecord)
          .filter((item): item is UnknownRecord => Boolean(item));
      return [nested];
    }
  }
  return [root];
}

function statusOf(record: UnknownRecord) {
  return asNumber(record.status);
}

function errorOf(record: UnknownRecord) {
  const message = record.error_message ?? record.error ?? record.message;
  return typeof message === "string" && message
    ? message
    : "SnapGenAI logo removal failed.";
}

function idOf(record: UnknownRecord, historyUuid: string) {
  const value = record.id ?? record.uuid ?? record.removal_uuid;
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : historyUuid;
}

function resultUrlOf(record: UnknownRecord) {
  const value = record.result_url ?? record.file_download_url ?? record.url;
  return typeof value === "string" && value ? value : null;
}

async function downloadResult(url: string) {
  const resolved = new URL(url, baseUrl());
  if (!new Set(["http:", "https:"]).has(resolved.protocol))
    throw new Error("SnapGenAI logo-removal result uses an unsupported protocol.");
  const response = await fetch(resolved, { cache: "no-store" });
  if (!response.ok)
    throw new Error(
      `SnapGenAI logo-removal download failed with status ${response.status}.`,
    );
  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    mimeType:
      response.headers.get("content-type")?.split(";")[0] ??
      "application/octet-stream",
  };
}

export function isSnapgenNanoModel(model: string) {
  return model === "nano-banana-pro" || model.startsWith("nano-banana-2");
}

export class SnapGenLogoRemovalProvider {
  readonly id = "snapgen";
  readonly label = "SnapGenAI logo removal";

  isConfigured() {
    return Boolean(
      process.env.SNAPGEN_API_KEY && process.env.SNAPGEN_API_BASE_URL,
    );
  }

  normalizeRequest(historyUuid: string, mode: SnapGenLogoRemovalMode) {
    return {
      method: "POST",
      endpoint: new URL("/uapi/v1/remove-logo", baseUrl()).toString(),
      body: { history_uuid: historyUuid, mode },
      omittedHeaders: ["x-api-key"],
      responseContract: "async-logo-removal-job",
    };
  }

  async remove(
    historyUuid: string,
    mode: SnapGenLogoRemovalMode = "fast",
  ): Promise<SnapGenLogoRemovalResult> {
    if (!this.isConfigured())
      throw new Error(
        "SnapGenAI logo removal requires SNAPGEN_API_KEY and SNAPGEN_API_BASE_URL.",
      );
    if (!historyUuid.trim())
      throw new Error("SnapGenAI logo removal requires a generation UUID.");

    const endpoint = new URL("/uapi/v1/remove-logo", baseUrl());
    const submitted = await jsonResponse(
      await fetch(endpoint, {
        method: "POST",
        headers: apiHeaders(true),
        body: JSON.stringify({ history_uuid: historyUuid, mode }),
        cache: "no-store",
      }),
      "logo removal",
    );
    let records = removalRecords(submitted);
    let record = records.at(-1);
    if (!record)
      throw new Error("SnapGenAI returned an invalid logo-removal response.");

    const configuredDelay = Number(process.env.SNAPGEN_POLL_INTERVAL_MS ?? 2_000);
    const delay = Number.isFinite(configuredDelay)
      ? Math.max(0, Math.min(configuredDelay, 10_000))
      : 2_000;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const status = statusOf(record);
      if (status === 2) {
        const resultUrl = resultUrlOf(record);
        if (!resultUrl)
          throw new Error(
            "SnapGenAI completed logo removal without a result URL.",
          );
        const result = await downloadResult(resultUrl);
        return {
          ...result,
          historyUuid,
          removalJobId: idOf(record, historyUuid),
          mode,
          estimatedCredits: asNumber(record.estimated_credit),
          usedCredits: asNumber(record.used_credit),
        };
      }
      if (status === 3) throw new Error(errorOf(record));
      if (attempt === 59)
        throw new Error(
          "SnapGenAI logo removal did not complete before timeout.",
        );
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      const statusUrl = new URL(
        `/uapi/v1/remove-logo/${encodeURIComponent(historyUuid)}`,
        baseUrl(),
      );
      records = removalRecords(
        await jsonResponse(
          await fetch(statusUrl, {
            headers: apiHeaders(),
            cache: "no-store",
          }),
          "logo-removal status lookup",
        ),
      );
      record = records.at(-1);
      if (!record)
        throw new Error("SnapGenAI returned no logo-removal job status.");
    }
    throw new Error("SnapGenAI logo removal did not complete.");
  }
}
