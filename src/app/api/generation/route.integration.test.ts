import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST } from "./route";

const storageRoot = join(tmpdir(), `stocklab-generation-route-${process.pid}`);
const requestBody = {
  capabilityId: "mock-economical",
  strategy: "economical",
  prompt: "Commercial mock image for route integration verification",
  negativePrompt: "logos and malformed text",
  resolution: "economical",
  quality: "standard",
  aspectRatio: "4:3",
  candidates: 1,
  seed: 42,
  idempotencyKey: "route-integration-test-001",
};

describe("authenticated generation route", () => {
  beforeAll(() => {
    process.env.AUTH_BYPASS = "true";
    process.env.LOCAL_STORAGE_PATH = storageRoot;
  });
  afterAll(async () => {
    delete process.env.AUTH_BYPASS;
    delete process.env.LOCAL_STORAGE_PATH;
    await rm(storageRoot, { recursive: true, force: true });
  });

  it("normalizes, stores, and authoritatively inspects a generated candidate", async () => {
    const response = await POST(new NextRequest("http://localhost/api/generation", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(requestBody) }));
    const payload = await response.json();
    expect(response.status).toBe(201);
    expect(payload.data.assets[0]).toMatchObject({ providerReportedDimensions: { width: 1600, height: 1200 }, actualInspectedDimensions: { width: 1600, height: 1200 }, format: "jpeg", upscale: { required: true, status: "upscale_required" } });
    expect(payload.data.assets[0].actualMegapixels).toBeCloseTo(1.92);
  });

  it("returns the completed idempotent result without generating twice", async () => {
    const response = await POST(new NextRequest("http://localhost/api/generation", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(requestBody) }));
    expect(response.status).toBe(200);
  });
});
