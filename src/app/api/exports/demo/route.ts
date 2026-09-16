import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { MockImageGenerationProvider } from "@/modules/providers/generation";
import { prepareAdobeJpeg } from "@/modules/assets/prepare";
import { createExportArchive } from "@/modules/exports/create-batch";
import { DeterministicMetadataProvider } from "@/modules/providers/metadata";
import { readSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  if (!(await readSession()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const generator = new MockImageGenerationProvider();
  const metadataProvider = new DeterministicMetadataProvider();
  const generated = await generator.generate({
    prompt: "Commercial remote-work wellness scene with copy space",
    model: "mock-v1",
    requestedWidth: 2048,
    requestedHeight: 2048,
    aspectRatio: "1:1",
    resolution: "direct-4mp",
    candidates: 2,
  });
  const items = await Promise.all(
    generated.map(async (image, index) => {
      const metadata = await metadataProvider.generate({
        briefName:
          index === 0
            ? "Calm professional at a home workspace"
            : "Mindful break during a remote workday",
        prompt:
          "remote work, home office, wellness, professional, mindful break, productivity, commercial lifestyle",
        filenameHint: `mock-remote-work-${index + 1}`,
      });
      const prepared = await prepareAdobeJpeg(image.buffer, metadata.filename);
      return {
        metadata: { ...metadata, filename: prepared.filename },
        jpeg: prepared.buffer,
        checksum: createHash("sha256").update(prepared.buffer).digest("hex"),
        sourceAssetId: `demo-source-${index + 1}`,
        preparedAssetId: `demo-prepared-${index + 1}`,
        upscaled: false,
        reviewCompleted: true,
      };
    }),
  );
  const archive = await createExportArchive("Demo Adobe batch", items);
  return new NextResponse(new Uint8Array(archive.buffer), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": "attachment; filename=stocklab-demo-export.zip",
      "cache-control": "no-store",
    },
  });
}
