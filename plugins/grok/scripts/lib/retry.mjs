// Capped retry/backoff for rate-limit-shaped Grok CLI failures. The CLI
// only gives this broker an exit code plus a last-error-message string, not
// a structured HTTP status, so classifying "was this a rate limit" is
// necessarily a string-match heuristic.
const RATE_LIMIT_PATTERN = /429|rate.?limit|too many requests/i;

/** @param {string|null} errorDetail */
export function isRateLimitError(errorDetail) {
  return typeof errorDetail === "string" && RATE_LIMIT_PATTERN.test(errorDetail);
}

function defaultDelay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retries `runFn` when its result looks rate-limit-shaped, with
 * exponential backoff. Shares the caller's own `deadline` — this does not
 * get its own separate time budget.
 *
 * @template {{timedOut: boolean, exitCode: number|null, errorDetail: string|null}} T
 * @param {() => T} runFn
 * @param {{maxAttempts?: number, baseDelayMs?: number, deadline: number, delayFn?: (ms: number) => Promise<void>}} opts
 * @returns {Promise<T>}
 */
export async function withRateLimitRetry(
  runFn,
  { maxAttempts = 3, baseDelayMs = 2000, deadline, delayFn = defaultDelay },
) {
  let result = runFn();
  let attempt = 1;
  while (
    attempt < maxAttempts &&
    !result.timedOut &&
    result.exitCode !== 0 &&
    isRateLimitError(result.errorDetail)
  ) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) break;
    const delayMs = Math.min(baseDelayMs * 2 ** (attempt - 1), remainingMs);
    await delayFn(delayMs);
    result = runFn();
    attempt += 1;
  }
  return result;
}
