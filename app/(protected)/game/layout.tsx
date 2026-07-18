import { redirect } from "next/navigation";
import { canAccessGameSection } from "@/lib/game-feature";
import { getServerSession } from "@/lib/server-auth";

export default async function GameLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession();
  if (!canAccessGameSection(session)) {
    redirect("/dashboard");
  }
  return <div className="game-shell">{children}</div>;
}
