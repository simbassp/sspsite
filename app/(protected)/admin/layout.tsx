import { getServerSession } from "@/lib/server-auth";
import { canManageContent } from "@/lib/permissions";
import { redirect } from "next/navigation";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession();
  if (!canManageContent(session)) {
    redirect("/dashboard");
  }
  return <>{children}</>;
}
