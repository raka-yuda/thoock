// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExportWorkspace } from "./export-workspace";
import { Toaster } from "./ui/toaster";

function makeAsset(index: number) {
  return {
    id: `asset-${index}`,
    briefName: `Brief ${index}`,
    width: 2400,
    height: 1800,
    megapixels: "4.32",
    mimeType: "image/jpeg",
    thumbnailUrl: `/api/assets/asset-${index}/thumbnail`,
    createdAt: `2026-09-${String(index).padStart(2, "0")}T00:00:00.000Z`,
    review: { decision: "approved" },
    metadata: {
      filename: `image-${index}.jpg`,
      title: `Prepared image ${index}`,
      category: "Business",
      keywords: ["business", "workspace", "professional", "planning", "work"],
      validationErrors: [],
    },
  };
}

describe("ExportWorkspace", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState({}, "", "/exports");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const pathname = new URL(String(input), "http://localhost").pathname;
        if (pathname === "/api/assets/asset-20/download") {
          return new Response(new Uint8Array([255, 216, 255, 217]), {
            status: init?.method === "POST" ? 200 : 405,
            headers: {
              "content-type": "image/jpeg",
              "content-disposition": 'attachment; filename="image-20.jpg"',
            },
          });
        }
        if (pathname === "/api/assets") {
          return new Response(
            JSON.stringify({
              data: Array.from({ length: 20 }, (_, index) =>
                makeAsset(index + 1),
              ),
              pagination: { hasMore: false, nextCursor: null },
            }),
          );
        }
        if (pathname === "/api/exports") {
          return new Response(
            JSON.stringify({ data: { assets: {}, batches: [] } }),
          );
        }
        return new Response(JSON.stringify({ error: "Not found" }), {
          status: 404,
        });
      }),
    );
  });

  it("accumulates page selections instead of replacing earlier pages", async () => {
    render(
      <>
        <ExportWorkspace />
        <Toaster />
      </>,
    );

    const firstPageSelectAll = await screen.findByRole("checkbox", {
      name: "Select all images on this page",
    });
    fireEvent.click(firstPageSelectAll);
    expect(await screen.findByText("10 images selected")).toBeVisible();

    fireEvent.click(screen.getByRole("link", { name: "Next page" }));
    await waitFor(() => expect(screen.getByText("Brief 10")).toBeVisible());

    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Select all images on this page",
      }),
    );
    expect(await screen.findByText("20 images selected")).toBeVisible();
  });

  it("downloads a prepared JPEG with the POST route contract", async () => {
    const createObjectUrl = vi.fn(() => "blob:prepared-image");
    const revokeObjectUrl = vi.fn();
    const BrowserUrl = URL;
    class DownloadUrl extends BrowserUrl {
      static createObjectURL = createObjectUrl;
      static revokeObjectURL = revokeObjectUrl;
    }
    vi.stubGlobal("URL", DownloadUrl);
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

    render(
      <>
        <ExportWorkspace />
        <Toaster />
      </>,
    );
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Download Brief 20 JPEG",
      }),
    );

    await waitFor(() =>
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        "/api/assets/asset-20/download",
        { method: "POST" },
      ),
    );
    expect(createObjectUrl).toHaveBeenCalled();
    expect(anchorClick).toHaveBeenCalled();
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:prepared-image");
    expect(await screen.findByText("JPEG downloaded")).toBeVisible();
  });
});
