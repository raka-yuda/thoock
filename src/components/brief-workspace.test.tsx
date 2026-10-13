// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BriefWorkspace } from "./brief-workspace";

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

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const brief = {
  id: "9db4a89e-c0ec-42aa-a04d-5adbc16313f8",
  opportunityId: "51a8c93c-b3c6-4f65-90fc-ad15a71f50b5",
  opportunityKeyword: "Remote work wellness",
  name: "Calm remote-work reset",
  targetBuyer: "HR teams",
  intendedUsage: "Website hero",
  targetMarket: "Indonesia",
  mainSubject: "Professional taking a mindful break",
  supportingSubjects: ["laptop", "plant"],
  environment: "Home office",
  visualStyle: "Commercial lifestyle photography",
  orientation: "horizontal",
  composition: "Subject on right third",
  copySpaceLocation: "left",
  lighting: "Soft morning light",
  mood: "Calm",
  representationNotes: "Indonesian adult",
  prohibitedElements: ["logos", "legible text"],
  candidateCount: 3,
  status: "ready",
  generationPrompt: "A commercially useful remote-work wellness photograph",
  negativePrompt: "logos, malformed anatomy",
  createdAt: "2026-08-26T00:00:00.000Z",
  updatedAt: "2026-08-26T00:00:00.000Z",
};

describe("BriefWorkspace", () => {
  beforeEach(() => {
    push.mockReset();
    window.history.replaceState(null, "", "/briefs");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const pathname = new URL(url, "http://localhost").pathname;
        if (pathname === "/api/briefs/import") {
          const body = JSON.parse(String(init?.body)) as {
            commit: boolean;
          };
          const preview = {
            valid: true,
            rowCount: 1,
            rows: [
              {
                row: 2,
                name: "Imported stock concept",
                mainSubject: "Professional organizing a useful workspace",
                targetMarket: "Indonesia",
                orientation: "horizontal",
                candidateCount: 1,
                opportunityKeyword: null,
              },
            ],
            errors: [],
          };
          return new Response(
            JSON.stringify({
              data: body.commit
                ? {
                    ...preview,
                    briefs: [
                      {
                        ...brief,
                        id: "682b9bfa-1dbb-407f-a9e5-58ae20df5e66",
                        opportunityId: null,
                        opportunityKeyword: null,
                        name: "Imported stock concept",
                        mainSubject:
                          "Professional organizing a useful workspace",
                        candidateCount: 1,
                        status: "draft",
                      },
                    ],
                  }
                : preview,
            }),
            { status: body.commit ? 201 : 200 },
          );
        }
        if (pathname === "/api/briefs")
          return new Response(
            JSON.stringify({
              data: [brief],
              pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
            }),
          );
        if (pathname === "/api/generation")
          return new Response(JSON.stringify({ jobId: "bulk-job", data: [] }));
        if (pathname === "/api/opportunities")
          return new Response(
            JSON.stringify({
              data: [],
              pagination: { page: 1, pageSize: 200, total: 0, totalPages: 0 },
            }),
          );
        return new Response(JSON.stringify({ error: "Not found" }), {
          status: 404,
        });
      }),
    );
  });

  it("opens a persisted brief from its card", async () => {
    render(<BriefWorkspace />);
    const open = await screen.findByRole("button", { name: /open/i });
    const table = screen.getByRole("table");
    expect(table.closest(".workspace-panel")).toContainElement(
      screen.getByLabelText("Filter commercial briefs"),
    );
    expect(vi.mocked(fetch).mock.calls.some(([input]) =>
      String(input).includes("pageSize=10"),
    )).toBe(true);
    fireEvent.click(open);
    await waitFor(() =>
      expect(screen.getByRole("dialog")).toHaveTextContent(
        "Calm remote-work reset",
      ),
    );
    expect(screen.getByRole("dialog")).toHaveTextContent("HR teams");
    expect(
      screen.getByRole("tab", { name: "Generation prompt" }),
    ).toBeVisible();
  });

  it("navigates to generation with a durable brief id", async () => {
    render(<BriefWorkspace />);
    fireEvent.click(await screen.findByRole("button", { name: /open/i }));
    fireEvent.click(
      await screen.findByRole("button", { name: /use in generation/i }),
    );
    expect(push).toHaveBeenCalledWith(
      "/generation?brief=9db4a89e-c0ec-42aa-a04d-5adbc16313f8",
    );
  });

  it("edits Adobe metadata at the brief stage without an AI provider", async () => {
    render(<BriefWorkspace />);
    fireEvent.click(await screen.findByRole("button", { name: /open/i }));
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Adobe metadata" }), {
      button: 0,
      ctrlKey: false,
    });
    expect(await screen.findByText("Reusable metadata plan")).toBeVisible();
    expect(screen.getByLabelText("Adobe metadata title")).toBeVisible();
    expect(screen.getByLabelText("Adobe Stock category")).toBeVisible();
    expect(
      screen.getByLabelText("Ordered Adobe metadata keywords"),
    ).toBeVisible();
  });

  it("opens the manual brief form without requiring an opportunity", async () => {
    render(<BriefWorkspace />);
    fireEvent.click(await screen.findByRole("button", { name: /add brief/i }));
    fireEvent.click(await screen.findByRole("button", { name: /add manually/i }));
    expect(screen.getByRole("dialog")).toHaveTextContent(
      "Add a commercial brief manually",
    );
    expect(screen.getByRole("dialog")).toHaveTextContent("Source opportunity");
  });

  it("uses the live brief provider selected by server configuration", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const pathname = new URL(String(input), "http://localhost").pathname;
        if (pathname === "/api/opportunities")
          return new Response(
            JSON.stringify({
              data: [
                {
                  id: brief.opportunityId,
                  keyword: brief.opportunityKeyword,
                  opportunityScore: "70",
                },
              ],
              pagination: { page: 1, pageSize: 200, total: 1, totalPages: 1 },
            }),
          );
        return new Response(
          JSON.stringify({
            data: [brief],
            pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
          }),
        );
      }),
    );
    render(
      <BriefWorkspace
        mockMode={false}
        defaultBriefProvider="gemini-brief-ai"
        defaultPromptProvider="gemini-prompt"
      />,
    );
    await screen.findByText("Calm remote-work reset");
    fireEvent.click(await screen.findByRole("button", { name: /add brief/i }));
    fireEvent.click(screen.getByRole("button", { name: /create with ai/i }));

    await waitFor(() =>
      expect(screen.getByRole("dialog")).toHaveTextContent("Gemini AI"),
    );
  });

  it("opens and preselects AI brief creation from kebab-case URL state", async () => {
    window.history.replaceState(
      null,
      "",
      `/briefs?from=2026-08-01&dialog=create-ai&source-opportunity=${brief.opportunityId}`,
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const pathname = new URL(String(input), "http://localhost").pathname;
        if (pathname === "/api/opportunities")
          return new Response(
            JSON.stringify({
              data: [
                {
                  id: brief.opportunityId,
                  keyword: brief.opportunityKeyword,
                  opportunityScore: "70",
                },
              ],
            }),
          );
        return new Response(
          JSON.stringify({
            data: [brief],
            pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
          }),
        );
      }),
    );

    render(<BriefWorkspace />);

    const dialog = await screen.findByRole("dialog", {
      name: "Create a batch of commercial briefs",
    });
    await waitFor(() =>
      expect(dialog).toHaveTextContent("Remote work wellness"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", {
          name: "Create a batch of commercial briefs",
        }),
      ).not.toBeInTheDocument(),
    );
    expect(window.location.search).toBe("?from=2026-08-01");
  });

  it("treats opportunity as a list filter instead of a modal command", async () => {
    const requests: string[] = [];
    window.history.replaceState(
      null,
      "",
      `/briefs?opportunity=${brief.opportunityId}`,
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        requests.push(url);
        const pathname = new URL(url, "http://localhost").pathname;
        if (pathname === "/api/opportunities")
          return new Response(JSON.stringify({ data: [] }));
        return new Response(
          JSON.stringify({
            data: [brief],
            pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
          }),
        );
      }),
    );

    render(<BriefWorkspace />);

    expect(await screen.findByText("Calm remote-work reset")).toBeVisible();
    expect(
      screen.queryByRole("dialog", {
        name: "Create a batch of commercial briefs",
      }),
    ).not.toBeInTheDocument();
    expect(
      requests.some((url) =>
        url.includes(`opportunity=${brief.opportunityId}`),
      ),
    ).toBe(true);
  });

  it("allows a short but non-empty manual subject to be saved", async () => {
    render(<BriefWorkspace />);
    fireEvent.click(await screen.findByRole("button", { name: /add brief/i }));
    fireEvent.click(await screen.findByRole("button", { name: /add manually/i }));
    const fields = screen.getAllByRole("textbox");
    fireEvent.change(fields[0], { target: { value: "Test" } });
    fireEvent.change(fields[4], { target: { value: "Test" } });
    expect(
      screen.getByRole("button", { name: /save manual brief/i }),
    ).toBeEnabled();
  });

  it("places the dialog overlay above the fixed application sidebar", async () => {
    render(<BriefWorkspace />);
    fireEvent.click(await screen.findByRole("button", { name: /add brief/i }));
    fireEvent.click(await screen.findByRole("button", { name: /add manually/i }));
    expect(
      document.querySelector('[data-slot="dialog-overlay"]'),
    ).toHaveClass("z-[80]");
  });

  it("generates one image for each selected brief after confirmation", async () => {
    render(<BriefWorkspace />);
    await screen.findByText("Calm remote-work reset");
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Select all briefs on this page",
      }),
    );
    expect(
      screen.getByRole("region", { name: "Bulk selection actions" }),
    ).toHaveTextContent("1 brief selected");
    expect(
      screen.getByLabelText(/select calm remote-work reset/i),
    ).toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: /generate selected \(1\)/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm 1 generation/i }));
    await waitFor(() =>
      expect(vi.mocked(fetch).mock.calls.some(([input, init]) => {
        if (String(input) !== "/api/generation") return false;
        const body = JSON.parse(String(init?.body));
        return body.briefId === brief.id && body.candidates === 1;
      })).toBe(true),
    );
  });

  it("validates and imports pasted brief CSV in one reviewed batch", async () => {
    render(<BriefWorkspace />);
    fireEvent.click(
      await screen.findByRole("button", { name: /import csv/i }),
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Import commercial briefs from CSV");
    expect(
      screen.getByRole("link", { name: /download template/i }),
    ).toHaveAttribute("href", "/api/briefs/import");

    fireEvent.change(screen.getByLabelText(/paste csv content/i), {
      target: {
        value:
          "name,main_subject,orientation\nImported stock concept,Professional organizing a useful workspace,horizontal",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: /validate csv/i }));
    expect(await screen.findByText("Ready to import")).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: /import 1 brief$/i }),
    );

    await waitFor(() =>
      expect(
        screen.queryByText("Import commercial briefs from CSV"),
      ).not.toBeInTheDocument(),
    );
    expect(await screen.findByText("Imported stock concept")).toBeVisible();
  });

  it("requests the next server-backed page", async () => {
    const requests: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        requests.push(url);
        const parsed = new URL(url, "http://localhost");
        if (parsed.pathname === "/api/opportunities")
          return new Response(JSON.stringify({ data: [] }));
        if (parsed.pathname === "/api/briefs") {
          const requestedPage = Number(parsed.searchParams.get("page") ?? 1);
          return new Response(
            JSON.stringify({
              data: [{ ...brief, name: `Brief page ${requestedPage}` }],
              pagination: {
                page: requestedPage,
                pageSize: 10,
                total: 18,
                totalPages: 2,
              },
            }),
          );
        }
        return new Response(JSON.stringify({ error: "Not found" }), {
          status: 404,
        });
      }),
    );
    render(<BriefWorkspace />);
    expect(await screen.findByText("Brief page 1")).toBeVisible();
    expect(
      screen.getByRole("button", {
        name: "Filter commercial briefs by updated date",
      }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("link", { name: "Next page" }));
    expect(await screen.findByText("Brief page 2")).toBeVisible();
    expect(requests.some((url) => url.includes("page=2"))).toBe(true);
    fireEvent.change(screen.getByLabelText("Filter commercial briefs"), {
      target: { value: "wellness" },
    });
    await waitFor(() =>
      expect(
        requests.some(
          (url) =>
            url.includes("q=wellness") &&
            url.includes("page=1") &&
            url.includes("sort=updated_desc"),
        ),
      ).toBe(true),
    );
    fireEvent.click(screen.getByRole("button", { name: /filter options/i }));
    fireEvent.change(screen.getByLabelText("Briefs updated from"), {
      target: { value: "2026-08-01" },
    });
    fireEvent.change(screen.getByLabelText("Briefs updated through"), {
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
    expect(screen.getByText("Updated from 2026-08-01")).toBeVisible();
    expect(screen.getByText("Updated through 2026-08-29")).toBeVisible();
  });
});
