import "server-only";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import sharp from "sharp";
import { calculateMegapixels } from "@/lib/domain/image";
import { estimateUpscaleCost } from "@/lib/domain/cost";
import type { ImageUpscaleProvider, UpscaleRequest } from "./contracts";

const execFileAsync = promisify(execFile);

async function inspect(input: Buffer) {
  const metadata = await sharp(input).metadata();
  if (!metadata.width || !metadata.height)
    throw new Error("Input dimensions are unavailable.");
  return {
    width: metadata.width,
    height: metadata.height,
    megapixels: calculateMegapixels(metadata.width, metadata.height),
  };
}

abstract class ImmediateUpscaleProvider implements ImageUpscaleProvider {
  abstract readonly id: string;
  abstract readonly label: string;
  abstract readonly isAi: boolean;
  abstract readonly mayReinterpretDetail: boolean;
  protected results = new Map<string, Buffer>();
  isConfigured() {
    return true;
  }
  inspectInput = inspect;
  abstract estimateCost(request: UpscaleRequest): Promise<number | null>;
  abstract upscale(
    request: UpscaleRequest,
  ): Promise<{
    id: string;
    status: "succeeded";
    buffer: Buffer;
    actualCostUsd: number;
  }>;
  async getJobStatus(id: string) {
    return this.results.has(id) ? ("succeeded" as const) : ("failed" as const);
  }
  async downloadResult(id: string) {
    const result = this.results.get(id);
    if (!result) throw new Error("Upscale result not found.");
    return result;
  }
}

export class NoopUpscaleProvider extends ImmediateUpscaleProvider {
  readonly id = "noop";
  readonly label = "No upscale required";
  readonly isAi = false;
  readonly mayReinterpretDetail = false;
  async estimateCost() {
    return 0;
  }
  async upscale(request: UpscaleRequest) {
    const id = `noop-${randomUUID()}`;
    this.results.set(id, request.input);
    return {
      id,
      status: "succeeded" as const,
      buffer: request.input,
      actualCostUsd: 0,
    };
  }
}

export class SharpResizeProvider extends ImmediateUpscaleProvider {
  readonly id = "sharp";
  readonly label = "Sharp standard resize";
  readonly isAi = false;
  readonly mayReinterpretDetail = false;
  async estimateCost() {
    return 0;
  }
  async upscale(request: UpscaleRequest) {
    const buffer = await sharp(request.input)
      .rotate()
      .resize(request.targetWidth, request.targetHeight, {
        kernel: sharp.kernel.lanczos3,
        fit: "fill",
      })
      .toBuffer();
    const id = `sharp-${randomUUID()}`;
    this.results.set(id, buffer);
    return { id, status: "succeeded" as const, buffer, actualCostUsd: 0 };
  }
}

export class MockUpscaleProvider extends ImmediateUpscaleProvider {
  readonly id = "mock-upscale";
  readonly label = "Mock AI upscale";
  readonly isAi = true;
  readonly mayReinterpretDetail = true;
  async estimateCost() {
    return 0;
  }
  async upscale(request: UpscaleRequest) {
    const overlay = Buffer.from(
      `<svg width="${request.targetWidth}" height="${request.targetHeight}" xmlns="http://www.w3.org/2000/svg"><rect x="24" y="24" width="330" height="64" rx="12" fill="rgba(0,0,0,.72)"/><text x="48" y="67" fill="white" font-family="Arial" font-size="25" font-weight="700">MOCK UPSCALE</text></svg>`,
    );
    const buffer = await sharp(request.input)
      .rotate()
      .resize(request.targetWidth, request.targetHeight, {
        kernel: sharp.kernel.lanczos3,
        fit: "fill",
      })
      .composite([{ input: overlay }])
      .jpeg({ quality: 94 })
      .toBuffer();
    const id = `mock-upscale-${randomUUID()}`;
    this.results.set(id, buffer);
    return { id, status: "succeeded" as const, buffer, actualCostUsd: 0 };
  }
}

export class LocalUpscaleProvider extends ImmediateUpscaleProvider {
  readonly id = "local-upscale";
  readonly label = "Local AI upscale";
  readonly isAi = true;
  readonly mayReinterpretDetail = true;
  isConfigured() {
    return (
      process.env.LOCAL_UPSCALE_ENABLED === "true" &&
      Boolean(
        process.env.LOCAL_UPSCALE_URL || process.env.LOCAL_UPSCALE_EXECUTABLE,
      )
    );
  }
  async estimateCost() {
    return this.isConfigured() ? 0 : null;
  }
  async upscale(request: UpscaleRequest) {
    if (!this.isConfigured())
      throw new Error(
        "Local upscaling is disabled or missing its worker configuration.",
      );
    let buffer: Buffer;
    if (process.env.LOCAL_UPSCALE_URL) {
      const form = new FormData();
      form.set(
        "image",
        new Blob([new Uint8Array(request.input)], { type: request.mimeType }),
        "input.jpg",
      );
      form.set("target_width", String(request.targetWidth));
      form.set("target_height", String(request.targetHeight));
      const response = await fetch(process.env.LOCAL_UPSCALE_URL, {
        method: "POST",
        body: form,
        cache: "no-store",
      });
      if (!response.ok)
        throw new Error(
          `Local upscale worker failed with status ${response.status}.`,
        );
      buffer = Buffer.from(await response.arrayBuffer());
    } else {
      const taskDirectory = join(tmpdir(), `stocklab-upscale-${randomUUID()}`);
      const inputPath = join(taskDirectory, "input.png");
      const outputPath = join(taskDirectory, "output.png");
      await mkdir(taskDirectory, { recursive: false });
      try {
        await writeFile(inputPath, request.input);
        const scale = Math.min(
          4,
          Math.max(
            2,
            Math.ceil(
              Math.max(
                request.targetWidth / request.width,
                request.targetHeight / request.height,
              ),
            ),
          ),
        );
        // execFile does not invoke a shell. Arguments are fixed by the adapter and never accept user-supplied command fragments.
        await execFileAsync(
          process.env.LOCAL_UPSCALE_EXECUTABLE!,
          ["-i", inputPath, "-o", outputPath, "-s", String(scale)],
          { timeout: 10 * 60_000, maxBuffer: 1024 * 1024 },
        );
        buffer = await readFile(outputPath);
      } finally {
        await rm(taskDirectory, { recursive: true, force: true });
      }
    }
    const exactOutput = await sharp(buffer)
      .rotate()
      .resize(request.targetWidth, request.targetHeight, {
        fit: "fill",
        kernel: sharp.kernel.lanczos3,
      })
      .toBuffer();
    const id = `local-upscale-${randomUUID()}`;
    this.results.set(id, exactOutput);
    return {
      id,
      status: "succeeded" as const,
      buffer: exactOutput,
      actualCostUsd: 0,
    };
  }
}

export class StabilityUpscaleProvider implements ImageUpscaleProvider {
  readonly id = "stability";
  readonly label = "Stability AI upscale";
  readonly isAi = true;
  readonly mayReinterpretDetail = true;
  private results = new Map<string, Buffer>();
  isConfigured() {
    return Boolean(process.env.STABILITY_API_KEY);
  }
  inspectInput = inspect;
  async estimateCost(request: UpscaleRequest) {
    const configured = {
      fast: process.env.STABILITY_FAST_UPSCALE_COST_USD
        ? Number(process.env.STABILITY_FAST_UPSCALE_COST_USD)
        : undefined,
      conservative: process.env.STABILITY_CONSERVATIVE_UPSCALE_COST_USD
        ? Number(process.env.STABILITY_CONSERVATIVE_UPSCALE_COST_USD)
        : undefined,
      creative: process.env.STABILITY_CREATIVE_UPSCALE_COST_USD
        ? Number(process.env.STABILITY_CREATIVE_UPSCALE_COST_USD)
        : undefined,
    };
    return estimateUpscaleCost(request.method, configured);
  }

  async upscale(request: UpscaleRequest) {
    const apiKey = process.env.STABILITY_API_KEY;
    if (!apiKey) throw new Error("STABILITY_API_KEY is not configured.");
    if (
      request.method === "creative" &&
      process.env.ENABLE_CREATIVE_UPSCALE !== "true"
    )
      throw new Error("Creative Upscale is disabled by default.");
    if (!["fast", "conservative", "creative"].includes(request.method))
      throw new Error("Unsupported Stability upscale method.");
    const form = new FormData();
    form.set(
      "image",
      new Blob([new Uint8Array(request.input)], { type: request.mimeType }),
      "input.jpg",
    );
    form.set("output_format", "jpeg");
    if (request.method !== "fast")
      form.set(
        "prompt",
        request.prompt ||
          "Preserve the original image faithfully with natural detail",
      );
    const response = await fetch(
      `https://api.stability.ai/v2beta/stable-image/upscale/${request.method}`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          accept:
            request.method === "creative" ? "application/json" : "image/*",
        },
        body: form,
      },
    );
    if (!response.ok)
      throw new Error(
        `Stability upscale failed with status ${response.status}: ${(await response.text()).slice(0, 300)}`,
      );
    if (request.method === "creative") {
      const data = (await response.json()) as { id: string };
      return { id: data.id, status: "running" as const };
    }
    let buffer: Buffer<ArrayBufferLike> = Buffer.from(
      await response.arrayBuffer(),
    );
    const dimensions = await inspect(buffer);
    if (
      dimensions.width !== request.targetWidth ||
      dimensions.height !== request.targetHeight
    ) {
      buffer = await sharp(buffer)
        .resize(request.targetWidth, request.targetHeight, {
          fit: "fill",
          kernel: sharp.kernel.lanczos3,
        })
        .jpeg({ quality: 94 })
        .toBuffer();
    }
    const id = `stability-${randomUUID()}`;
    this.results.set(id, buffer);
    const estimatedCost = await this.estimateCost(request);
    return {
      id,
      status: "succeeded" as const,
      buffer,
      actualCostUsd: estimatedCost ?? undefined,
    };
  }

  async getJobStatus(id: string) {
    if (this.results.has(id)) return "succeeded" as const;
    const apiKey = process.env.STABILITY_API_KEY;
    if (!apiKey) return "failed" as const;
    const response = await fetch(
      `https://api.stability.ai/v2beta/results/${id}`,
      {
        headers: { authorization: `Bearer ${apiKey}`, accept: "image/*" },
        cache: "no-store",
      },
    );
    if (response.status === 202) return "running" as const;
    if (!response.ok) return "failed" as const;
    this.results.set(id, Buffer.from(await response.arrayBuffer()));
    return "succeeded" as const;
  }

  async downloadResult(id: string) {
    const existing = this.results.get(id);
    if (existing) return existing;
    const status = await this.getJobStatus(id);
    const result = this.results.get(id);
    if (status !== "succeeded" || !result)
      throw new Error("Upscale result is not ready.");
    return result;
  }
}
