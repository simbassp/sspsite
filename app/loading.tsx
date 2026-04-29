export default function AppLoading() {
  return (
    <div className="screen" style={{ padding: "24px 16px", textAlign: "center" }}>
      <p className="page-subtitle" style={{ margin: 0 }}>
        Проверяем вход...
      </p>
      <p className="label" style={{ marginTop: 12, marginBottom: 0 }}>
        При медленном соединении загрузка может занять несколько секунд.
      </p>
    </div>
  );
}
