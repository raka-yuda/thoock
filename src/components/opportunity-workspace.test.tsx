// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OpportunityWorkspace } from "./opportunity-workspace";
import { Toaster } from "./ui/toaster";

vi.mock("./date-filter-picker", () => ({
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

const createdOpportunity = {
  id: "620bf5b7-b6d4-4811-a78a-e355406bf91b",
  keyword: "Imported research topic",
  targetRegion: "Indonesia",
  type: "evergreen",
  targetEventDate: null,
  adobeResultCount: 24000,
  trendGrowth: "68",
  commercialIntent: "82",
  seasonality: "55",
  portfolioPerformance: "50",
  opportunityScore: "31",
  scoreExplanation: "Directional research estimate.",
  status: "shortlisted",
  createdAt: "2026-08-12T03:24:00.000Z",
};

describe("OpportunityWorkspace research CSV import", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", "/opportunities");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const pathname = new URL(url, "http://localhost").pathname;
        if (pathname === "/api/opportunities/import") {
          const body = JSON.parse(String(init?.body)) as { commit: boolean };
          const preview = {
            valid: true,
            rowCount: 1,
            rows: [
              {
                row: 2,
                keyword: "Imported research topic",
                targetRegion: "Indonesia",
                type: "evergreen",
                targetEventDate: null,
                competitionEstimate: 24000,
                trendGrowth: 68,
                commercialIntent: 82,
                seasonality: 55,
                portfolioPerformance: 50,
                score: 31,
                researchNotes: "Useful commercial topic",
                buyerUseCases: ["HR teams"],
                researchSources: ["https://example.test/source"],
              },
            ],
            errors: [],
          };
          return new Response(
            JSON.stringify({
              data: body.commit
                ? { ...preview, opportunities: [createdOpportunity] }
                : preview,
            }),
            { status: body.commit ? 201 : 200 },
          );
        }
        if (pathname === "/api/opportunities")
          return new Response(
            JSON.stringify({
              data: [],
              pagination: { page: 1, pageSize: 10, total: 0, totalPages: 0 },
            }),
          );
        return new Response(JSON.stringify({ error: "Not found" }), {
          status: 404,
        });
      }),
    );
  });

  it("previews and imports pasted research CSV", async () => {
    render(
      <>
        <OpportunityWorkspace />
        <Toaster />
      </>,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: /import research csv/i }),
    );
    expect(
      screen.getByRole("link", { name: /download template/i }),
    ).toHaveAttribute("href", "/api/opportunities/import");
    fireEvent.change(screen.getByLabelText(/paste research csv/i), {
      target: {
        value:
          "keyword,target_region,type,competition_estimate,trend_growth,commercial_intent,seasonality,portfolio_performance\nImported research topic,Indonesia,evergreen,24000,68,82,55,50",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /validate csv/i }));
    expect(await screen.findByText("Ready to import")).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: /import 1 topic$/i }),
    );
    await waitFor(() =>
      expect(
        screen.queryByText("Import researched topics from CSV"),
      ).not.toBeInTheDocument(),
    );
    expect(await screen.findByText("Imported research topic")).toBeVisible();
    expect(await screen.findByText("Research CSV imported")).toBeVisible();
  });

  it("requests filtered and paginated opportunity results", async () => {
    const requests: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        requests.push(url);
        const parsed = new URL(url, "http://localhost");
        const requestedPage = Number(parsed.searchParams.get("page") ?? 1);
        return new Response(
          JSON.stringify({
            data: [
              {
                ...createdOpportunity,
                keyword: `Opportunity page ${requestedPage}`,
              },
            ],
            pagination: {
              page: requestedPage,
              pageSize: 10,
              total: 20,
              totalPages: 2,
            },
          }),
        );
      }),
    );
    render(<OpportunityWorkspace />);
    expect(await screen.findByText("Opportunity page 1")).toBeVisible();
    fireEvent.click(screen.getByRole("link", { name: "Next page" }));
    expect(await screen.findByText("Opportunity page 2")).toBeVisible();
    fireEvent.change(screen.getByLabelText("Filter opportunities"), {
      target: { value: "wellness" },
    });
    await waitFor(() =>
      expect(
        requests.some(
          (url) =>
            url.includes("q=wellness") &&
            url.includes("page=1") &&
            url.includes("sort=score_desc"),
        ),
      ).toBe(true),
    );
    fireEvent.click(screen.getByRole("button", { name: /filter options/i }));
    fireEvent.change(screen.getByLabelText("Opportunities created from"), {
      target: { value: "2026-08-01" },
    });
    fireEvent.change(screen.getByLabelText("Opportunities created through"), {
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

  it("offers manual and AI modes from the add opportunity dialog", async () => {
    render(<OpportunityWorkspace />);
    const addButtons = await screen.findAllByRole("button", {
      name: /^add opportunity$/i,
    });
    fireEvent.click(addButtons[0]);
    expect(
      screen.getByRole("button", { name: /add manually/i }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: /research with ai/i }),
    ).toBeVisible();
  });

  it("uses explicit kebab-case URL state when creating briefs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: [createdOpportunity],
            pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
          }),
        ),
      ),
    );
    render(<OpportunityWorkspace />);
    await screen.findByText(createdOpportunity.keyword);
    fireEvent.pointerDown(
      screen.getByRole("button", {
        name: `Actions for ${createdOpportunity.keyword}`,
      }),
      { button: 0, ctrlKey: false },
    );

    expect(await screen.findByRole("menuitem", { name: /create briefs/i }))
      .toHaveAttribute(
        "href",
        `/briefs?dialog=create-ai&source-opportunity=${createdOpportunity.id}`,
      );
  });

  it("uses the live research provider selected by server configuration", async () => {
    render(
      <OpportunityWorkspace defaultResearchProvider="openai-research-ai" />,
    );
    const addButtons = await screen.findAllByRole("button", {
      name: /^add opportunity$/i,
    });
    fireEvent.click(addButtons[0]);
    fireEvent.click(screen.getByRole("button", { name: /research with ai/i }));

    expect(await screen.findByRole("dialog")).toHaveTextContent(
      "OpenAI with web research",
    );
  });
});
