import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  initGitRepo,
  isolatedEnv,
  fakeGrokBin,
  runNode,
  runNodeExpectFailure,
  mkTmpDir,
} from "./helpers.mjs";

/**
 * @param {string} mode
 * @returns {NodeJS.ProcessEnv}
 */
function envWithFakeGrok(mode) {
  const { env } = isolatedEnv();
  const binDir = fakeGrokBin();
  return {
    ...env,
    PATH: `${binDir}${path.delimiter}${env.PATH}`,
    FAKE_GROK_MODE: mode,
  };
}

test("review: valid model output is returned as the job result", () => {
  const repo = initGitRepo();
  const env = envWithFakeGrok("success-review");
  const stdout = runNode("local-companion.mjs", ["review"], { cwd: repo, env });
  const result = JSON.parse(stdout);
  assert.equal(result.verdict, "needs-attention");
  assert.equal(result.findings.length, 1);
});

test("review: JSON in text is accepted when structuredOutput is absent", () => {
  const repo = initGitRepo();
  const env = envWithFakeGrok("success-review-text-only");
  const stdout = runNode("local-companion.mjs", ["review"], { cwd: repo, env });
  const result = JSON.parse(stdout);
  assert.equal(result.verdict, "needs-attention");
});

test("review: invalid output triggers exactly one retry and then succeeds", () => {
  const repo = initGitRepo();
  const env = envWithFakeGrok("invalid-then-valid");
  const stdout = runNode("local-companion.mjs", ["review"], { cwd: repo, env });
  const result = JSON.parse(stdout);
  assert.equal(result.verdict, "needs-attention");
});

test("review: a provider error (nonzero exit) is surfaced, not silently swallowed", () => {
  const repo = initGitRepo();
  const env = envWithFakeGrok("error");
  const { stdout } = runNodeExpectFailure("local-companion.mjs", ["review"], { cwd: repo, env });
  const result = JSON.parse(stdout);
  assert.match(result.error, /fake provider error/);
});

test("review: uses headless grok with schema output and denied write tools", () => {
  const repo = initGitRepo();
  const env = envWithFakeGrok("success-review");
  const recordPath = path.join(mkTmpDir("record-"), "record.jsonl");
  env.FAKE_GROK_RECORD_PATH = recordPath;
  runNode("local-companion.mjs", ["review"], { cwd: repo, env });
  const lines = fs.readFileSync(recordPath, "utf8").trim().split("\n");
  const invocation = JSON.parse(lines[0]);
  assert.equal(invocation.args.cwd, repo);
  assert.equal(invocation.args.sandbox, "read-only");
  assert.equal(invocation.args.permissionMode, "bypassPermissions");
  assert.deepEqual(invocation.args.deny, ["Write(*)", "Edit(*)"]);
  assert.equal(invocation.args.maxTurns, "12");
  assert.ok(invocation.args.jsonSchema);
  assert.match(invocation.args.prompt, /git status/);
});

test("adversarial review: uses the shared turn allowance on initial and schema-retry attempts", () => {
  const repo = initGitRepo();
  const env = envWithFakeGrok("invalid-then-valid");
  const recordPath = path.join(mkTmpDir("record-"), "record.jsonl");
  env.FAKE_GROK_RECORD_PATH = recordPath;
  runNode("local-companion.mjs", ["adversarial-review", "--focus", "concurrency"], { cwd: repo, env });
  const invocations = fs
    .readFileSync(recordPath, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.equal(invocations.length, 2);
  assert.ok(invocations.every((invocation) => invocation.args.maxTurns === "12"));
});

test("review: --base <ref> is described in the prompt", () => {
  const repo = initGitRepo();
  const env = envWithFakeGrok("success-review");
  const recordPath = path.join(mkTmpDir("record-"), "record.jsonl");
  env.FAKE_GROK_RECORD_PATH = recordPath;
  runNode("local-companion.mjs", ["review", "--base", "main"], { cwd: repo, env });
  const invocation = JSON.parse(fs.readFileSync(recordPath, "utf8").trim().split("\n")[0]);
  assert.match(invocation.args.prompt, /git diff main/);
});

test("review: a rate-limited failure is retried and succeeds without surfacing an error", () => {
  const repo = initGitRepo();
  const env = envWithFakeGrok("rate-limited-then-success");
  env.FAKE_GROK_COUNTER_FILE = path.join(mkTmpDir("rate-limit-counter-"), "counter");
  env.FAKE_GROK_RATE_LIMIT_FAILURES = "1";
  env.GROK_RETRY_BASE_DELAY_MS = "1";
  const stdout = runNode("local-companion.mjs", ["review"], { cwd: repo, env });
  const result = JSON.parse(stdout);
  assert.equal(result.verdict, "needs-attention");
});

test("review: a rate limit that never clears is eventually surfaced as an error", () => {
  const repo = initGitRepo();
  const env = envWithFakeGrok("rate-limited-always");
  env.GROK_RETRY_BASE_DELAY_MS = "1";
  const { stdout } = runNodeExpectFailure("local-companion.mjs", ["review"], { cwd: repo, env });
  const result = JSON.parse(stdout);
  assert.match(result.error, /429|rate limit/i);
});

test("rescue: a clean edit is reported with the changed file list", () => {
  const repo = initGitRepo();
  const env = envWithFakeGrok("rescue-safe");
  const stdout = runNode("local-companion.mjs", ["rescue", "--", "fix", "the", "thing"], { cwd: repo, env });
  const result = JSON.parse(stdout);
  assert.deepEqual(result.changed_files, ["rescued.txt"]);
});

test("rescue: uses headless grok under a workspace sandbox", () => {
  const repo = initGitRepo();
  const env = envWithFakeGrok("rescue-safe");
  const recordPath = path.join(mkTmpDir("record-"), "record.jsonl");
  env.FAKE_GROK_RECORD_PATH = recordPath;
  runNode("local-companion.mjs", ["rescue", "--", "fix", "it"], { cwd: repo, env });
  const invocation = JSON.parse(fs.readFileSync(recordPath, "utf8").trim().split("\n")[0]);
  assert.equal(invocation.args.sandbox, "workspace");
  assert.equal(invocation.args.permissionMode, "bypassPermissions");
  assert.equal(invocation.args.cwd, repo);
  assert.equal(invocation.args.maxTurns, "12");
});

test("rescue: no task text is rejected before invoking grok", () => {
  const repo = initGitRepo();
  const env = envWithFakeGrok("rescue-safe");
  const { stdout } = runNodeExpectFailure("local-companion.mjs", ["rescue", "--"], { cwd: repo, env });
  const result = JSON.parse(stdout);
  assert.match(result.error, /no task text/);
});
