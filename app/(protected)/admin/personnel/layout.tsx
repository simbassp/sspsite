import { redirect } from "next/navigation";
import { canModeratePersonnel } from "@/lib/permissions";
import { getServerSession } from "@/lib/server-auth";

export default async function AdminPersonnelLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession();
  if (!session || (session.role !== "admin" && !canModeratePersonnel(session))) {
    redirect("/admin");
  }
  return children;
}
