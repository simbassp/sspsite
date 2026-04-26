"use client";

export default function ProtectedError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section>
      <h1 className="page-title">Ошибка загрузки</h1>
      <p className="page-subtitle">Не удалось открыть страницу. Проверьте интернет и попробуйте снова.</p>
      <button className="btn btn-primary" type="button" onClick={reset} style={{ marginTop: 12 }}>
        Повторить
      </button>
    </section>
  );
}
