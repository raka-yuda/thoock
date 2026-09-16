import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { createExportArchive, type ExportItem } from "./create-batch";

async function item(width: number, height: number): Promise<ExportItem> {
  const jpeg = await sharp({ create: { width, height, channels: 3, background: "#426752" } }).jpeg({ quality: 94 }).toBuffer();
  return {
    jpeg,
    checksum: createHash("sha256").update(jpeg).digest("hex"),
    sourceAssetId: "source",
    preparedAssetId: "prepared",
    upscaled: false,
    reviewCompleted: true,
    metadata: { filename: "verified-output.jpg", title: "Verified commercial stock image", category: "3", language: "en", keywords: ["commercial", "business", "background", "modern", "copy space"], generativeAi: true, fictionalPeopleProperty: false },
  };
}

describe("final export compliance gate", () => {
  it("re-inspects final JPEG bytes and records authoritative dimensions", async () => {
    const archive = await createExportArchive("Ready", [await item(2050, 2050)]);
    expect(archive.manifest.files[0]).toMatchObject({ inspectedWidth: 2050, inspectedHeight: 2050, inspectedFormat: "jpeg" });
  });

  it("blocks a final JPEG whose actual bytes are below 4MP", async () => {
    await expect(createExportArchive("Too small", [await item(1999, 1999)])).rejects.toThrow("not submission ready");
  });

  it("blocks a mismatched checksum", async () => {
    const candidate = await item(2050, 2050);
    candidate.checksum = "0".repeat(64);
    await expect(createExportArchive("Changed bytes", [candidate])).rejects.toThrow("not submission ready");
  });
});
