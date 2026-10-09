import { BriefWorkspace } from "@/components/brief-workspace";
import { resolveRuntimeConfig } from "@/lib/runtime-config";
import { loadConfiguredModelCatalog } from "@/modules/providers/model-catalog.server";

export default async function BriefsPage() {
  const {
    mockMode,
    defaultBriefProvider,
    defaultPromptProvider,
  } = resolveRuntimeConfig();
  return (
    <BriefWorkspace
      catalog={await loadConfiguredModelCatalog()}
      mockMode={mockMode}
      defaultBriefProvider={defaultBriefProvider}
      defaultPromptProvider={defaultPromptProvider}
    />
  );
}
