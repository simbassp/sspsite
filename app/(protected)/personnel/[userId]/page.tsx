"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { readClientSession } from "@/lib/client-auth";

export default function PersonnelProfilePage() {
  const params = useParams<{ userId: string }>();
  const router = useRouter();
  const userId = params.userId;
  const session = useMemo(() => readClientSession(), []);

  useEffect(() => {
    if (!userId || !session) return;
    if (session.id === userId) {
      router.replace("/profile");
      return;
    }
    router.replace(`/profile/${userId}`);
  }, [userId, session, router]);

  return (
    <section className="screen">
      <p className="page-subtitle">Переход к профилю…</p>
    </section>
  );
}
