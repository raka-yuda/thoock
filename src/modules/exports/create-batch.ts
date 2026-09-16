import "server-only";
import JSZip from "jszip";
import { generateAdobeCsv } from "@/lib/domain/export";
import {
  validateAdobeMetadata,
  type AssetMetadata,
} from "@/lib/domain/metadata";
import { inspectImage } from "@/modules/assets/inspect";

export type ExportItem = {
  metadata: AssetMetadata;
  jpeg: Buffer;
  checksum: string;
  sourceAssetId: string;
  preparedAssetId: string;
  upscaled: boolean;
  reviewCompleted: boolean;
};

export async function createExportArchive(
  name: string,
  items: ExportItem[],
  minimumMegapixels = 4,
) {
  if (!items.length)
    throw new Error("Select at least one submission-ready image.");
  const inspected = await Promise.all(
    items.map(async (item) => ({ item, inspection: await inspectImage(item.jpeg) })),
  );
  const invalid = inspected.filter(
    ({ item, inspection }) =>
      !validateAdobeMetadata(item.metadata).valid ||
      !item.reviewCompleted ||
      inspection.format !== "jpeg" ||
      inspection.megapixels < minimumMegapixels ||
      inspection.checksum !== item.checksum,
  );
  if (invalid.length)
    throw new Error(
      `${invalid.length} selected assets are not submission ready.`,
    );
  const csv = generateAdobeCsv(items.map((item) => item.metadata));
  const manifest = {
    batchName: name,
    createdAt: new Date().toISOString(),
    itemCount: items.length,
    files: inspected.map(({ item, inspection }) => ({
      filename: item.metadata.filename,
      checksum: inspection.checksum,
      inspectedWidth: inspection.width,
      inspectedHeight: inspection.height,
      inspectedMegapixels: inspection.megapixels,
      inspectedFormat: inspection.format,
      fileSize: inspection.fileSize,
      sourceAssetId: item.sourceAssetId,
      preparedAssetId: item.preparedAssetId,
      upscaled: item.upscaled,
    })),
  };
  const compliance = {
    generatedAt: new Date().toISOString(),
    advisoryOnly: true,
    rulesVersion: "local-config",
    minimumMegapixels,
    items: inspected.map(({ item, inspection }) => ({
      filename: item.metadata.filename,
      metadataValid: true,
      humanReviewComplete: item.reviewCompleted,
      finalJpegValid:
        inspection.format === "jpeg" &&
        inspection.megapixels >= minimumMegapixels,
      actualInspectedDimensions: {
        width: inspection.width,
        height: inspection.height,
        megapixels: inspection.megapixels,
      },
      generativeAi: item.metadata.generativeAi,
      upscaled: item.upscaled,
      reminder: item.upscaled
        ? "Review AI-upscaled details for fidelity and artifacts."
        : "Final intellectual-property and quality review remains manual.",
    })),
  };
  const zip = new JSZip();
  items.forEach((item) => zip.file(item.metadata.filename, item.jpeg));
  zip.file("adobe-stock.csv", csv);
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  zip.file("compliance-report.json", JSON.stringify(compliance, null, 2));
  return {
    buffer: await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: { level: 6 },
    }),
    csv,
    manifest,
    compliance,
  };
}
