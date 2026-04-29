/** Текст автора, который нужно заменить данными из профиля (GET) или не принимать с клиента (POST). */
export function isPlaceholderNewsAuthor(author: string) {
  const t = author.trim().toLowerCase();
  if (!t) return true;
  if (t === "редактор") return true;
  if (t === "автор не указан") return true;
  if (t === "editor") return true;
  return false;
}
