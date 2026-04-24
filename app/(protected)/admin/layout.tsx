import { getServerSession } from "@/lib/server-auth";
import { redirect } from "next/navigation";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession();
  if (!session || session.role !== "admin") {
    redirect("/dashboard");
  }
  return <>{children}</>;
}
