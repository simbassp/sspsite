import { canManageUav } from "@/lib/permissions";
import { getServerSession } from "@/lib/server-auth";
import { redirect } from "next/navigation";

export default async function AdminUavLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession();
  if (!canManageUav(session)) {
    redirect("/admin");
  }
  return <>{children}</>;
}
