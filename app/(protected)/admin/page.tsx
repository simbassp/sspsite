import Link from "next/link";

const links = [
  { href: "/admin/users", title: "Пользователи", text: "Поиск, фильтры, редактирование, деактивация и удаление." },
  { href: "/admin/results", title: "Результаты", text: "Быстрые фильтры: сдал / не сдал / не проходил." },
  { href: "/admin/news", title: "Новости", text: "Добавление и публикация служебных сообщений." },
  { href: "/admin/counteraction", title: "Противодействие", text: "Справочник карточек и проверка наполнения." },
  { href: "/admin/uav", title: "БПЛА", text: "Управление каталогом БПЛА и ТТХ-страницами." },
  { href: "/admin/tests", title: "Тесты", text: "Контур контроля пробного и итогового тестов." },
];

export default function AdminPage() {
  return (
    <section>
      <h1 className="page-title">Админ-панель</h1>
      <p className="page-subtitle">Отдельная зона администратора, отделенная от пользовательской части.</p>

      <div className="grid grid-two">
        {links.map((item) => (
          <Link key={item.href} href={item.href} className="card">
            <div className="card-body">
              <h3>{item.title}</h3>
              <p className="page-subtitle" style={{ marginTop: 8, marginBottom: 0 }}>
                {item.text}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
