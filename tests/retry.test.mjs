import test from "node:test";
import assert from "node:assert/strict";
import { isRateLimitError, withRateLimitRetry } from "../plugins/grok/scripts/lib/retry.mjs";

test("isRateLimitError: matches common rate-limit-shaped messages", () => {
  assert.ok(isRateLimitError("429 Too Many Requests"));
  assert.ok(isRateLimitError("rate limit exceeded"));
  assert.ok(isRateLimitError("Rate-limited, try again later"));
  assert.ok(isRateLimitError("too many requests, slow down"));
});

test("isRateLimitError: does not match unrelated errors", () => {
  assert.ok(!isRateLimitError("connection refused"));
  assert.ok(!isRateLimitError(null));
  assert.ok(!isRateLimitError(undefined));
});

test("withRateLimitRetry: succeeds without retrying when the first result is not rate-limited", async () => {
  let calls = 0;
  const result = await withRateLimitRetry(
    () => {
      calls += 1;
      return { timedOut: false, exitCode: 0, errorDetail: null };
    },
    { deadline: Date.now() + 10_000, delayFn: async () => {} },
  );
  assert.equal(calls, 1);
  assert.equal(result.exitCode, 0);
});

test("withRateLimitRetry: retries a rate-limited failure and returns the eventual success", async () => {
  let calls = 0;
  const delays = [];
  const result = await withRateLimitRetry(
    () => {
      calls += 1;
      if (calls < 3) return { timedOut: false, exitCode: 1, errorDetail: "429 rate limit" };
      return { timedOut: false, exitCode: 0, errorDetail: null };
    },
    {
      deadline: Date.now() + 10_000,
      maxAttempts: 5,
      baseDelayMs: 10,
      delayFn: async (ms) => {
        delays.push(ms);
      },
    },
  );
  assert.equal(calls, 3);
  assert.equal(result.exitCode, 0);
  assert.deepEqual(delays, [10, 20]);
});

test("withRateLimitRetry: gives up after maxAttempts and returns the last failure", async () => {
  let calls = 0;
  const result = await withRateLimitRetry(
    () => {
      calls += 1;
      return { timedOut: false, exitCode: 1, errorDetail: "429 rate limit" };
    },
    { deadline: Date.now() + 10_000, maxAttempts: 3, baseDelayMs: 1, delayFn: async () => {} },
  );
  assert.equal(calls, 3);
  assert.equal(result.exitCode, 1);
});

test("withRateLimitRetry: does not retry a non-rate-limit failure", async () => {
  let calls = 0;
  const result = await withRateLimitRetry(
    () => {
      calls += 1;
      return { timedOut: false, exitCode: 1, errorDetail: "some other provider error" };
    },
    { deadline: Date.now() + 10_000, delayFn: async () => {} },
  );
  assert.equal(calls, 1);
  assert.equal(result.exitCode, 1);
});

test("withRateLimitRetry: does not retry a timeout", async () => {
  let calls = 0;
  const result = await withRateLimitRetry(
    () => {
      calls += 1;
      return { timedOut: true, exitCode: null, errorDetail: null };
    },
    { deadline: Date.now() + 10_000, delayFn: async () => {} },
  );
  assert.equal(calls, 1);
  assert.equal(result.timedOut, true);
});

test("withRateLimitRetry: stops retrying once the shared deadline has passed", async () => {
  let calls = 0;
  const result = await withRateLimitRetry(
    () => {
      calls += 1;
      return { timedOut: false, exitCode: 1, errorDetail: "429 rate limit" };
    },
    { deadline: Date.now() - 1, maxAttempts: 5, baseDelayMs: 1, delayFn: async () => {} },
  );
  assert.equal(calls, 1);
  assert.equal(result.exitCode, 1);
});
