// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LoginShowcase } from "./login-showcase";

describe("LoginShowcase", () => {
  afterEach(() => vi.useRealTimers());

  it("keeps advancing while the pointer is over the showcase", () => {
    vi.useFakeTimers();
    render(<LoginShowcase />);

    fireEvent.mouseEnter(screen.getByRole("region", { name: "Thoock product tour" }));
    act(() => vi.advanceTimersByTime(5_700));

    expect(screen.getByRole("tab", { name: /Show slide 2:/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("presents the screen as a lowered three-dimensional laptop display", () => {
    const { container } = render(<LoginShowcase />);
    const stage = container.querySelector('[data-slot="login-showcase-stage"]');
    const screen = container.querySelector('[data-slot="login-showcase-screen"]');

    expect(stage).toHaveClass("mt-12");
    expect(stage).toHaveClass("[perspective:1200px]");
    expect(screen).toHaveClass("left-[2%]");
    expect(screen).toHaveClass("top-16");
    expect(screen).toHaveClass("w-[138%]");
    expect(screen).toHaveClass(
      "[transform:rotateX(10deg)_rotateY(-16deg)_rotateZ(8deg)]",
    );
  });
});
