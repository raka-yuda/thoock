// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProviderLogsWorkspace } from "./provider-logs-workspace";

vi.mock("@/components/date-filter-picker", () => ({
  DateFilterPicker: ({
    ariaLabel,
    value,
    onChange,
  }: {
    ariaLabel: string;
    value: string;
    onChange: (value: string) => void;
  }) => (
    <input
      type="date"
      aria-label={ariaLabel}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

const providerLog = {
  id: "log-1",
  generationJobId: "job-1",
  sourcePath: "/api/generation",
  idempotencyKey: "request-once-1",
  provider: "cloudflare-workers-ai",
  model: "@cf/black-forest-labs/flux-1-schnell",
  operation: "image_generation",
  status: "succeeded",
  requestBody: {
    prompt: "Commercial image of an Indonesian small business owner",
    apiKey: "[REDACTED]",
    candidates: 1,
  },
  providerRequestBody: {
    transport: "http-json",
    method: "POST",
    calls: [
      {
        body: {
          prompt: "Commercial image of an Indonesian small business owner",
          model: "@cf/black-forest-labs/flux-1-schnell",
          width: 1600,
          height: 1200,
        },
      },
    ],
    omittedHeaders: ["authorization"],
  },
  responseBody: {
    imageCount: 1,
    binaryData: "[NOT STORED]",
  },
  providerRequestIds: ["cf-request-1"],
  estimatedCostUsd: "0.015000",
  actualCostUsd: null,
  durationMs: 842,
  errorDetails: null,
  completedAt: "2026-08-27T10:00:01.000Z",
  createdAt: "2026-08-27T10:00:00.000Z",
  updatedAt: "2026-08-27T10:00:01.000Z",
};

describe("ProviderLogsWorkspace", () => {
  let requests: string[];
  beforeEach(() => {
    requests = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        requests.push(String(input));
        return new Response(
          JSON.stringify({ data: [providerLog], mode: "database" }),
        );
      }),
    );
  });

  it("lists provider calls and exposes redacted request details", async () => {
    render(<ProviderLogsWorkspace />);

    expect(await screen.findByText("cloudflare-workers-ai")).toBeInTheDocument();
    expect(screen.getByText("1 image(s)")).toBeInTheDocument();
    expect(screen.getByText("1600 × 1200")).toBeInTheDocument();
    const table = screen.getByRole("table");
    expect(table.closest(".workspace-panel")).toContainElement(
      screen.getByPlaceholderText("Search logs…"),
    );
    expect(requests.some((url) => url.includes("pageSize=10"))).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /view/i }));

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toHaveTextContent(
        "Commercial image of an Indonesian small business owner",
      );
      expect(screen.getByRole("dialog")).toHaveTextContent("[REDACTED]");
      expect(screen.getByRole("dialog")).toHaveTextContent("[NOT STORED]");
    });
  });

  it("requests a server-side provider-log date range", async () => {
    render(<ProviderLogsWorkspace />);
    await screen.findByText("cloudflare-workers-ai");
    fireEvent.click(screen.getByRole("button", { name: /filter options/i }));
    fireEvent.change(screen.getByLabelText("Provider logs requested from"), {
      target: { value: "2026-08-01" },
    });
    fireEvent.change(screen.getByLabelText("Provider logs requested through"), {
      target: { value: "2026-08-29" },
    });
    fireEvent.click(screen.getByRole("button", { name: /apply filters/i }));
    await waitFor(() =>
      expect(
        requests.some(
          (url) =>
            url.includes("from=2026-08-01") &&
            url.includes("to=2026-08-29"),
        ),
      ).toBe(true),
    );
  });
});
