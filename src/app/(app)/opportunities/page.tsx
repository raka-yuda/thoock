import { OpportunityWorkspace } from "@/components/opportunity-workspace";
import { resolveRuntimeConfig } from "@/lib/runtime-config";

export default function OpportunitiesPage() {
  const { defaultResearchProvider } = resolveRuntimeConfig();
  return (
    <OpportunityWorkspace defaultResearchProvider={defaultResearchProvider} />
  );
}
