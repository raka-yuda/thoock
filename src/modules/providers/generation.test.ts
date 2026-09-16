import { afterEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import {
  CloudflareWorkersAiImageGenerationProvider,
  ImportedImageProvider,
  MockImageGenerationProvider,
  SnapGenImageGenerationProvider,
  normalizeImageResponse,
} from "./generation";
import { SharpInspectionProvider } from "./inspection";

describe("generation provider normalization", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("normalizes SnapGen-style URL and base64 envelopes without trusting extensions", () => {
    expect(
      normalizeImageResponse({
        request_id: "req-1",
        data: [
          { url: "https://example.test/output" },
          { b64_json: "YWJj", width: 100, height: 80 },
        ],
      }),
    ).toEqual({
      requestId: "req-1",
      images: [
        {
          url: "https://example.test/output",
          base64: undefined,
          mimeType: undefined,
          width: undefined,
          height: undefined,
        },
        {
          url: undefined,
          base64: "YWJj",
          mimeType: undefined,
          width: 100,
          height: 80,
        },
      ],
    });
  });

  it("normalizes Black Forest Labs sample output", () => {
    expect(
      normalizeImageResponse({
        id: "req-2",
        images: [{ sample: "https://example.test/sample.jpg" }],
      }).images[0].url,
    ).toContain("sample.jpg");
  });

  it("leaves imported dimensions unknown until Sharp inspection", async () => {
    const buffer = await sharp({
      create: { width: 1234, height: 987, channels: 3, background: "#335544" },
    })
      .png()
      .toBuffer();
    const [result] = await new ImportedImageProvider().generate({
      prompt: "Imported owned image for stock review",
      model: "import",
      requestedWidth: 1,
      requestedHeight: 1,
      aspectRatio: "custom",
      resolution: "actual",
      candidates: 1,
      importedImages: [
        { buffer, mimeType: "image/png", filename: "claimed-4k.jpg" },
      ],
    });
    expect(result.providerReportedWidth).toBeNull();
    const inspected = await new SharpInspectionProvider().inspect(
      result.buffer,
    );
    expect(inspected).toMatchObject({
      width: 1234,
      height: 987,
      format: "png",
    });
  });

  it("produces mock bytes that are inspected independently of the requested label", async () => {
    const [result] = await new MockImageGenerationProvider().generate({
      prompt: "A sufficiently long mock commercial prompt",
      model: "mock-v1",
      requestedWidth: 1600,
      requestedHeight: 1200,
      aspectRatio: "4:3",
      resolution: "marketing-4K-label",
      candidates: 1,
    });
    const inspected = await new SharpInspectionProvider().inspect(
      result.buffer,
    );
    expect(inspected.megapixels).toBeCloseTo(1.92);
  });

  it("uses SnapGen's documented multipart API, polls history, and downloads the result", async () => {
    vi.stubEnv("SNAPGEN_API_BASE_URL", "https://api.snapgen.ai");
    vi.stubEnv("SNAPGEN_API_KEY", "snapgen-secret");
    vi.stubEnv("SNAPGEN_POLL_INTERVAL_MS", "0");
    const image = await sharp({
      create: { width: 40, height: 30, channels: 3, background: "#315c49" },
    })
      .jpeg()
      .toBuffer();
    const calls: Array<{
      url: string;
      method: string;
      apiKey: string | null;
      authorization: string | null;
      contentType: string | null;
      fields?: Record<string, string>;
    }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        const headers = new Headers(init?.headers);
        const fields =
          init?.body instanceof FormData
            ? Object.fromEntries(
                [...init.body.entries()]
                  .filter((entry): entry is [string, string] =>
                    typeof entry[1] === "string",
                  ),
              )
            : undefined;
        calls.push({
          url,
          method: init?.method ?? "GET",
          apiKey: headers.get("x-api-key"),
          authorization: headers.get("authorization"),
          contentType: headers.get("content-type"),
          fields,
        });
        if (url.endsWith("/uapi/v1/generate_image"))
          return Response.json({ uuid: "snap-job-1", status: 1 });
        if (url.endsWith("/uapi/v1/history/snap-job-1"))
          return Response.json({
            uuid: "snap-job-1",
            status: 2,
            generated_image: [
              { file_download_url: "https://cdn.snapgen.ai/result.jpg" },
            ],
          });
        if (url === "https://cdn.snapgen.ai/result.jpg")
          return new Response(new Uint8Array(image), {
            headers: { "content-type": "image/jpeg" },
          });
        throw new Error(`Unexpected request: ${url}`);
      }),
    );

    const [result] = await new SnapGenImageGenerationProvider().generate({
      prompt: "Commercial stock photograph of an Indonesian home workspace",
      model: "nano-banana-pro",
      requestedWidth: 2048,
      requestedHeight: 1536,
      aspectRatio: "4:3",
      resolution: "2K",
      candidates: 1,
    });

    expect(calls[0]).toEqual({
      url: "https://api.snapgen.ai/uapi/v1/generate_image",
      method: "POST",
      apiKey: "snapgen-secret",
      authorization: null,
      contentType: null,
      fields: {
        prompt: "Commercial stock photograph of an Indonesian home workspace",
        model: "nano-banana-pro",
        aspect_ratio: "4:3",
        resolution: "2K",
      },
    });
    expect(calls[1].url).toBe(
      "https://api.snapgen.ai/uapi/v1/history/snap-job-1",
    );
    expect(calls[1].apiKey).toBe("snapgen-secret");
    expect(result).toMatchObject({
      mimeType: "image/jpeg",
      providerRequestId: "snap-job-1",
      providerReportedWidth: null,
      providerReportedHeight: null,
    });
  });

  it("preserves each exact SnapGen history UUID when multiple candidates are requested", async () => {
    vi.stubEnv("SNAPGEN_API_BASE_URL", "https://api.snapgen.ai");
    vi.stubEnv("SNAPGEN_API_KEY", "snapgen-secret");
    vi.stubEnv("SNAPGEN_POLL_INTERVAL_MS", "0");
    const image = await sharp({
      create: { width: 24, height: 24, channels: 3, background: "#315c49" },
    })
      .png()
      .toBuffer();
    let submitted = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith("/uapi/v1/generate_image")) {
          submitted += 1;
          return Response.json({ uuid: `nano-history-${submitted}`, status: 1 });
        }
        const history = url.match(/\/history\/(nano-history-\d)$/)?.[1];
        if (history)
          return Response.json({
            uuid: history,
            status: 2,
            generated_image: [
              { file_download_url: `https://cdn.snapgen.ai/${history}.png` },
            ],
          });
        if (url.startsWith("https://cdn.snapgen.ai/"))
          return new Response(new Uint8Array(image), {
            headers: { "content-type": "image/png" },
          });
        throw new Error(`Unexpected request: ${url}`);
      }),
    );

    const results = await new SnapGenImageGenerationProvider().generate({
      prompt: "Commercial stock photograph with clean useful copy space",
      model: "nano-banana-pro",
      requestedWidth: 1024,
      requestedHeight: 1024,
      aspectRatio: "1:1",
      resolution: "1K",
      candidates: 2,
    });

    expect(results.map((result) => result.providerRequestId)).toEqual([
      "nano-history-1",
      "nano-history-2",
    ]);
  });

  it("reports the accepted SnapGen UUID before a later history lookup failure", async () => {
    vi.stubEnv("SNAPGEN_API_BASE_URL", "https://api.snapgen.ai");
    vi.stubEnv("SNAPGEN_API_KEY", "snapgen-secret");
    vi.stubEnv("SNAPGEN_POLL_INTERVAL_MS", "0");
    const accepted = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.endsWith("/uapi/v1/generate_image"))
          return Response.json({ uuid: "snap-history-after-524", status: 1 });
        if (url.endsWith("/uapi/v1/history/snap-history-after-524"))
          return new Response("<!DOCTYPE html><html>Cloudflare timeout</html>", {
            status: 524,
            headers: { "content-type": "text/html" },
          });
        throw new Error(`Unexpected request: ${url}`);
      }),
    );

    const failure = await new SnapGenImageGenerationProvider()
      .generate(
        {
          prompt: "Commercial stock photograph with clean copy space",
          model: "nano-banana-pro",
          requestedWidth: 1024,
          requestedHeight: 1024,
          aspectRatio: "1:1",
          resolution: "1K",
          candidates: 1,
        },
        { onProviderRequestAccepted: accepted },
      )
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toContain("status 524");
    expect((failure as Error).message).not.toContain("DOCTYPE");
    expect(accepted).toHaveBeenCalledWith("snap-history-after-524", 0);
  });

  it("checks one SnapGen history record without creating a new generation", async () => {
    vi.stubEnv("SNAPGEN_API_BASE_URL", "https://api.snapgen.ai");
    vi.stubEnv("SNAPGEN_API_KEY", "snapgen-secret");
    const image = await sharp({
      create: { width: 36, height: 24, channels: 3, background: "#315c49" },
    })
      .jpeg()
      .toBuffer();
    const methods: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        methods.push(init?.method ?? "GET");
        if (url.endsWith("/uapi/v1/history/snap-completed"))
          return Response.json({
            uuid: "snap-completed",
            status: 2,
            generated_image: [
              { file_download_url: "https://cdn.snapgen.ai/recovered.jpg" },
            ],
          });
        if (url === "https://cdn.snapgen.ai/recovered.jpg")
          return new Response(new Uint8Array(image), {
            headers: { "content-type": "image/jpeg" },
          });
        throw new Error(`Unexpected request: ${url}`);
      }),
    );

    const result = await new SnapGenImageGenerationProvider().checkHistory(
      "snap-completed",
    );

    expect(result.status).toBe("completed");
    expect(result.image?.providerRequestId).toBe("snap-completed");
    expect(methods).toEqual(["GET", "GET"]);
  });

  it("finds a missing SnapGen UUID from recent history using exact job evidence", async () => {
    vi.stubEnv("SNAPGEN_API_BASE_URL", "https://api.snapgen.ai");
    vi.stubEnv("SNAPGEN_API_KEY", "snapgen-secret");
    const methods: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = new URL(String(input));
        methods.push(init?.method ?? "GET");
        expect(url.pathname).toBe("/uapi/v1/histories");
        expect(url.searchParams.get("filter_by")).toBe("image");
        return Response.json({
          success: true,
          total: 3,
          result: [
            {
              uuid: "matching-history-uuid",
              model_name: "nano-banana-pro",
              input_text: "Exact commercial prompt",
              type: "image",
              status: 2,
              created_at: "2026-09-07T14:33:14",
            },
            {
              uuid: "wrong-prompt",
              model_name: "nano-banana-pro",
              input_text: "Another prompt",
              type: "image",
              status: 2,
              created_at: "2026-09-07T14:33:12",
            },
            {
              uuid: "too-old",
              model_name: "nano-banana-pro",
              input_text: "Exact commercial prompt",
              type: "image",
              status: 2,
              created_at: "2026-09-07T12:00:00",
            },
          ],
        });
      }),
    );

    const matches = await new SnapGenImageGenerationProvider().findHistoryMatches({
      prompt: "Exact commercial prompt",
      model: "nano-banana-pro",
      createdAt: new Date("2026-09-07T14:33:10.901Z"),
    });

    expect(matches).toEqual([
      {
        providerRequestId: "matching-history-uuid",
        model: "nano-banana-pro",
        status: 2,
        createdAt: "2026-09-07T14:33:14",
      },
    ]);
    expect(methods).toEqual(["GET"]);
  });

  it("maps GPT Image 2 variants to SnapGen's dedicated endpoint and mode field", () => {
    vi.stubEnv("SNAPGEN_API_BASE_URL", "https://api.snapgen.ai");
    vi.stubEnv("SNAPGEN_API_KEY", "snapgen-secret");
    const provider = new SnapGenImageGenerationProvider();

    expect(
      provider.normalizeRequestForProvider({
        prompt: "Commercial presentation background with useful copy space",
        model: "gpt-image-2-high",
        requestedWidth: 4096,
        requestedHeight: 4096,
        aspectRatio: "1:1",
        resolution: "4K",
        quality: "high",
        candidates: 1,
      }),
    ).toMatchObject({
      transport: "multipart-form-data",
      endpoint: "https://api.snapgen.ai/uapi/v1/imagen/gpt-image-2",
      calls: [
        {
          fields: {
            prompt: "Commercial presentation background with useful copy space",
            aspect_ratio: "1:1",
            mode: "high",
            resolution: "4K",
          },
        },
      ],
      omittedHeaders: ["x-api-key"],
      responseContract: "async-history-record",
    });
  });

  it("maps Grok Image to its dedicated endpoint and orientation contract", () => {
    vi.stubEnv("SNAPGEN_API_BASE_URL", "https://api.snapgen.ai");
    vi.stubEnv("SNAPGEN_API_KEY", "snapgen-secret");
    const provider = new SnapGenImageGenerationProvider();

    expect(
      provider.normalizeRequestForProvider({
        prompt: "Commercial landscape photograph with useful copy space",
        model: "grok-image",
        requestedWidth: 1024,
        requestedHeight: 768,
        aspectRatio: "landscape",
        resolution: "provider-default",
        quality: "QUALITY",
        candidates: 1,
      }),
    ).toMatchObject({
      transport: "multipart-form-data",
      endpoint: "https://api.snapgen.ai/uapi/v1/imagen/grok",
      calls: [
        {
          fields: {
            prompt: "Commercial landscape photograph with useful copy space",
            orientation: "landscape",
            num_result: "1",
            mode: "QUALITY",
          },
        },
      ],
      omittedHeaders: ["x-api-key"],
      responseContract: "async-history-record",
    });
  });

  it("sends one authenticated Cloudflare Worker request per candidate", async () => {
    vi.stubEnv(
      "CLOUDFLARE_WORKER_AI_URL",
      "https://stock-images.example.workers.dev/",
    );
    vi.stubEnv("CLOUDFLARE_WORKER_AI_API_KEY", "worker-secret");
    const image = await sharp({
      create: { width: 32, height: 24, channels: 3, background: "#315c49" },
    })
      .jpeg()
      .toBuffer();
    const requests: Array<{ url: string; authorization: string | null; body: Record<string, unknown> }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        requests.push({
          url: String(input),
          authorization: headers.get("authorization"),
          body: JSON.parse(String(init?.body)) as Record<string, unknown>,
        });
        return new Response(new Uint8Array(image), {
          headers: { "content-type": "image/jpeg", "cf-ray": "ray-123" },
        });
      }),
    );

    const provider = new CloudflareWorkersAiImageGenerationProvider();
    const results = await provider.generate({
      prompt: "Commercial photograph of a calm Indonesian home workspace",
      negativePrompt: "logos, watermarks",
      model: "@cf/black-forest-labs/flux-1-schnell",
      requestedWidth: 1024,
      requestedHeight: 768,
      aspectRatio: "4:3",
      resolution: "worker-1024",
      quality: "steps-8",
      candidates: 2,
      seed: 41,
    });

    expect(requests).toHaveLength(2);
    expect(requests[0]).toMatchObject({
      url: "https://stock-images.example.workers.dev/",
      authorization: "Bearer worker-secret",
    });
    expect(requests[0].body).toEqual({
      prompt: "Commercial photograph of a calm Indonesian home workspace",
      model: "@cf/black-forest-labs/flux-1-schnell",
      width: 1024,
      height: 768,
    });
    expect(requests[1].body).toEqual(requests[0].body);
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      mimeType: "image/jpeg",
      providerReportedWidth: null,
      providerReportedHeight: null,
    });
    expect(results[0].providerRequestId).toContain("ray-123");
  });

  it("exposes the exact normalized Worker JSON bodies for observability", () => {
    vi.stubEnv(
      "CLOUDFLARE_WORKER_AI_URL",
      "https://stock-images.example.workers.dev/",
    );
    vi.stubEnv("CLOUDFLARE_WORKER_AI_API_KEY", "worker-secret");
    const provider = new CloudflareWorkersAiImageGenerationProvider();

    expect(
      provider.normalizeRequestForProvider({
        prompt: "Commercial photograph of a calm Indonesian home workspace",
        negativePrompt: "logos, watermarks",
        model: "@cf/black-forest-labs/flux-1-schnell",
        requestedWidth: 1024,
        requestedHeight: 768,
        aspectRatio: "4:3",
        resolution: "worker-1024",
        quality: "steps-8",
        candidates: 2,
        seed: 41,
      }),
    ).toEqual({
      transport: "http-json",
      method: "POST",
      endpoint: "https://stock-images.example.workers.dev/",
      calls: [
        {
          body: {
            prompt: "Commercial photograph of a calm Indonesian home workspace",
            model: "@cf/black-forest-labs/flux-1-schnell",
            width: 1024,
            height: 768,
          },
        },
        {
          body: {
            prompt: "Commercial photograph of a calm Indonesian home workspace",
            model: "@cf/black-forest-labs/flux-1-schnell",
            width: 1024,
            height: 768,
          },
        },
      ],
      omittedHeaders: ["authorization"],
      responseContract: "raw-image-bytes",
    });
  });
});
