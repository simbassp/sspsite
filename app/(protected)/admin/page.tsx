import Link from "next/link";
import { canManageUsers } from "@/lib/permissions";
import { getServerSession } from "@/lib/server-auth";

const contentLinks = [
  { href: "/admin/news", title: "Новости", text: "Добавление и публикация служебных сообщений." },
  { href: "/admin/counteraction", title: "Защита", text: "Добавление и редактирование карточек противодействия." },
  { href: "/admin/uav", title: "БПЛА", text: "Управление каталогом БПЛА и ТТХ-страницами." },
  { href: "/admin/tests", title: "Тесты", text: "Контур контроля пробного и итогового тестов." },
];

const adminOnlyLinks = [
  { href: "/admin/users", title: "Пользователи", text: "Поиск, фильтры, редактирование, деактивация и удаление." },
  { href: "/admin/results", title: "Результаты", text: "Быстрые фильтры: сдал / не сдал / не проходил." },
];

export default async function AdminPage() {
  const session = await getServerSession();
  const links = canManageUsers(session) ? [...adminOnlyLinks, ...contentLinks] : contentLinks;

  return (
    <section>
      <h1 className="page-title">Панель управления</h1>
      <p className="page-subtitle">Редактирование учебного контента и справочников.</p>

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
