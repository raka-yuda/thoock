import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextRequest } from "next/server";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LocalStorageProvider } from "@/modules/providers/storage";
import { GET } from "./route";

const storageRoot = join(tmpdir(), `stocklab-thumbnail-route-${process.pid}`);
const sourceKey = "generated/test-large.jpg";
const context = {
  params: Promise.resolve({ key: ["generated", "test-large.jpg"] }),
};

describe("private asset image delivery", () => {
  beforeAll(async () => {
    process.env.AUTH_BYPASS = "true";
    process.env.LOCAL_STORAGE_PATH = storageRoot;
    const source = await sharp({
      create: {
        width: 2000,
        height: 1200,
        channels: 3,
        background: { r: 30, g: 90, b: 60 },
      },
    })
      .jpeg({ quality: 92 })
      .toBuffer();
    await new LocalStorageProvider(storageRoot).put(
      sourceKey,
      source,
      "image/jpeg",
    );
  });

  afterAll(async () => {
    delete process.env.AUTH_BYPASS;
    delete process.env.LOCAL_STORAGE_PATH;
    await rm(storageRoot, { recursive: true, force: true });
  });

  it("creates and caches a bounded thumbnail instead of returning the original", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/assets/generated/test-large.jpg?width=320"),
      context,
    );
    const body = Buffer.from(await response.arrayBuffer());
    const metadata = await sharp(body).metadata();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(response.headers.get("cache-control")).toContain("immutable");
    expect(metadata.width).toBe(320);
    expect(metadata.height).toBe(192);

    const cached = await GET(
      new NextRequest("http://localhost/api/assets/generated/test-large.jpg?width=320", {
        headers: { "if-none-match": response.headers.get("etag")! },
      }),
      context,
    );
    expect(cached.status).toBe(304);
  });

  it("rejects arbitrary resize dimensions", async () => {
    const response = await GET(
      new NextRequest("http://localhost/api/assets/generated/test-large.jpg?width=777"),
      context,
    );
    expect(response.status).toBe(400);
  });
});
