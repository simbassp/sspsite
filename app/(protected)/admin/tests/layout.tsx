import { canManageTests } from "@/lib/permissions";
import { getServerSession } from "@/lib/server-auth";
import { redirect } from "next/navigation";

export default async function AdminTestsLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession();
  if (!canManageTests(session)) {
    redirect("/admin");
  }
  return <>{children}</>;
}
