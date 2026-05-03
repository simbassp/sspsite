import { canManageUsers, canViewUserList } from "@/lib/permissions";
import { getServerSession } from "@/lib/server-auth";
import { redirect } from "next/navigation";

export default async function AdminUsersLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession();
  if (!canManageUsers(session) && !canViewUserList(session)) {
    redirect("/admin");
  }
  return <>{children}</>;
}
