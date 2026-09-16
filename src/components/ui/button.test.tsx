// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "./button";
import { Input } from "./input";

describe("Button design system", () => {
  it("uses the shared control radius for primary actions", () => {
    render(<Button>Continue</Button>);
    const button = screen.getByRole("button", { name: "Continue" });
    expect(button).toHaveClass("rounded-[var(--radius-control)]");
    expect(button).not.toHaveClass("rounded-full");
  });

  it("matches the default input height and radius", () => {
    render(
      <>
        <Input aria-label="Password" />
        <Button>Sign in</Button>
      </>,
    );
    const button = screen.getByRole("button", { name: "Sign in" });
    const input = screen.getByRole("textbox", { name: "Password" });
    expect(button).toHaveClass("h-[var(--control-height)]");
    expect(input).toHaveClass("h-[var(--control-height)]");
    expect(button).toHaveClass("rounded-[var(--radius-control)]");
    expect(input).toHaveClass("rounded-[var(--radius-control)]");
  });

  it("vertically centers native file controls within the shared input height", () => {
    render(<Input aria-label="Upload CSV" type="file" />);

    const input = screen.getByLabelText("Upload CSV");
    expect(input).toHaveClass("py-1");
    expect(input).toHaveClass("file:inline-flex");
    expect(input).toHaveClass("file:h-7");
    expect(input).toHaveClass("file:items-center");
  });
});
