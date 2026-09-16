import { AppShell } from "@/components/app-shell";
import { requireSession } from "@/lib/auth";
export default async function ApplicationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();
  return <AppShell ownerEmail={session.email}>{children}</AppShell>;
}
