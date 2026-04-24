import { AppShell } from "@/components/AppShell";
import { getServerSession } from "@/lib/server-auth";
import { redirect } from "next/navigation";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession();
  if (!session) {
    redirect("/login");
  }

  return <AppShell session={session}>{children}</AppShell>;
}
