"use client";

import { useEffect } from "react";

function isChunkLoadError(error: Error) {
  return (
    error.name === "ChunkLoadError" ||
    /Loading chunk|Failed to fetch dynamically imported module|Importing a module script failed/i.test(error.message)
  );
}

export default function ProtectedError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const chunkError = isChunkLoadError(error);

  useEffect(() => {
    if (!chunkError) return;
    const key = "ssp-chunk-reload";
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    window.location.reload();
  }, [chunkError]);

  const onRetry = () => {
    if (chunkError) {
      window.location.reload();
      return;
    }
    reset();
  };

  return (
    <section>
      <h1 className="page-title">Ошибка загрузки</h1>
      <p className="page-subtitle">
        {chunkError
          ? "Сайт обновился, а в браузере осталась старая версия. Нажмите «Повторить» или обновите страницу (Ctrl+F5)."
          : "Не удалось открыть страницу. Проверьте интернет и попробуйте снова."}
      </p>
      <button className="btn btn-primary" type="button" onClick={onRetry} style={{ marginTop: 12 }}>
        Повторить
      </button>
    </section>
  );
}
