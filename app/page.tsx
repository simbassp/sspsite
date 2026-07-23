"use client";

import { useEffect, useState } from "react";

export default function HomePage() {
  const [message] = useState("Загрузка...");

  useEffect(() => {
    const hash = window.location.hash;
    const search = window.location.search;
    const searchParams = new URLSearchParams(search);

    if (hash && (hash.includes("access_token") || hash.includes("type=recovery"))) {
      window.location.replace(`/reset-password${search}${hash}`);
      return;
    }
    if (searchParams.has("code") || searchParams.has("token_hash") || searchParams.has("token")) {
      window.location.replace(`/reset-password${search}`);
      return;
    }

    const hasSession = document.cookie
      .split(";")
      .map((part) => part.trim())
      .some((part) => part.startsWith("ssp_session="));
    window.location.replace(hasSession ? "/dashboard" : "/login");
  }, []);

  return (
    <div className="auth-wrap">
      <p className="page-subtitle">{message}</p>
    </div>
  );
}
