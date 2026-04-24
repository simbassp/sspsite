import { canManageUsers } from "@/lib/permissions";
import { getServerSession } from "@/lib/server-auth";
import { redirect } from "next/navigation";

export default async function AdminResultsLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession();
  if (!canManageUsers(session)) {
    redirect("/admin");
  }
  return <>{children}</>;
}
