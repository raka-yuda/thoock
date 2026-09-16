import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isSnapgenNanoModel,
  SnapGenLogoRemovalProvider,
} from "./snapgen-logo-removal";

describe("SnapGen logo removal", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("recognizes only SnapGen Nano models for automatic cleanup", () => {
    expect(isSnapgenNanoModel("nano-banana-pro")).toBe(true);
    expect(isSnapgenNanoModel("nano-banana-2-lite")).toBe(true);
    expect(isSnapgenNanoModel("gpt-image-2-low")).toBe(false);
    expect(isSnapgenNanoModel("grok-image")).toBe(false);
  });

  it("submits free fast cleanup, polls by generation UUID, and downloads the result", async () => {
    vi.stubEnv("SNAPGEN_API_BASE_URL", "https://api.snapgen.ai");
    vi.stubEnv("SNAPGEN_API_KEY", "snapgen-secret");
    vi.stubEnv("SNAPGEN_POLL_INTERVAL_MS", "0");
    const calls: Array<{
      url: string;
      method: string;
      apiKey: string | null;
      body: unknown;
    }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        calls.push({
          url,
          method: init?.method ?? "GET",
          apiKey: new Headers(init?.headers).get("x-api-key"),
          body: init?.body ? JSON.parse(String(init.body)) : null,
        });
        if (url.endsWith("/uapi/v1/remove-logo"))
          return Response.json({
            data: { id: "removal-1", history_uuid: "nano-job-1", status: 0 },
          });
        if (url.endsWith("/uapi/v1/remove-logo/nano-job-1"))
          return Response.json({
            data: [
              {
                id: "removal-1",
                history_uuid: "nano-job-1",
                mode: "fast",
                status: 2,
                result_url: "https://cdn.snapgen.ai/clean.png",
                used_credit: 0,
              },
            ],
          });
        if (url === "https://cdn.snapgen.ai/clean.png")
          return new Response(new Uint8Array([1, 2, 3]), {
            headers: { "content-type": "image/png" },
          });
        throw new Error(`Unexpected request: ${url}`);
      }),
    );

    const provider = new SnapGenLogoRemovalProvider();
    const result = await provider.remove("nano-job-1", "fast");

    expect(calls[0]).toEqual({
      url: "https://api.snapgen.ai/uapi/v1/remove-logo",
      method: "POST",
      apiKey: "snapgen-secret",
      body: { history_uuid: "nano-job-1", mode: "fast" },
    });
    expect(calls[1]).toMatchObject({
      url: "https://api.snapgen.ai/uapi/v1/remove-logo/nano-job-1",
      method: "GET",
      apiKey: "snapgen-secret",
    });
    expect(result).toMatchObject({
      historyUuid: "nano-job-1",
      removalJobId: "removal-1",
      mode: "fast",
      mimeType: "image/png",
      usedCredits: 0,
    });
    expect(result.buffer).toEqual(Buffer.from([1, 2, 3]));
  });
});
