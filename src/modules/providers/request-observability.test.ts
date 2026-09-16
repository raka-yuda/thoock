import { describe, expect, it, vi } from "vitest";
import type { GeneratedImage, GenerationRequest } from "./contracts";
import {
  observeProviderGeneration,
  observeProviderLogoRemoval,
  sanitizeProviderLogValue,
  type ProviderRequestLogWriter,
} from "./request-observability";

const request: GenerationRequest = {
  prompt: "A useful commercial image prompt",
  negativePrompt: "logos",
  model: "test-model",
  requestedWidth: 1_600,
  requestedHeight: 1_200,
  aspectRatio: "4:3",
  resolution: "economical",
  quality: "standard",
  candidates: 1,
  seed: 42,
  referenceImages: [
    {
      buffer: Buffer.from("private image bytes"),
      mimeType: "image/jpeg",
      filename: "reference.jpg",
    },
  ],
};

function makeWriter() {
  const calls: {
    started?: Parameters<ProviderRequestLogWriter["start"]>[0];
    accepted?: string[];
    succeeded?: Parameters<ProviderRequestLogWriter["succeed"]>[1];
    failed?: Parameters<ProviderRequestLogWriter["fail"]>[1];
  } = {};
  const writer: ProviderRequestLogWriter = {
    start: vi.fn(async (input) => {
      calls.started = input;
      return "log-1";
    }),
    succeed: vi.fn(async (_id, input) => {
      calls.succeeded = input;
    }),
    accepted: vi.fn(async (_id, providerRequestIds) => {
      calls.accepted = providerRequestIds;
    }),
    fail: vi.fn(async (_id, input) => {
      calls.failed = input;
    }),
  };
  return { calls, writer };
}

describe("provider request observability", () => {
  it("redacts credentials and replaces binary request data with a summary", () => {
    expect(
      sanitizeProviderLogValue({
        prompt: "visible prompt",
        apiKey: "top-secret",
        nested: { access_token: "secret-token" },
        image: Buffer.from("pixels"),
      }),
    ).toEqual({
      prompt: "visible prompt",
      apiKey: "[REDACTED]",
      nested: { access_token: "[REDACTED]" },
      image: { binaryData: "[NOT STORED]", byteLength: 6 },
    });
  });

  it("records a sanitized request and a binary-free response summary", async () => {
    const { calls, writer } = makeWriter();
    const generated: GeneratedImage[] = [
      {
        buffer: Buffer.alloc(256),
        mimeType: "image/jpeg",
        providerRequestId: "provider-request-1",
        providerReportedWidth: 1_600,
        providerReportedHeight: 1_200,
        actualCostUsd: 0.015,
      },
    ];

    await expect(
      observeProviderGeneration(
        {
          generationJobId: "job-1",
          sourcePath: "/api/generation",
          idempotencyKey: "idempotency-1",
          provider: "test-provider",
          model: "test-model",
          estimatedCostUsd: 0.015,
          requestBody: {
            prompt: request.prompt,
            apiKey: "must-not-be-stored",
          },
          providerRequest: request,
        },
        async () => generated,
        writer,
      ),
    ).resolves.toBe(generated);

    expect(calls.started).toMatchObject({
      generationJobId: "job-1",
      sourcePath: "/api/generation",
      provider: "test-provider",
      requestBody: {
        prompt: request.prompt,
        apiKey: "[REDACTED]",
      },
    });
    expect(calls.started?.providerRequestBody).toMatchObject({
      prompt: request.prompt,
      referenceImages: [
        {
          buffer: { binaryData: "[NOT STORED]", byteLength: 19 },
          filename: "reference.jpg",
        },
      ],
    });
    expect(calls.succeeded).toMatchObject({
      providerRequestIds: ["provider-request-1"],
      actualCostUsd: 0.015,
      responseBody: {
        imageCount: 1,
        binaryData: "[NOT STORED]",
        images: [
          {
            byteLength: 256,
            providerRequestId: "provider-request-1",
          },
        ],
      },
    });
  });

  it("records a redacted failure and preserves the original provider error", async () => {
    process.env.CLOUDFLARE_WORKER_AI_API_KEY = "worker-secret";
    const { calls, writer } = makeWriter();
    const providerError = new Error(
      "Request failed with Bearer abc123 and worker-secret",
    );

    await expect(
      observeProviderGeneration(
        {
          generationJobId: null,
          sourcePath: "/api/generation",
          idempotencyKey: "idempotency-2",
          provider: "test-provider",
          model: "test-model",
          estimatedCostUsd: null,
          requestBody: request,
          providerRequest: request,
        },
        async () => {
          throw providerError;
        },
        writer,
      ),
    ).rejects.toBe(providerError);

    expect(calls.failed?.errorDetails).toBe(
      "Request failed with Bearer [REDACTED] and [REDACTED]",
    );
    delete process.env.CLOUDFLARE_WORKER_AI_API_KEY;
  });

  it("stores an accepted provider ID even when later result polling fails", async () => {
    const { calls, writer } = makeWriter();
    const providerError = new Error("History lookup failed with status 524");
    const persistAccepted = vi.fn();

    await expect(
      observeProviderGeneration(
        {
          generationJobId: "job-after-acceptance",
          sourcePath: "/api/generation",
          idempotencyKey: "idempotency-after-acceptance",
          provider: "snapgen",
          model: "nano-banana-pro",
          estimatedCostUsd: null,
          requestBody: request,
          providerRequest: request,
          onProviderRequestAccepted: persistAccepted,
        },
        async (onProviderRequestAccepted) => {
          await onProviderRequestAccepted?.("snap-history-524", 0);
          throw providerError;
        },
        writer,
      ),
    ).rejects.toBe(providerError);

    expect(calls.accepted).toEqual(["snap-history-524"]);
    expect(persistAccepted).toHaveBeenCalledWith("snap-history-524", 0);
    expect(calls.failed?.errorDetails).toContain("status 524");
  });

  it("records the separate SnapGen logo-removal operation without image bytes", async () => {
    const { calls, writer } = makeWriter();
    const result = {
      buffer: Buffer.alloc(512),
      mimeType: "image/png",
      historyUuid: "nano-job-1",
      removalJobId: "removal-1",
      mode: "fast" as const,
      estimatedCredits: 0,
      usedCredits: 0,
    };

    await expect(
      observeProviderLogoRemoval(
        {
          generationJobId: "job-1",
          sourcePath: "/api/generation",
          idempotencyKey: "idempotency-1:logo-removal:nano-job-1",
          model: "nano-banana-pro",
          historyUuid: "nano-job-1",
          providerRequest: {
            body: { history_uuid: "nano-job-1", mode: "fast" },
          },
        },
        async () => result,
        writer,
      ),
    ).resolves.toBe(result);

    expect(calls.started).toMatchObject({
      operation: "logo_removal",
      provider: "snapgen",
      estimatedCostUsd: 0,
    });
    expect(calls.succeeded).toMatchObject({
      providerRequestIds: ["nano-job-1", "removal-1"],
      actualCostUsd: 0,
      responseBody: {
        byteLength: 512,
        binaryData: "[NOT STORED]",
        mode: "fast",
        usedCredits: 0,
      },
    });
  });
});
