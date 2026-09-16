import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { prepareAdobeJpeg, validatePreparedJpeg } from "./prepare";
describe("JPEG preparation", () => {
  it("prepares a high quality minimum-4MP JPEG without enlarging", async () => {
    const input = await sharp({
      create: { width: 2048, height: 2048, channels: 3, background: "#4d7d66" },
    })
      .png()
      .toBuffer();
    const output = await prepareAdobeJpeg(input, "Commercial Test Image.png");
    expect(output.prepared.format).toBe("jpeg");
    expect(output.prepared.megapixels).toBeGreaterThanOrEqual(4);
    expect(output.filename.length).toBeLessThanOrEqual(30);
    expect(
      validatePreparedJpeg({
        format: output.prepared.format,
        megapixels: output.prepared.megapixels,
        filename: output.filename,
      }).valid,
    ).toBe(true);
  });
  it("rejects sources below 4MP", async () => {
    const input = await sharp({
      create: { width: 1000, height: 1000, channels: 3, background: "#333333" },
    })
      .jpeg()
      .toBuffer();
    await expect(prepareAdobeJpeg(input, "small.jpg")).rejects.toThrow(
      "must reach 4MP",
    );
  });
});
