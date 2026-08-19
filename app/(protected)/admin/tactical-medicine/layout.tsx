import { canManageTacticalMedicine } from "@/lib/permissions";
import { getServerSession } from "@/lib/server-auth";
import { redirect } from "next/navigation";

export default async function AdminTacticalMedicineLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession();
  if (!canManageTacticalMedicine(session)) {
    redirect("/admin");
  }
  return <>{children}</>;
}
