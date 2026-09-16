// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Badge } from "./badge";

describe("Badge design system", () => {
  it("uses the shared raised status treatment", () => {
    render(<Badge variant="success">Ready</Badge>);

    const badge = screen.getByText("Ready");
    expect(badge).toHaveClass("badge-raised");
    expect(badge).not.toHaveClass("rounded-full");
  });
});
