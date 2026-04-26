export default function ProtectedLoading() {
  return (
    <section>
      <h1 className="page-title">Загрузка</h1>
      <p className="page-subtitle">Проверяем сессию и загружаем данные страницы…</p>
      <div className="card" style={{ marginTop: 12 }}>
        <div className="card-body">
          <p className="label">Если сеть нестабильна, загрузка может занять до 10-15 секунд.</p>
        </div>
      </div>
    </section>
  );
}
