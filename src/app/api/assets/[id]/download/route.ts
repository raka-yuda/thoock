import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { withApiLogging } from "@/lib/server/logger";
import { prepareApprovedAssetForExport } from "@/modules/exports/prepare-approved-asset";

export const runtime = "nodejs";

async function post(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!(await readSession()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!process.env.DATABASE_URL)
    return NextResponse.json(
      { error: "Database is not configured." },
      { status: 409 },
    );
  try {
    const { id } = await context.params;
    const item = await prepareApprovedAssetForExport(id);
    return new NextResponse(new Uint8Array(item.jpeg), {
      headers: {
        "content-type": "image/jpeg",
        "content-disposition": `attachment; filename="${item.metadata.filename}"`,
        "content-length": String(item.jpeg.byteLength),
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The image could not be prepared.",
      },
      { status: 409 },
    );
  }
}

export const POST = withApiLogging(post);
