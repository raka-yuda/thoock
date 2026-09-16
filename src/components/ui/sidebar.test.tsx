// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  Tooltip,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SidebarTooltipContent } from "@/components/ui/sidebar";

describe("SidebarTooltipContent", () => {
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

  it("keeps every sidebar tooltip on the shared readable size", () => {
    render(
      <TooltipProvider>
        <Tooltip open>
          <TooltipTrigger>Navigation item</TooltipTrigger>
          <SidebarTooltipContent side="right">
            Commercial briefs
          </SidebarTooltipContent>
        </Tooltip>
      </TooltipProvider>,
    );

    expect(screen.getByRole("tooltip")).toHaveClass(
      "px-3.5",
      "py-2.5",
      "text-sm",
      "font-medium",
    );
  });
});
