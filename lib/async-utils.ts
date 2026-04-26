export async function withTimeout<TPromise extends PromiseLike<unknown>>(
  promise: TPromise,
  timeoutMs: number,
  timeoutMessage = "request_timeout",
): Promise<Awaited<TPromise>> {
  return (await Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    }),
  ])) as Awaited<TPromise>;
}

export async function withRetry<TOperation extends () => PromiseLike<unknown>>(
  operation: TOperation,
  retries = 1,
  delayMs = 350,
): Promise<Awaited<ReturnType<TOperation>>> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return (await operation()) as Awaited<ReturnType<TOperation>>;
    } catch (error) {
      lastError = error;
      if (attempt >= retries) break;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("operation_failed");
}

export async function withTimeoutAndRetry<TOperation extends () => PromiseLike<unknown>>(
  operation: TOperation,
  timeoutMs: number,
  retries = 1,
  timeoutMessage = "request_timeout",
): Promise<Awaited<ReturnType<TOperation>>> {
  return (await withRetry(() => withTimeout(operation(), timeoutMs, timeoutMessage), retries)) as Awaited<
    ReturnType<TOperation>
  >;
}
