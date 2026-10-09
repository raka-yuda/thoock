// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { SettingsWorkspace } from "./settings-workspace";
import { Toaster } from "./ui/toaster";

describe("SettingsWorkspace destinations", () => {
  beforeAll(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class ResizeObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  });

  it("opens the requested security and storage section", () => {
    render(<SettingsWorkspace initialTab="security" />);

    expect(
      screen.getByRole("tab", { name: /security and storage/i }),
    ).toHaveAttribute("data-state", "active");
    expect(screen.getByText("Storage and database")).toBeVisible();
  });

  it("opens the requested cost controls section", () => {
    render(<SettingsWorkspace initialTab="cost" />);

    expect(screen.getByRole("tab", { name: /cost controls/i })).toHaveAttribute(
      "data-state",
      "active",
    );
    expect(screen.getByText("Monthly spending limit")).toBeVisible();
  });

  it("shows SnapGen as active when the server detected its credentials", () => {
    render(
      <SettingsWorkspace initialTab="providers" snapgenConfigured />,
    );

    const card = screen.getByText("SnapGenAI").closest('[data-slot="card"]');
    expect(card).not.toBeNull();
    expect(within(card as HTMLElement).getByText("Active")).toBeVisible();
  });

  it("explains that the current settings editor is server-managed", async () => {
    render(
      <>
        <SettingsWorkspace initialTab="cost" />
        <Toaster />
      </>,
    );

    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    expect(await screen.findByText("Settings were not saved")).toBeVisible();
    expect(
      screen.getByText(/currently mirrors server configuration/i),
    ).toBeVisible();
  });
});
