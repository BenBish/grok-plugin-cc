import test from "node:test";
import assert from "node:assert/strict";
import { fakeCodexBin, isolatedEnv, runNode, runNodeExpectFailure } from "./helpers.mjs";

// setup.mjs's real `smoke-test` command makes network/process calls, but
// the fake-codex fixture lets us cover deterministic provider-failure
// diagnostics without a live xAI account. The other tests cover
// `configure`'s validation logic, `show`, and `list-models`, where the
// actual bug classes live: an unvalidated --api-key-env fed straight into
// a codex -c TOML override, and a --model id=name parser that truncated
// names containing "=".

function freshEnv() {
  return isolatedEnv({ withPluginConfig: false }).env;
}

test("list-models: returns the fixed Grok model catalog", () => {
  const env = freshEnv();
  const listed = JSON.parse(runNode("setup.mjs", ["list-models"], { env }));
  assert.deepEqual(listed.models, [{ id: "grok-4.5", name: "Grok 4.5" }]);
});

test("configure: with a valid model and api-key-env succeeds and is readable via show", () => {
  const env = freshEnv();
  runNode(
    "setup.mjs",
    ["configure", "--api-key-env", "XAI_API_KEY", "--model", "grok-4.5=Grok 4.5"],
    { env },
  );
  const shown = JSON.parse(runNode("setup.mjs", ["show"], { env }));
  assert.equal(shown.configured, true);
  assert.equal(shown.config.apiKeyEnvVar, "XAI_API_KEY");
  assert.equal(shown.config.defaultModel, "grok-4.5");
  assert.equal(shown.config.baseURL, "https://api.x.ai/v1");
});

test("smoke-test: explains the known Codex/xAI tool-schema incompatibility", () => {
  const env = {
    ...freshEnv(),
    PATH: `${fakeCodexBin()}:${process.env.PATH}`,
    FAKE_CODEX_MODE: "xai-namespace-wire-error",
  };
  runNode(
    "setup.mjs",
    ["configure", "--api-key-env", "XAI_API_KEY", "--model", "grok-4.5=Grok 4.5"],
    { env },
  );

  const { stderr } = runNodeExpectFailure("setup.mjs", ["smoke-test"], { env });
  assert.match(stderr, /Codex\/xAI Responses API tool-schema incompatibility/);
  assert.match(stderr, /type: namespace/);
  assert.match(stderr, /wire_api=chat/);
});

test("configure: missing --api-key-env is rejected", () => {
  const env = freshEnv();
  const { stderr } = runNodeExpectFailure("setup.mjs", ["configure", "--model", "m"], { env });
  assert.match(stderr, /--api-key-env/);
});

test("configure: an --api-key-env that isn't a valid env var name is rejected", () => {
  const env = freshEnv();
  const { stderr } = runNodeExpectFailure(
    "setup.mjs",
    ["configure", "--api-key-env", "not a valid name", "--model", "m"],
    { env },
  );
  assert.match(stderr, /--api-key-env/);
});

test("configure: with no models is rejected", () => {
  const env = freshEnv();
  const { stderr } = runNodeExpectFailure(
    "setup.mjs",
    ["configure", "--api-key-env", "XAI_API_KEY"],
    { env },
  );
  assert.match(stderr, /--model/);
});

test("configure: never persists the literal key, only the env var name", () => {
  const env = freshEnv();
  runNode(
    "setup.mjs",
    ["configure", "--api-key-env", "XAI_API_KEY", "--model", "grok-4.5"],
    { env },
  );
  const shown = JSON.parse(runNode("setup.mjs", ["show"], { env }));
  assert.equal(shown.config.apiKeyEnvVar, "XAI_API_KEY");
  assert.ok(!JSON.stringify(shown).match(/sk-|secret/i));
});

test("configure: a custom --base-url overrides the default", () => {
  const env = freshEnv();
  runNode(
    "setup.mjs",
    [
      "configure",
      "--api-key-env",
      "XAI_API_KEY",
      "--base-url",
      "https://my-proxy.example.com/v1",
      "--model",
      "grok-4.5",
    ],
    { env },
  );
  const shown = JSON.parse(runNode("setup.mjs", ["show"], { env }));
  assert.equal(shown.config.baseURL, "https://my-proxy.example.com/v1");
});

test("configure: a --model display name containing '=' is not truncated", () => {
  const env = freshEnv();
  runNode("setup.mjs", ["configure", "--api-key-env", "XAI_API_KEY", "--model", "m=a=b=c"], { env });
  const shown = JSON.parse(runNode("setup.mjs", ["show"], { env }));
  assert.equal(shown.config.models[0].id, "m");
  assert.equal(shown.config.models[0].name, "a=b=c");
});

test("show: reports configured:false before any configure call", () => {
  const env = freshEnv();
  const shown = JSON.parse(runNode("setup.mjs", ["show"], { env }));
  assert.equal(shown.configured, false);
});
