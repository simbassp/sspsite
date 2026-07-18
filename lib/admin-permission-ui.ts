import type { UserPermissions } from "@/lib/types";

export type AdminPermissionOptionKey = Exclude<keyof UserPermissions, "online">;

export type AdminPermissionOption = {
  key: AdminPermissionOptionKey;
  label: string;
  description: string;
  tone: "blue" | "green" | "purple" | "orange" | "sky" | "rose" | "amber" | "indigo" | "slate";
};

export const ADMIN_PERMISSION_OPTIONS: AdminPermissionOption[] = [
  {
    key: "news",
    label: "Новости",
    description: "Просмотр и создание новостей",
    tone: "blue",
  },
  {
    key: "tests",
    label: "Тесты",
    description: "Создание и управление тестами",
    tone: "green",
  },
  {
    key: "results",
    label: "Проверка результатов",
    description: "Проверка и оценка результатов",
    tone: "purple",
  },
  {
    key: "resetResults",
    label: "Сброс результатов",
    description: "Сброс и очистка результатов тестов",
    tone: "orange",
  },
  {
    key: "uav",
    label: "БПЛА",
    description: "Управление данными по БПЛА",
    tone: "sky",
  },
  {
    key: "counteraction",
    label: "Противодействие",
    description: "Просмотр и управление мерами противодействия",
    tone: "rose",
  },
  {
    key: "userList",
    label: "Список пользователей",
    description: "Просмотр и управление пользователями",
    tone: "amber",
  },
  {
    key: "users",
    label: "Редактирование и удаление пользователей",
    description: "Редактирование и удаление учетных записей",
    tone: "indigo",
  },
  {
    key: "personnelModeration",
    label: "Модерация личного дела (4 рота)",
    description: "Модерация и управление личными делами 4 роты",
    tone: "slate",
  },
];
