import { eq } from "drizzle-orm";
import {
  GenerationWorkspace,
  type GenerationDraft,
} from "@/components/generation-workspace";
import { getDb } from "@/db";
import { commercialBriefs } from "@/db/schema";
import { resolveRuntimeConfig } from "@/lib/runtime-config";
import { loadConfiguredModelCatalog } from "@/modules/providers/model-catalog.server";

export default async function GenerationPage({
  searchParams,
}: {
  searchParams: Promise<{ brief?: string }>;
}) {
  const { brief: briefId } = await searchParams;
  const { mockMode } = resolveRuntimeConfig();
  let briefDraft: GenerationDraft | null = null;
  if (
    process.env.DATABASE_URL &&
    briefId &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      briefId,
    )
  ) {
    const brief = await getDb().query.commercialBriefs.findFirst({
      where: eq(commercialBriefs.id, briefId),
    });
    if (brief)
      briefDraft = {
        briefId: brief.id,
        briefName: brief.name,
        prompt: brief.generationPrompt,
        negativePrompt: brief.negativePrompt,
        orientation: brief.orientation,
        candidateCount: brief.candidateCount,
      };
  }
  return (
    <GenerationWorkspace
      catalog={await loadConfiguredModelCatalog()}
      mockMode={mockMode}
      briefDraft={briefDraft}
      localUpscaleConfigured={
        process.env.LOCAL_UPSCALE_ENABLED === "true" &&
        Boolean(
          process.env.LOCAL_UPSCALE_URL || process.env.LOCAL_UPSCALE_EXECUTABLE,
        )
      }
    />
  );
}
