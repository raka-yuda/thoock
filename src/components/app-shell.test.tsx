// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "./app-shell";

const { replace, refresh } = vi.hoisted(() => ({
  replace: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ replace, refresh }),
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light", setTheme: vi.fn() }),
}));

describe("AppShell account menu", () => {
  beforeEach(() => {
    replace.mockReset();
    refresh.mockReset();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ ok: true }))),
    );
  });

  it("links account utilities to the relevant settings sections", async () => {
    render(<AppShell ownerEmail="owner@stocklab.local"><div>Dashboard content</div></AppShell>);

    fireEvent.pointerDown(
      screen.getByRole("button", { name: /open owner menu/i }),
      { button: 0, ctrlKey: false },
    );

    expect(await screen.findByRole("menuitem", { name: /storage and database/i }))
      .toHaveAttribute("href", "/settings?tab=security#storage");
    expect(screen.getByRole("menuitem", { name: /budget and costs/i }))
      .toHaveAttribute("href", "/settings?tab=cost#budget");
  });

  it("uses the raised sidebar state for the current route", () => {
    render(
      <AppShell ownerEmail="owner@stocklab.local">
        <div>Dashboard content</div>
      </AppShell>,
    );

    const activeLink = screen.getByRole("link", { name: "Dashboard" });
    const inactiveLink = screen.getByRole("link", { name: "Opportunities" });
    const sidebar = screen.getByRole("complementary", {
      name: "Primary sidebar",
    });

    expect(sidebar).toHaveClass("sidebar-shell");
    expect(activeLink).toHaveAttribute("data-active", "true");
    expect(activeLink).toHaveAttribute("aria-current", "page");
    expect(activeLink).toHaveClass("sidebar-nav-item", "font-semibold");
    expect(inactiveLink).toHaveAttribute("data-active", "false");
  });

  it("uses the header sidebar trigger instead of a bottom collapse action", () => {
    render(
      <AppShell ownerEmail="owner@stocklab.local">
        <div>Dashboard content</div>
      </AppShell>,
    );

    const sidebar = screen.getByRole("complementary", {
      name: "Primary sidebar",
    });
    const trigger = screen.getByRole("button", { name: "Collapse sidebar" });

    expect(trigger).toHaveAttribute("data-slot", "sidebar-trigger");
    expect(trigger).toHaveAttribute("aria-controls", "app-sidebar");
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.queryByText("Collapse sidebar")).not.toBeInTheDocument();

    fireEvent.click(trigger);

    expect(sidebar).toHaveClass("w-[72px]");
    expect(
      screen.getByRole("button", { name: "Expand sidebar" }),
    ).toHaveAttribute("aria-expanded", "false");
  });

  it("posts logout and returns to login", async () => {
    render(<AppShell ownerEmail="owner@stocklab.local"><div>Dashboard content</div></AppShell>);

    fireEvent.pointerDown(
      screen.getByRole("button", { name: /open owner menu/i }),
      { button: 0, ctrlKey: false },
    );
    fireEvent.click(await screen.findByRole("menuitem", { name: /sign out/i }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith("/api/auth/logout", { method: "POST" });
      expect(replace).toHaveBeenCalledWith("/login");
      expect(refresh).toHaveBeenCalled();
    });
  });
});
