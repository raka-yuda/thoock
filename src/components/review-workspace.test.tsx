// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import {
  act,
  fireEvent,
  render as renderTestingLibrary,
  screen,
  waitFor,
  type RenderOptions,
} from "@testing-library/react";
import { StrictMode, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Toaster } from "./ui/toaster";
import { ReviewWorkspace } from "./review-workspace";

function render(ui: ReactElement, options?: RenderOptions) {
  return renderTestingLibrary(
    <>
      {ui}
      <Toaster />
    </>,
    options,
  );
}

const asset = {
  id: "6d47fd1a-a646-43a0-9743-f86a7a8152ac",
  generationJobId: "8f6a247c-cd02-4ba9-a92a-8ee55adfac4a",
  sourceUrl: "/api/assets/generated/result.jpg",
  originalFilename: "candidate-1.jpg",
  mimeType: "image/jpeg",
  width: 1600,
  height: 1200,
  megapixels: "1.92",
  fileSize: 450000,
  checksum: "checksum",
  perceptualHash: "perceptual-hash",
  hasMetadata: false,
  upscaleStatus: "upscale_required",
  briefId: "9db4a89e-c0ec-42aa-a04d-5adbc16313f8",
  briefName: "Generated stock concept",
  prompt: "Commercial stock image prompt",
  negativePrompt: "logos, malformed anatomy",
  provider: "mock",
  model: "mock-economical-v1",
  strategy: "economical",
  resolution: "economical",
  quality: "standard",
  aspectRatio: "4:3",
  seed: 42,
  modelCapabilitySnapshot: { id: "mock-economical" },
  candidateCount: 1,
  estimatedGenerationCostUsd: "0",
  generationCostUsd: "0",
  review: { decision: "pending", notes: "", reviewedAt: null },
  metadata: null,
};

describe("ReviewWorkspace deep links", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/review");
    vi.stubGlobal("scrollTo", vi.fn());
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ data: [asset] }))),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("opens locally and adds imageId without navigating to another page", async () => {
    render(<ReviewWorkspace />);

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Review Generated stock concept",
      }),
    );

    expect(await screen.findByRole("dialog")).toHaveTextContent(
      "Generated stock concept",
    );
    expect(window.location.pathname).toBe("/review");
    expect(window.location.search).toBe(`?imageId=${asset.id}`);
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe("/api/assets?limit=15");
  });

  it("loads the initial review page under React Strict Mode", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (input: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((resolve, reject) => {
            const abort = () =>
              reject(new DOMException("The request was aborted", "AbortError"));
            if (init?.signal?.aborted) {
              abort();
              return;
            }
            init?.signal?.addEventListener("abort", abort, { once: true });
            window.setTimeout(
              () =>
                resolve(
                  Response.json({
                    data: [asset],
                    pagination: {
                      limit: 15,
                      hasMore: false,
                      nextCursor: null,
                    },
                  }),
                ),
              0,
            );
          }),
      ),
    );

    render(
      <StrictMode>
        <ReviewWorkspace />
      </StrictMode>,
    );

    expect(
      await screen.findByRole("button", {
        name: "Review Generated stock concept",
      }),
    ).toBeVisible();
    expect(screen.queryByText("All matching images loaded")).toBeVisible();
  });

  it("keeps the review status readable and technical signals compact", async () => {
    render(<ReviewWorkspace />);

    expect(await screen.findByText("Generated stock concept")).toBeVisible();
    expect(screen.getByText("pending", { exact: false })).toBeVisible();
    expect(
      screen.queryByLabelText("Review status: pending"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByLabelText("1.92MP: upscale required before export"),
    ).toHaveClass("badge-icon");
    expect(screen.getByLabelText("File format: JPEG")).toHaveClass(
      "badge-icon",
    );
  });

  it("checks every required human-review item with one explicit action", async () => {
    render(<ReviewWorkspace />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Review Generated stock concept",
      }),
    );

    const approve = await screen.findByRole("button", { name: "Approve" });
    expect(approve).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Check all required human review items",
      }),
    );

    expect(screen.getByText("9/9")).toBeVisible();
    expect(approve).toBeEnabled();
    expect(
      screen.getByRole("button", {
        name: "Check all required human review items",
      }),
    ).toBeDisabled();
  });

  it("bulk approves explicitly selected image cards after confirmation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (
          url === `/api/assets/${asset.id}/review` &&
          init?.method === "POST"
        ) {
          return Response.json({
            data: { reviewedAt: "2026-09-28T12:00:00.000Z" },
          });
        }
        if (
          url === `/api/assets/${asset.id}/metadata` &&
          init?.method === "POST"
        ) {
          return Response.json({
            data: {
              filename: "generated-stock-concept.jpg",
              title: "Generated stock concept",
              category: "3",
              language: "en",
              keywords: ["business", "concept", "stock", "image", "modern"],
              generativeAi: true,
              fictionalPeopleProperty: false,
              internalNotes: "",
              validationErrors: [],
            },
          });
        }
        return Response.json({ data: [asset] });
      }),
    );

    render(<ReviewWorkspace />);
    fireEvent.click(
      await screen.findByRole("checkbox", {
        name: "Select Generated stock concept",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Approve selected" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm bulk approval" }),
    );

    await waitFor(() =>
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        `/api/assets/${asset.id}/review`,
        expect.objectContaining({ method: "POST" }),
      ),
    );
    expect(
      await screen.findByText("1 image approved and prepared with metadata."),
    ).toBeVisible();
  });

  it("shows bulk actions only after selection and generates AI metadata for the selection", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (
          url === `/api/assets/${asset.id}/metadata` &&
          init?.method === "POST"
        ) {
          return Response.json({
            data: {
              filename: "generated-stock-concept.jpg",
              title: "Generated stock concept",
              category: "3",
              language: "en",
              keywords: ["business", "concept", "stock", "image", "modern"],
              generativeAi: true,
              fictionalPeopleProperty: false,
              internalNotes: "Generated with OpenAI and still editable.",
              validationErrors: [],
            },
          });
        }
        return Response.json({ data: [asset] });
      }),
    );

    render(<ReviewWorkspace defaultMetadataProvider="openai-metadata" />);

    expect(screen.queryByText("Review next")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Bulk review actions" }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      await screen.findByRole("checkbox", {
        name: "Select Generated stock concept",
      }),
    );
    const bulkActionRegion = screen.getByRole("region", {
      name: "Bulk review actions",
    });
    expect(bulkActionRegion).toBeVisible();
    expect(bulkActionRegion).toHaveAttribute("data-state", "open");
    expect(bulkActionRegion.parentElement?.parentElement).toBe(document.body);
    fireEvent.click(
      screen.getByRole("button", { name: "Generate AI metadata" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm AI metadata" }),
    );

    await waitFor(() =>
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        `/api/assets/${asset.id}/metadata`,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ provider: "openai-metadata" }),
        }),
      ),
    );
    expect(
      await screen.findByText(/OpenAI created editable metadata drafts/),
    ).toBeVisible();

    fireEvent.click(
      screen.getByRole("button", { name: "Clear selected images" }),
    );
    await waitFor(() =>
      expect(bulkActionRegion).toHaveAttribute("data-state", "closed"),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("region", { name: "Bulk review actions" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("creates a linked generation attempt when regeneration is confirmed", async () => {
    render(<ReviewWorkspace />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Review Generated stock concept",
      }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Regenerate" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Confirm regeneration" }),
    );

    await waitFor(() =>
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        "/api/generation",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    const generationCall = vi
      .mocked(fetch)
      .mock.calls.find(([input]) => String(input) === "/api/generation");
    const request = JSON.parse(String(generationCall?.[1]?.body));
    expect(request).toMatchObject({
      briefId: asset.briefId,
      capabilityId: "mock-economical",
      regenerateOfAssetId: asset.id,
      prompt: asset.prompt,
      resolution: asset.resolution,
    });
    expect(await screen.findByText(/Regeneration completed/)).toBeVisible();
  });

  it("stacks regeneration confirmation and its backdrop above the review modal", async () => {
    render(<ReviewWorkspace />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Review Generated stock concept",
      }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Regenerate" }));

    expect(await screen.findByRole("alertdialog")).toHaveClass("z-[110]");
    expect(
      document.querySelector('[data-slot="alert-dialog-overlay"]'),
    ).toHaveClass("z-[100]");
  });

  it("does not apply a regenerate label when generation fails before creating a job", async () => {
    const requests: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        requests.push(url);
        if (url === "/api/generation")
          return new Response(
            JSON.stringify({ error: "The original model is disabled." }),
            { status: 409 },
          );
        return new Response(JSON.stringify({ data: [asset] }));
      }),
    );

    render(<ReviewWorkspace />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Review Generated stock concept",
      }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Regenerate" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Confirm regeneration" }),
    );

    expect(
      await screen.findByText("The original model is disabled."),
    ).toBeVisible();
    expect(
      requests.some((url) => url === `/api/assets/${asset.id}/review`),
    ).toBe(false);
  });

  it("downloads one approved image through the prepared JPEG endpoint", async () => {
    const readyAsset = {
      ...asset,
      width: 2100,
      height: 2000,
      megapixels: "4.20",
      review: {
        decision: "approved" as const,
        notes: "Reviewed",
        reviewedAt: "2026-08-30T00:00:00.000Z",
      },
      metadata: {
        filename: "approved-image.jpg",
        title: "Approved commercial stock image",
        category: "3",
        language: "en",
        keywords: ["business", "professional", "office", "work", "modern"],
        generativeAi: true,
        fictionalPeopleProperty: true,
        internalNotes: "",
        validationErrors: [],
      },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).endsWith("/download")
          ? new Response(new Uint8Array([1, 2, 3]), {
              headers: {
                "content-type": "image/jpeg",
                "content-disposition":
                  'attachment; filename="approved-image.jpg"',
              },
            })
          : new Response(JSON.stringify({ data: [readyAsset] })),
      ),
    );
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:prepared-image"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

    render(<ReviewWorkspace />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Review Generated stock concept",
      }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Download JPEG" }),
    );

    await waitFor(() =>
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        `/api/assets/${asset.id}/download`,
        { method: "POST" },
      ),
    );
    expect(click).toHaveBeenCalledOnce();
  });

  it("retries failed free Nano cleanup and refreshes the modal with the derived image", async () => {
    const failedNanoAsset = {
      ...asset,
      provider: "snapgen",
      model: "nano-banana-pro",
      logoRemoval: {
        status: "failed" as const,
        method: "fast",
        derivedAssetId: null,
        error: "Temporary cleanup failure",
      },
    };
    const cleanedNanoAsset = {
      ...failedNanoAsset,
      sourceUrl: "/api/assets/derived/clean.png",
      logoRemoval: {
        status: "completed" as const,
        method: "fast",
        derivedAssetId: "2b219271-d03b-49bd-9533-f8f59865a15a",
        error: null,
      },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/remove-logo") && init?.method === "POST")
          return new Response(
            JSON.stringify({ data: { status: "completed", method: "fast" } }),
          );
        if (url.startsWith(`/api/assets?id=${asset.id}`))
          return new Response(JSON.stringify({ data: [cleanedNanoAsset] }));
        return new Response(JSON.stringify({ data: [failedNanoAsset] }));
      }),
    );

    render(<ReviewWorkspace />);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Review Generated stock concept",
      }),
    );
    expect(await screen.findByText("Temporary cleanup failure")).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "Retry free Fast removal" }),
    );

    expect(
      await screen.findByText(/Fast logo removal completed/),
    ).toBeVisible();
    expect(screen.getByText("Logo removed · Fast")).toBeVisible();
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      `/api/assets/${asset.id}/remove-logo`,
      { method: "POST" },
    );
  });

  it("opens the modal shell immediately while a linked asset is loading", () => {
    window.history.replaceState(null, "", `/review?imageId=${asset.id}`);
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );

    render(<ReviewWorkspace initialAssetId={asset.id} />);

    expect(screen.getByRole("dialog")).toHaveTextContent(
      "Loading image review",
    );
  });

  it("restores the imageId modal from the address and removes it when closed", async () => {
    window.history.replaceState(null, "", `/review?imageId=${asset.id}`);
    render(<ReviewWorkspace initialAssetId={asset.id} />);

    await waitFor(() =>
      expect(screen.getByRole("dialog")).toHaveTextContent(
        "Generated stock concept",
      ),
    );
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      `/api/assets?id=${asset.id}&limit=1`,
      expect.objectContaining({ cache: "no-store" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "Close review" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.querySelector('[data-slot="dialog-overlay"]')).toBeNull();
    expect(window.location.pathname).toBe("/review");
    expect(window.location.search).toBe("");
  });

  it("follows browser history query changes without a page navigation", async () => {
    render(<ReviewWorkspace />);
    await screen.findByRole("button", {
      name: "Review Generated stock concept",
    });

    act(() => {
      window.history.pushState(null, "", `/review?imageId=${asset.id}`);
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(await screen.findByRole("dialog")).toHaveTextContent(
      "Generated stock concept",
    );

    act(() => {
      window.history.pushState(null, "", "/review");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
  });

  it("loads the next page after scroll intent near the end of the feed", async () => {
    const nextAsset = {
      ...asset,
      id: "17f1a30b-f5c0-49e1-875a-99257404fb90",
      briefName: "Second generated concept",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        return new Response(
          JSON.stringify(
            url.includes("cursor=next-page")
              ? {
                  data: [nextAsset],
                  pagination: {
                    limit: 15,
                    hasMore: false,
                    nextCursor: null,
                  },
                }
              : {
                  data: [asset],
                  pagination: {
                    limit: 15,
                    hasMore: true,
                    nextCursor: "next-page",
                  },
                },
          ),
        );
      }),
    );

    render(<ReviewWorkspace />);
    await screen.findByRole("button", {
      name: "Review Generated stock concept",
    });

    expect(
      screen.queryByRole("button", {
        name: "Review Second generated concept",
      }),
    ).not.toBeInTheDocument();
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);

    fireEvent.wheel(window);

    expect(
      await screen.findByRole("button", {
        name: "Review Second generated concept",
      }),
    ).toBeVisible();
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "/api/assets?limit=15&cursor=next-page",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("does not fetch a large preview merely because the pointer crosses a card", async () => {
    const imageConstructor = vi.fn(() => ({ decoding: "", src: "" }));
    vi.stubGlobal("Image", imageConstructor);
    render(<ReviewWorkspace />);

    const reviewButton = await screen.findByRole("button", {
      name: "Review Generated stock concept",
    });
    const card = reviewButton.closest("article");
    expect(card).not.toBeNull();

    vi.useFakeTimers();
    fireEvent.mouseEnter(card!);
    expect(imageConstructor).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(300));
    expect(imageConstructor).not.toHaveBeenCalled();
    fireEvent.mouseLeave(card!);
    expect(imageConstructor).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("keeps the full loaded count while mounting only nearby image rows", async () => {
    vi.stubGlobal("innerWidth", 1600);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        if (this.hasAttribute("data-review-grid"))
          return new DOMRect(0, 0, 1500, 0);
        return new DOMRect();
      },
    );
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(
      function (this: HTMLElement) {
        return this.hasAttribute("data-review-row") ? 345 : 0;
      },
    );
    const manyAssets = Array.from({ length: 80 }, (_, index) => ({
      ...asset,
      id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      briefName: `Generated concept ${index + 1}`,
    }));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          data: manyAssets,
          pagination: { limit: 15, hasMore: false, nextCursor: null },
        }),
      ),
    );

    const { container } = render(<ReviewWorkspace />);
    await waitFor(() =>
      expect(container.querySelector("[data-review-grid]")).toHaveAttribute(
        "data-rendered-count",
        "80",
      ),
    );

    const cards = container.querySelectorAll("[data-review-card]");
    expect(cards.length).toBeGreaterThan(0);
    expect(cards.length).toBeLessThan(80);
    expect(cards[0]?.querySelector("img")).toHaveAttribute("loading", "eager");
    expect(
      Array.from(cards).some((card) =>
        card.querySelector('[class*="backdrop-blur"]'),
      ),
    ).toBe(false);

    const grid = container.querySelector("[data-review-grid]");
    expect(
      Number(grid?.getAttribute("data-mounted-count")),
    ).toBeLessThanOrEqual(30);
    const sizeContainer = grid?.firstElementChild as HTMLElement | null;
    expect(
      Number.parseFloat(sizeContainer?.style.height ?? "0"),
    ).toBeGreaterThan(0);

    const virtualRows = Array.from(
      container.querySelectorAll<HTMLElement>("[data-review-row]"),
    );
    expect(virtualRows.length).toBeGreaterThan(1);
    expect(new Set(virtualRows.map((row) => row.style.top)).size).toBe(
      virtualRows.length,
    );
    expect(virtualRows.every((row) => row.style.transform === "")).toBe(true);
  });
});
