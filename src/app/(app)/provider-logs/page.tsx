import { ProviderLogsWorkspace } from "@/components/provider-logs-workspace";

export default async function ProviderLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ job?: string }>;
}) {
  const { job } = await searchParams;
  const jobId =
    job &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(job)
      ? job
      : undefined;
  return <ProviderLogsWorkspace jobId={jobId} />;
}
