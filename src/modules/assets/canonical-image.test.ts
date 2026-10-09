import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  prepareCanonicalJpeg,
  selectCanonicalImage,
} from "./canonical-image";

describe("canonical images", () => {
  it("selects only a derived image that belongs to the generated source", () => {
    const original = {
      id: "source-1",
      storageKey: "generated/source.png",
      mimeType: "image/png",
      width: 100,
      height: 80,
      megapixels: 0.008,
      fileSize: 100,
      checksum: "source",
      perceptualHash: "source-hash",
    };
    const derived = {
      ...original,
      id: "derived-1",
      sourceAssetId: "source-1",
      storageKey: "derived/clean.jpg",
      mimeType: "image/jpeg",
    };

    expect(selectCanonicalImage(original, derived).id).toBe("derived-1");
    expect(
      selectCanonicalImage(original, {
        ...derived,
        sourceAssetId: "another-source",
      }).id,
    ).toBe("source-1");
  });

  it("stores a logo-removed result as a dimension-preserving JPEG", async () => {
    const input = await sharp({
      create: {
        width: 1600,
        height: 1200,
        channels: 3,
        background: "#2d6f91",
      },
    })
      .png()
      .toBuffer();

    const result = await prepareCanonicalJpeg(input);

    expect(result.prepared).toMatchObject({
      format: "jpeg",
      width: 1600,
      height: 1200,
      megapixels: 1.92,
    });
    expect(result.buffer.byteLength).toBeLessThan(input.byteLength);
  });
});
