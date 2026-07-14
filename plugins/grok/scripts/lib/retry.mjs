// Capped retry/backoff for rate-limit-shaped `runCodex()` failures. Grok is
// a paid hosted API with real rate limits, unlike local models, which
// local-model-plugin-cc never needed to handle. `codex` only ever exposes
// an exit code plus a last-error-message string (see codex-run.mjs) — never
// a structured HTTP status — so classifying "was this a rate limit" is
// necessarily a string-match heuristic, not something more principled.
const RATE_LIMIT_PATTERN = /429|rate.?limit|too many requests/i;

/** @param {string|null} errorDetail */
export function isRateLimitError(errorDetail) {
  return typeof errorDetail === "string" && RATE_LIMIT_PATTERN.test(errorDetail);
}

function defaultDelay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retries `runFn` (a synchronous call to `runCodex`, matching its own
 * synchronous `spawnSync`-based contract) when its result looks
 * rate-limit-shaped, with exponential backoff. Shares the caller's own
 * `deadline` — this does not get its own separate time budget, mirroring
 * the schema-invalid retry's deadline pattern already used for review jobs
 * in local-companion.mjs, deliberately reused rather than duplicated.
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
