import { AppShell } from "@/components/app-shell";
import { requireSession } from "@/lib/auth";
import { resolveRuntimeConfig } from "@/lib/runtime-config";
export default async function ApplicationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();
  const { mockMode } = resolveRuntimeConfig();
  return (
    <AppShell ownerEmail={session.email} mockMode={mockMode}>
      {children}
    </AppShell>
  );
}
