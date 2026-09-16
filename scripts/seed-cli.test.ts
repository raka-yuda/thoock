import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("database seed CLI boundary", () => {
  it("loads under plain Node/tsx without the Next.js bundler", () => {
    expect(() =>
      execFileSync(process.execPath, ["--import", "tsx", "scripts/seed.ts"], {
        cwd: process.cwd(),
        env: { ...process.env, SEED_VALIDATE_ONLY: "true" },
        stdio: "pipe",
      }),
    ).not.toThrow();
  });
});
