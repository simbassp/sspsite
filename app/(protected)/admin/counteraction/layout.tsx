import { canManageCounteraction } from "@/lib/permissions";
import { getServerSession } from "@/lib/server-auth";
import { redirect } from "next/navigation";

export default async function AdminCounteractionLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession();
  if (!canManageCounteraction(session)) {
    redirect("/admin");
  }
  return <>{children}</>;
}
