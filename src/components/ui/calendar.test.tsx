// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Calendar } from "./calendar";

describe("Calendar range presentation", () => {
  it("does not repeat outside-month dates in a multi-month range", () => {
    render(
      <Calendar
        mode="range"
        numberOfMonths={2}
        defaultMonth={new Date(2026, 8, 1)}
        selected={{
          from: new Date(2026, 8, 22),
          to: new Date(2026, 8, 30),
        }}
      />,
    );

    expect(
      screen.getAllByRole("button", { name: /September 30th, 2026/i }),
    ).toHaveLength(1);
  });

  it("rounds middle range days without placing an oversized background on the cell", () => {
    render(
      <Calendar
        mode="range"
        defaultMonth={new Date(2026, 8, 1)}
        selected={{
          from: new Date(2026, 8, 22),
          to: new Date(2026, 8, 24),
        }}
      />,
    );

    const middle = screen.getByRole("button", {
      name: /September 23rd, 2026/i,
    });
    const middleCell = middle.parentElement;

    expect(middle).toHaveClass("rounded-[var(--radius-control-compact)]");
    expect(middleCell).not.toHaveClass("bg-accent");
  });

  it("keeps the today highlight inside the day button", () => {
    render(
      <Calendar
        mode="single"
        today={new Date(2026, 8, 12)}
        defaultMonth={new Date(2026, 8, 1)}
      />,
    );

    const today = screen.getByRole("button", {
      name: /Today, Saturday, September 12th, 2026/i,
    });

    expect(today).toHaveAttribute("data-today", "true");
    expect(today).toHaveClass("bg-accent");
    expect(today.parentElement).not.toHaveClass("bg-accent");
  });
});
