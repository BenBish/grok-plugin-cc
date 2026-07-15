import test from "node:test";
import assert from "node:assert/strict";
import { initGitRepo, isolatedEnv, fakeGrokBin, runNodeExpectFailure } from "./helpers.mjs";
import path from "node:path";

function envWithFakeGrok(mode) {
  const { env } = isolatedEnv();
  const binDir = fakeGrokBin();
  return {
    ...env,
    PATH: `${binDir}${path.delimiter}${env.PATH}`,
    FAKE_GROK_MODE: mode,
  };
}

test("rescue: a symlink-escape edit is rejected, not reported as applied", () => {
  const repo = initGitRepo();
  const env = envWithFakeGrok("rescue-symlink-escape");
  const { stdout } = runNodeExpectFailure("local-companion.mjs", ["rescue", "--", "do", "it"], {
    cwd: repo,
    env,
  });
  const result = JSON.parse(stdout);
  assert.equal(result.code, "SYMLINK_ESCAPE");
});

test("rescue: a dangling symlink-escape edit is rejected, not reported as applied", () => {
  const repo = initGitRepo();
  const env = envWithFakeGrok("rescue-dangling-symlink-escape");
  const { stdout } = runNodeExpectFailure("local-companion.mjs", ["rescue", "--", "do", "it"], {
    cwd: repo,
    env,
  });
  const result = JSON.parse(stdout);
  assert.equal(result.code, "SYMLINK_ESCAPE");
});

test("rescue: an oversized file edit is rejected", () => {
  const repo = initGitRepo();
  const env = envWithFakeGrok("rescue-oversized");
  const { stdout } = runNodeExpectFailure("local-companion.mjs", ["rescue", "--", "do", "it"], {
    cwd: repo,
    env,
  });
  const result = JSON.parse(stdout);
  assert.equal(result.code, "OVERSIZED_FILE");
});

test("rescue: a binary file edit is rejected", () => {
  const repo = initGitRepo();
  const env = envWithFakeGrok("rescue-binary");
  const { stdout } = runNodeExpectFailure("local-companion.mjs", ["rescue", "--", "do", "it"], {
    cwd: repo,
    env,
  });
  const result = JSON.parse(stdout);
  assert.equal(result.code, "BINARY_FILE");
});

test("rescue: a concurrent commit during the run is treated as stale and rejected", () => {
  const repo = initGitRepo();
  const env = envWithFakeGrok("rescue-stale");
  const { stdout } = runNodeExpectFailure("local-companion.mjs", ["rescue", "--", "do", "it"], {
    cwd: repo,
    env,
  });
  const result = JSON.parse(stdout);
  assert.equal(result.code, "STALE_HEAD");
});

test("rescue: too many changed files is rejected even if each file is individually safe", () => {
  const repo = initGitRepo();
  const env = envWithFakeGrok("rescue-many-files");
  const { stdout } = runNodeExpectFailure("local-companion.mjs", ["rescue", "--", "do", "it"], {
    cwd: repo,
    env,
  });
  const result = JSON.parse(stdout);
  assert.match(result.error, /too many files changed/);
});
