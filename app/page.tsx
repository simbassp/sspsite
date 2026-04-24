import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/server-auth";

export default async function Home() {
  const session = await getServerSession();
  redirect(session ? "/dashboard" : "/login");
}
