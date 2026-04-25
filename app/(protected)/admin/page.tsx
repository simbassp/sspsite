import Link from "next/link";
import { canManageCounteraction, canManageNews, canManageResults, canManageTests, canManageUav, canManageUsers } from "@/lib/permissions";
import { getServerSession } from "@/lib/server-auth";

const contentLinks = [
  { href: "/admin/news", title: "Новости", text: "Добавление и публикация служебных сообщений.", access: canManageNews },
  { href: "/admin/counteraction", title: "Защита", text: "Добавление и редактирование карточек противодействия.", access: canManageCounteraction },
  { href: "/admin/uav", title: "БПЛА", text: "Управление каталогом БПЛА и ТТХ-страницами.", access: canManageUav },
  { href: "/admin/tests", title: "Тесты", text: "Контур контроля пробного и итогового тестов.", access: canManageTests },
  { href: "/admin/results", title: "Результаты", text: "Мониторинг прохождения и статусов тестирования.", access: canManageResults },
];

const adminOnlyLinks = [
  {
    href: "/admin/users",
    title: "Пользователи",
    text: "Поиск, фильтры, редактирование, деактивация и удаление.",
    access: canManageUsers,
  },
];

export default async function AdminPage() {
  const session = await getServerSession();
  const links = [...adminOnlyLinks, ...contentLinks].filter((item) => item.access(session));

  return (
    <section>
      <h1 className="page-title">Разделы администрирования</h1>
      <p className="page-subtitle">Доступные вам разделы управления контентом и пользователями.</p>

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
      {!links.length && <p className="page-subtitle">Для вашей учетной записи еще не выданы права администрирования.</p>}
    </section>
  );
}
