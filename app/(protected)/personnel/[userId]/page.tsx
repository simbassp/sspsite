"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { PersonnelProfileStats } from "@/components/personnel/PersonnelProfileStats";
import { readClientSession } from "@/lib/client-auth";
import { canUseFullPersonnelProfileInspect } from "@/lib/personnel-profile-path";

export default function PersonnelProfilePage() {
  const params = useParams<{ userId: string }>();
  const router = useRouter();
  const userId = params.userId;
  const session = useMemo(() => readClientSession(), []);
  const canUseFullProfile = canUseFullPersonnelProfileInspect(session);

  useEffect(() => {
    if (!userId || !session) return;
    if (session.id === userId) {
      router.replace("/profile");
      return;
    }
    if (canUseFullProfile) {
      router.replace(`/profile/${userId}`);
    }
  }, [userId, session, canUseFullProfile, router]);

  if (!session) {
    return (
      <section className="screen">
        <p className="page-subtitle">Загрузка…</p>
      </section>
    );
  }

  if (session.id === userId || canUseFullProfile) {
    return (
      <section className="screen">
        <p className="page-subtitle">Переход к профилю…</p>
      </section>
    );
  }

  return (
    <section className="screen personnel-page profile-page">
      <div style={{ marginBottom: 12 }}>
        <Link href="/personnel" className="page-subtitle" style={{ textDecoration: "none", fontWeight: 600 }}>
          ← Сотрудники
        </Link>
      </div>
      <h1 className="page-title">Профиль сотрудника</h1>
      <PersonnelProfileStats userId={userId} />
    </section>
  );
}
