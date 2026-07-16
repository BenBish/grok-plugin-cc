import test from "node:test";
import assert from "node:assert/strict";
import { fakeGrokBin, isolatedEnv, runNode, runNodeExpectFailure } from "./helpers.mjs";

// setup.mjs's real `smoke-test` command makes network/process calls, but
// the fake-grok fixture lets us cover deterministic CLI diagnostics
// without a live Grok session.

function freshEnv() {
  return isolatedEnv({ withPluginConfig: false }).env;
}

test("list-models: returns the fixed Grok model catalog", () => {
  const env = freshEnv();
  const listed = JSON.parse(runNode("setup.mjs", ["list-models"], { env }));
  assert.deepEqual(listed.models, [{ id: "grok-4.5", name: "Grok 4.5" }]);
});

test("configure: with defaults succeeds and is readable via show", () => {
  const env = freshEnv();
  runNode("setup.mjs", ["configure"], { env });
  const shown = JSON.parse(runNode("setup.mjs", ["show"], { env }));
  assert.equal(shown.configured, true);
  assert.equal(shown.config.authMode, "grok-login");
  assert.equal(shown.config.defaultModel, "grok-4.5");
  assert.deepEqual(shown.config.models, [{ id: "grok-4.5", name: "Grok 4.5" }]);
});

test("smoke-test: succeeds through fake grok", () => {
  const env = {
    ...freshEnv(),
    PATH: `${fakeGrokBin()}:${process.env.PATH}`,
    FAKE_GROK_MODE: "smoke-ok",
  };
  runNode("setup.mjs", ["configure"], { env });

  const stdout = runNode("setup.mjs", ["smoke-test"], { env });
  assert.match(stdout, /Smoke test passed/);
});

test("smoke-test: malformed grok output is rejected", () => {
  const env = freshEnv();
  const envWithFake = {
    ...env,
    PATH: `${fakeGrokBin()}:${process.env.PATH}`,
    FAKE_GROK_MODE: "malformed-json",
  };
  runNode("setup.mjs", ["configure"], { env: envWithFake });

  const { stderr } = runNodeExpectFailure("setup.mjs", ["smoke-test"], { env: envWithFake });
  assert.match(stderr, /malformed JSON/);
  assert.doesNotMatch(stderr, /timed out after/);
});

test("smoke-test: hard timeout is reported distinctly from malformed JSON", () => {
  const env = {
    ...freshEnv(),
    PATH: `${fakeGrokBin()}:${process.env.PATH}`,
    FAKE_GROK_MODE: "sleep",
    FAKE_GROK_SLEEP_MS: "5000",
    GROK_SMOKE_TIMEOUT_MS: "200",
  };
  runNode("setup.mjs", ["configure"], { env });

  const { stderr } = runNodeExpectFailure("setup.mjs", ["smoke-test"], { env });
  assert.match(stderr, /timed out after 200ms/);
  assert.match(stderr, /hard process budget/);
  assert.match(stderr, /GROK_SMOKE_TIMEOUT_MS/);
  assert.doesNotMatch(stderr, /malformed smoke-test output/);
});

test("configure: a --model display name containing '=' is not truncated", () => {
  const env = freshEnv();
  runNode("setup.mjs", ["configure", "--model", "m=a=b=c"], { env });
  const shown = JSON.parse(runNode("setup.mjs", ["show"], { env }));
  assert.equal(shown.config.models[0].id, "m");
  assert.equal(shown.config.models[0].name, "a=b=c");
});

test("show: reports configured:false before any configure call", () => {
  const env = freshEnv();
  const shown = JSON.parse(runNode("setup.mjs", ["show"], { env }));
  assert.equal(shown.configured, false);
});
