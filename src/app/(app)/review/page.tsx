import { ReviewWorkspace } from "@/components/review-workspace";
import { resolveRuntimeConfig } from "@/lib/runtime-config";

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ imageId?: string | string[] }>;
}) {
  const value = (await searchParams).imageId;
  const imageId = typeof value === "string" ? value : undefined;
  return (
    <ReviewWorkspace
      initialAssetId={imageId}
      defaultMetadataProvider={resolveRuntimeConfig().defaultMetadataProvider}
    />
  );
}
