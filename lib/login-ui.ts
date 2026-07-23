export type LoginFailureKind = "timeout" | "network" | "api";

/** Сообщения для пользователя; технические строки API приводим к понятному виду. */
export function mapLoginErrorForDisplay(raw: string, kind: LoginFailureKind): string {
  if (kind === "timeout") {
    return "Не удалось подключиться к серверу. Проверьте интернет и попробуйте ещё раз.";
  }
  if (kind === "network") {
    return "Не удалось подключиться к серверу. Проверьте интернет, отключите VPN/прокси и попробуйте снова.";
  }
  const e = raw.trim().toLowerCase();
  if (
    e.includes("неверный логин") ||
    (e.includes("неверный") && e.includes("пароль")) ||
    e.includes("invalid login") ||
    e.includes("invalid credentials")
  ) {
    return "Неверный логин или пароль.";
  }
  if (e.includes("не найден в app_users") || e.includes("профиль пользователя не найден")) {
    return "Профиль пользователя не найден. Обратитесь к администратору.";
  }
  if (e.includes("деактивирован")) {
    return "Учётная запись отключена. Обратитесь к администратору.";
  }
  if (e.includes("не подтвержден") || e.includes("email не подтвержден")) {
    return "Email не подтверждён. Подтвердите почту по письму.";
  }
  if (e.includes("логин не найден") || e.includes("login not found")) {
    return "Логин не найден. Проверьте логин или укажите email.";
  }
  if (e.includes("слишком много запросов") || e.includes("rate limit")) {
    return "Слишком много запросов на сброс. Подождите минуту и попробуйте снова.";
  }
  if (e.includes("слишком много попыток") || e.includes("too many")) {
    return "Слишком много попыток входа. Подождите и попробуйте снова.";
  }
  if (e.includes("нет доступа") || e.includes("forbidden")) {
    return "У пользователя нет доступа к системе.";
  }
  if (e.includes("сервер авторизации временно недоступен")) {
    return "Сервер авторизации временно недоступен. Попробуйте через минуту.";
  }
  const trimmed = raw.trim();
  return trimmed || "Не удалось войти. Попробуйте ещё раз.";
}
