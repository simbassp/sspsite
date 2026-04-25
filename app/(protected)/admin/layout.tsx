import { getServerSession } from "@/lib/server-auth";
import { canAccessAdminPanel } from "@/lib/permissions";
import { redirect } from "next/navigation";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession();
  if (!canAccessAdminPanel(session)) {
    redirect("/dashboard");
  }
  return <>{children}</>;
}
