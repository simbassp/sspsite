"use client";

import { useEffect, useState } from "react";
import { readClientSession } from "@/lib/client-auth";
import type { SessionUser } from "@/lib/types";

/** Сессия из cookie — только после mount, чтобы SSR и первый клиентский render совпадали. */
export function useClientSession() {
  const [hydrated, setHydrated] = useState(false);
  const [session, setSession] = useState<SessionUser | null>(null);

  useEffect(() => {
    setSession(readClientSession());
    setHydrated(true);
  }, []);

  return { session, hydrated };
}
