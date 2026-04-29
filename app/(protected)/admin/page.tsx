import Link from "next/link";
import {
  canManageCounteraction,
  canManageNews,
  canManageResults,
  canManageTests,
  canManageUav,
  canManageUsers,
} from "@/lib/permissions";
import { getServerSession } from "@/lib/server-auth";

type IconColor = "purple" | "green" | "blue" | "orange" | "sky" | "red";

type AdminLinkDef = {
  href: string;
  title: string;
  text: string;
  color: IconColor;
  access: (session: Parameters<typeof canManageNews>[0]) => boolean;
};

const contentLinks: AdminLinkDef[] = [
  {
    href: "/admin/news",
    title: "Новости",
    text: "Добавление и публикация служебных сообщений.",
    color: "purple",
    access: canManageNews,
  },
  {
    href: "/admin/counteraction",
    title: "Противодействие",
    text: "Добавление и редактирование карточек противодействия.",
    color: "green",
    access: canManageCounteraction,
  },
  {
    href: "/admin/uav",
    title: "БПЛА",
    text: "Управление каталогом БПЛА и ТТХ-страницами.",
    color: "blue",
    access: canManageUav,
  },
  {
    href: "/admin/tests",
    title: "Тесты",
    text: "Контур контроля пробного и итогового тестов.",
    color: "orange",
    access: canManageTests,
  },
  {
    href: "/admin/results",
    title: "Результаты",
    text: "Мониторинг прохождения и статусов тестирования.",
    color: "sky",
    access: canManageResults,
  },
];

const adminOnlyLinks: AdminLinkDef[] = [
  {
    href: "/admin/users",
    title: "Пользователи",
    text: "Поиск, фильтры, редактирование, деактивация и удаление.",
    color: "red",
    access: canManageUsers,
  },
];

function AdminSectionIcon({ href }: { href: string }) {
  switch (href) {
    case "/admin/users":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className="home-icon-svg">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case "/admin/news":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className="home-icon-svg">
          <rect x="4" y="4" width="13" height="16" rx="2" />
          <path d="M17 7h3v11a2 2 0 0 1-2 2" />
          <line x1="7" y1="9" x2="14" y2="9" />
          <line x1="7" y1="13" x2="14" y2="13" />
        </svg>
      );
    case "/admin/counteraction":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className="home-icon-svg">
          <path d="M12 3l8 3v6c0 5-3.5 8.5-8 9.8C7.5 20.5 4 17 4 12V6l8-3z" />
          <path d="M9 12.5l2 2 4-4" />
        </svg>
      );
    case "/admin/uav":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className="home-icon-svg">
          <circle cx="12" cy="12" r="2.3" />
          <circle cx="5.5" cy="5.5" r="2" />
          <circle cx="18.5" cy="5.5" r="2" />
          <circle cx="5.5" cy="18.5" r="2" />
          <circle cx="18.5" cy="18.5" r="2" />
          <path d="M7 7l3.4 3.4M17 7l-3.4 3.4M7 17l3.4-3.4M17 17l-3.4-3.4" />
        </svg>
      );
    case "/admin/tests":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className="home-icon-svg">
          <rect x="5" y="4" width="14" height="17" rx="2" />
          <rect x="9" y="2.5" width="6" height="3.5" rx="1.2" />
          <line x1="8" y1="11" x2="16" y2="11" />
          <line x1="8" y1="15" x2="13" y2="15" />
        </svg>
      );
    case "/admin/results":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className="home-icon-svg">
          <line x1="18" y1="20" x2="18" y2="10" />
          <line x1="12" y1="20" x2="12" y2="4" />
          <line x1="6" y1="20" x2="6" y2="14" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className="home-icon-svg">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4M12 8h.01" />
        </svg>
      );
  }
}

export default async function AdminPage() {
  const session = await getServerSession();
  const links = [...adminOnlyLinks, ...contentLinks].filter((item) => item.access(session));

  return (
    <section className="admin-home-sections">
      <h1 className="page-title">Разделы администрирования</h1>
      <p className="page-subtitle">Доступные вам разделы управления контентом и пользователями.</p>

      <article className="card" style={{ marginTop: 12 }}>
        <div className="card-body">
          <h3 className="admin-home-sections__card-title">Управление</h3>
          <div className="home-sections-grid admin-home-sections__grid">
            {links.map((item) => (
              <Link key={item.href} href={item.href} className="home-section-card" prefetch={false}>
                <span className={`home-icon-wrap is-${item.color}`}>
                  <AdminSectionIcon href={item.href} />
                </span>
                <span className="home-section-main">
                  <span className="home-section-title">{item.title}</span>
                  <span className="home-section-desc">{item.text}</span>
                </span>
                <span className="home-section-arrow" aria-hidden="true">
                  <svg viewBox="0 0 24 24" className="home-icon-svg">
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </span>
              </Link>
            ))}
          </div>
        </div>
      </article>
      {!links.length && <p className="page-subtitle">Для вашей учетной записи еще не выданы права администрирования.</p>}
    </section>
  );
}
