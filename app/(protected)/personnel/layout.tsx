import { redirect } from "next/navigation";
import { getPersonnelContext } from "@/lib/personnel-api-guard";

export default async function PersonnelLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getPersonnelContext();
  if (!ctx.ok) {
    redirect(ctx.status === 401 ? "/login" : "/dashboard");
  }
  return children;
}
