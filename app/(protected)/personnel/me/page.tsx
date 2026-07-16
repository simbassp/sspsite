"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { readClientSession } from "@/lib/client-auth";

export default function PersonnelMeRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    const session = readClientSession();
    if (session?.id) router.replace(`/personnel/${session.id}`);
    else router.replace("/login");
  }, [router]);
  return <p className="page-subtitle">Переход в профиль…</p>;
}
