export async function withTimeout<T>(
  promise: PromiseLike<T>,
  timeoutMs: number,
  timeoutMessage = "request_timeout",
): Promise<T> {
  return (await Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    }),
  ])) as T;
}

export async function withRetry<T>(operation: () => Promise<T>, retries = 1, delayMs = 350): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt >= retries) break;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("operation_failed");
}

export async function withTimeoutAndRetry<T>(
  operation: () => PromiseLike<T>,
  timeoutMs: number,
  retries = 1,
  timeoutMessage = "request_timeout",
): Promise<T> {
  return withRetry(() => withTimeout(operation(), timeoutMs, timeoutMessage), retries);
}
