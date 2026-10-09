// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultModelCatalog } from "@/lib/domain/model-catalog";
import { GenerationWorkspace } from "./generation-workspace";

const failedJob = {
  id: "b6f1ae04-d7e7-4621-97d4-c9da5d3ced96",
  retryOfJobId: null,
  briefId: "9db4a89e-c0ec-42aa-a04d-5adbc16313f8",
  briefName: "Failed stock concept",
  prompt: "Commercial stock image prompt with sufficient detail",
  negativePrompt: "logos",
  provider: "mock",
  model: "mock-economical-v1",
  strategy: "economical",
  resolution: "economical",
  quality: "standard",
  aspectRatio: "4:3",
  seed: 42,
  modelCapabilitySnapshot: defaultModelCatalog[0],
  candidateCount: 1,
  estimatedCostUsd: "0",
  actualCostUsd: null,
  providerRequestId: null,
  status: "failed",
  progress: 0,
  errorDetails: "Provider returned 503 unavailable",
  failureKind: "retryable",
  attemptCount: 1,
  createdAt: "2026-08-29T00:00:00.000Z",
  updatedAt: "2026-08-29T00:00:01.000Z",
  completedAt: "2026-08-29T00:00:01.000Z",
  stale: false,
  assets: [],
};

const succeededJob = {
  ...failedJob,
  id: "cb573b38-37af-40a2-820c-1f3d95e58f50",
  briefName: "Generated stock concept",
  status: "succeeded",
  progress: 100,
  errorDetails: null,
  failureKind: null,
  assets: [
    {
      id: "6d47fd1a-a646-43a0-9743-f86a7a8152ac",
      sourceUrl: "/api/assets/generated/result.jpg",
      originalFilename: "candidate-1.jpg",
      width: 1600,
      height: 1200,
      megapixels: "1.92",
    },
  ],
};

const snapgenFailedJob = {
  ...failedJob,
  id: "1844d76f-a9ae-485c-a852-5ab76fa98a49",
  provider: "snapgen",
  model: "nano-banana-pro",
  providerRequestId: null,
  providerRequestIds: [],
  errorDetails:
    'SnapGenAI generation failed with status 524: <!DOCTYPE html><html class="oldie">Cloudflare timeout</html>',
};

describe("GenerationWorkspace recovery", () => {
  beforeEach(() => {
    vi.stubGlobal("crypto", { randomUUID: () => "retry-idempotency-key" });
    vi.stubGlobal(
      "ResizeObserver",
      class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  });

  it("prefers an enabled live model when mock mode is disabled", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ data: [] }))),
    );
    const liveCapability = {
      ...defaultModelCatalog[0],
      id: "snapgen-live-default",
      providerId: "snapgen",
      providerModelId: "live-default",
      displayName: "Live default model",
    };

    render(
      <GenerationWorkspace
        catalog={[...defaultModelCatalog, liveCapability]}
        mockMode={false}
        localUpscaleConfigured={false}
        briefDraft={{
          briefId: failedJob.briefId,
          briefName: failedJob.briefName,
          prompt: failedJob.prompt,
        }}
      />,
    );

    expect(screen.getAllByText("Live default model").length).toBeGreaterThan(0);
    expect(screen.queryByText("Mock economical placeholder")).not.toBeInTheDocument();
  });

  it("requires a user trigger and links a retry to the failed attempt", async () => {
    let retryBody: Record<string, unknown> | null = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST") {
          retryBody = JSON.parse(String(init.body)) as Record<string, unknown>;
          return new Response(JSON.stringify({ data: { status: "succeeded" } }), {
            status: 201,
          });
        }
        expect(String(input)).toContain("/api/generation?");
        expect(String(input)).toContain(`briefId=${failedJob.briefId}`);
        return new Response(JSON.stringify({ data: [failedJob] }));
      }),
    );

    render(
      <GenerationWorkspace
        catalog={defaultModelCatalog}
        localUpscaleConfigured={false}
        briefDraft={{
          briefId: failedJob.briefId,
          briefName: failedJob.briefName,
          prompt: failedJob.prompt,
          negativePrompt: failedJob.negativePrompt,
          candidateCount: 1,
        }}
      />,
    );

    expect(await screen.findByText("Failed stock concept")).toBeVisible();
    fireEvent.pointerDown(
      screen.getByRole("button", {
        name: "Actions for Failed stock concept, attempt 1",
      }),
      { button: 0, ctrlKey: false },
    );
    fireEvent.click(
      await screen.findByRole("menuitem", { name: /retry generation/i }),
    );
    expect(screen.getByRole("alertdialog")).toHaveTextContent(
      "This creates a new linked attempt",
    );
    fireEvent.click(screen.getByRole("button", { name: /confirm retry/i }));
    await waitFor(() =>
      expect(retryBody).toMatchObject({
        retryOfJobId: failedJob.id,
        briefId: failedJob.briefId,
        capabilityId: "mock-economical",
        idempotencyKey: "retry-idempotency-key",
      }),
    );
  });

  it("links a persisted generation result to its deep-linked review modal", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ data: [succeededJob] }))),
    );

    render(
      <GenerationWorkspace
        catalog={defaultModelCatalog}
        localUpscaleConfigured={false}
        briefDraft={{
          briefId: succeededJob.briefId,
          briefName: succeededJob.briefName,
          prompt: succeededJob.prompt,
          negativePrompt: succeededJob.negativePrompt,
          candidateCount: 1,
        }}
      />,
    );

    expect(
      await screen.findByRole("link", {
        name: "Review result 1 from Generated stock concept",
      }),
    ).toHaveAttribute(
      "href",
      "/review?imageId=6d47fd1a-a646-43a0-9743-f86a7a8152ac",
    );
  });

  it("manually checks a SnapGen history UUID without starting another generation", async () => {
    let recoveryRequest: { url: string; body: Record<string, unknown> } | null =
      null;
    let historyLoads = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith(`/api/generation/jobs/${snapgenFailedJob.id}/recover`)) {
          recoveryRequest = {
            url,
            body: JSON.parse(String(init?.body)) as Record<string, unknown>,
          };
          return Response.json({
            data: { status: "succeeded", importedAssetIds: ["asset-recovered"] },
          });
        }
        historyLoads += 1;
        return Response.json({ data: historyLoads === 1 ? [snapgenFailedJob] : [] });
      }),
    );

    render(
      <GenerationWorkspace
        catalog={defaultModelCatalog}
        localUpscaleConfigured={false}
        briefDraft={{
          briefId: snapgenFailedJob.briefId,
          briefName: snapgenFailedJob.briefName,
          prompt: snapgenFailedJob.prompt,
          negativePrompt: snapgenFailedJob.negativePrompt,
          candidateCount: 1,
        }}
      />,
    );

    expect(await screen.findByText("Failed stock concept")).toBeVisible();
    expect(screen.queryByText(/DOCTYPE/i)).not.toBeInTheDocument();
    expect(screen.getByText(/provider gateway returned an HTML error page/i)).toBeVisible();
    fireEvent.pointerDown(
      screen.getByRole("button", {
        name: "Actions for Failed stock concept, attempt 1",
      }),
      { button: 0, ctrlKey: false },
    );
    fireEvent.click(
      await screen.findByRole("menuitem", { name: /check provider result/i }),
    );
    fireEvent.change(screen.getByLabelText(/snapgen history uuid/i), {
      target: { value: "snap-history-from-dashboard" },
    });
    fireEvent.click(screen.getByRole("button", { name: /check result now/i }));

    await waitFor(() =>
      expect(recoveryRequest).toEqual({
        url: `/api/generation/jobs/${snapgenFailedJob.id}/recover`,
        body: { providerRequestId: "snap-history-from-dashboard" },
      }),
    );
  });

  it("automatically searches SnapGen history when the UUID was never returned", async () => {
    let recoveryBody: Record<string, unknown> | null = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith(`/api/generation/jobs/${snapgenFailedJob.id}/recover`)) {
          recoveryBody = JSON.parse(String(init?.body)) as Record<
            string,
            unknown
          >;
          return Response.json({
            data: {
              status: "failed",
              message: "No matching SnapGenAI history record was found.",
            },
          });
        }
        return Response.json({ data: [snapgenFailedJob] });
      }),
    );

    render(
      <GenerationWorkspace
        catalog={defaultModelCatalog}
        localUpscaleConfigured={false}
        briefDraft={{
          briefId: snapgenFailedJob.briefId,
          briefName: snapgenFailedJob.briefName,
          prompt: snapgenFailedJob.prompt,
          negativePrompt: snapgenFailedJob.negativePrompt,
          candidateCount: 1,
        }}
      />,
    );

    expect(await screen.findByText("Failed stock concept")).toBeVisible();
    fireEvent.pointerDown(
      screen.getByRole("button", {
        name: "Actions for Failed stock concept, attempt 1",
      }),
      { button: 0, ctrlKey: false },
    );
    fireEvent.click(
      await screen.findByRole("menuitem", { name: /check provider result/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: /find result now/i }));

    await waitFor(() => expect(recoveryBody).toEqual({}));
  });
});
