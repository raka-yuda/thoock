// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DateFilterPicker } from "./date-filter-picker";
import { FilterDialog } from "./filter-dialog";

describe("DateFilterPicker", () => {
  it("uses the shadcn calendar to return a timezone-safe date-only value", async () => {
    const onChange = vi.fn();
    render(
      <DateFilterPicker
        id="created-from"
        label="Created from"
        value="2026-08-01"
        onChange={onChange}
        ariaLabel="Created from"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Created from" }));
    fireEvent.click(
      await screen.findByRole("button", { name: /August 29.*2026/i }),
    );

    expect(onChange).toHaveBeenCalledWith("2026-08-29");
  });

  it("renders its calendar above a filter dialog", async () => {
    render(
      <FilterDialog
        open
        onOpenChange={() => undefined}
        title="Filter opportunities"
        onClear={() => undefined}
        onApply={() => undefined}
      >
        <DateFilterPicker
          id="filter-from"
          label="Created from"
          value=""
          onChange={() => undefined}
          ariaLabel="Filter created from"
        />
      </FilterDialog>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Filter created from" }));
    const calendar = await screen.findByRole("grid");
    expect(calendar.closest('[data-slot="popover-content"]')).toHaveClass(
      "z-[110]",
    );
  });
});
