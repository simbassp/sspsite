export const DEFAULT_SUPABASE_FETCH_TIMEOUT_MS = 8_000;

/** Не даём запросам к Supabase висеть минутами после простоя сервера/вкладки. */
export function createSupabaseFetch(timeoutMs = DEFAULT_SUPABASE_FETCH_TIMEOUT_MS): typeof fetch {
  return (input, init) =>
    fetch(input, {
      ...init,
      signal: init?.signal ?? AbortSignal.timeout(timeoutMs),
    });
}
