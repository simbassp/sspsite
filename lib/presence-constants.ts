/** Пользователь в списке «онлайн», если last_seen не старше этого окна. */
export const ONLINE_LAST_SEEN_MAX_MS = 5 * 60 * 1000;

/** Как часто шлём heartbeat, пока вкладка видима. */
export const PRESENCE_HEARTBEAT_MS = 90_000;

/** Как часто отправляем накопленное время в аналитику (heartbeat чаще, RPC реже). */
export const PRESENCE_ANALYTICS_FLUSH_MS = 3 * 60 * 1000;

/** После ухода со вкладки ждём столько, прежде чем пометить офлайн (не сбрасываем при Alt+Tab сразу). */
export const PRESENCE_HIDDEN_OFFLINE_DELAY_MS = 2 * 60 * 1000;
