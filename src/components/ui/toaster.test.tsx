// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { toast, Toaster, type ToastVariant } from "./toaster";

describe("Toaster", () => {
  it("renders every supported notification type", () => {
    render(<Toaster />);

    const notifications: Array<{
      title: string;
      variant: ToastVariant;
    }> = [
      { title: "Changes saved", variant: "success" },
      { title: "Check this setting", variant: "warning" },
      { title: "Request failed", variant: "error" },
      { title: "Provider checked", variant: "info" },
    ];

    act(() => {
      notifications.forEach(({ title, variant }) =>
        toast({ title, description: `${variant} details`, variant }),
      );
    });

    notifications.forEach(({ title, variant }) => {
      const notification = document.querySelector(
        `[data-variant="${variant}"]`,
      );
      expect(notification).not.toBeNull();
      expect(notification).toHaveClass("app-toast");
      expect(notification).toHaveAttribute("data-state", "open");
      expect(within(notification as HTMLElement).getByText(title)).toBeVisible();
      expect(
        within(notification as HTMLElement).getByText(`${variant} details`),
      ).toBeVisible();
    });

    const infoToast = document.querySelector('[data-variant="info"]');
    fireEvent.click(
      within(infoToast as HTMLElement).getByRole("button", {
        name: "Dismiss notification",
      }),
    );
    return waitFor(() =>
      expect(infoToast).toHaveAttribute("data-state", "closed"),
    );
  });
});
