import { SettingsWorkspace } from "@/components/settings-workspace";
import { resolveRuntimeConfig } from "@/lib/runtime-config";

const settingsTabs = ["cost", "providers", "compliance", "security"] as const;
type SettingsTab = (typeof settingsTabs)[number];

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const requestedTab = (await searchParams).tab;
  const value = Array.isArray(requestedTab) ? requestedTab[0] : requestedTab;
  const initialTab: SettingsTab = settingsTabs.includes(value as SettingsTab)
    ? (value as SettingsTab)
    : "cost";
  const { mockMode } = resolveRuntimeConfig();
  return (
    <SettingsWorkspace
      initialTab={initialTab}
      mockMode={mockMode}
      openAIConfigured={Boolean(process.env.OPENAI_API_KEY?.trim())}
      snapgenConfigured={Boolean(
        process.env.SNAPGEN_API_BASE_URL?.trim() &&
          process.env.SNAPGEN_API_KEY?.trim(),
      )}
    />
  );
}
