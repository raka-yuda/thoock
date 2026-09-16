import { BriefWorkspace } from "@/components/brief-workspace";
import { loadConfiguredModelCatalog } from "@/modules/providers/model-catalog.server";

export default async function BriefsPage() {
  return <BriefWorkspace catalog={await loadConfiguredModelCatalog()} />;
}
