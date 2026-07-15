import test from "node:test";
import assert from "node:assert/strict";
import { buildProviderArgs, PROVIDER_ID, DEFAULT_BASE_URL } from "../plugins/grok/scripts/lib/codex-config.mjs";

test("buildProviderArgs: builds -c model_providers.* overrides with Codex's required responses wire API", () => {
  const args = buildProviderArgs({
    apiKeyEnvVar: "XAI_API_KEY",
    defaultModel: "grok-4.5",
  });
  assert.ok(args.includes(`model_providers.${PROVIDER_ID}.base_url=${DEFAULT_BASE_URL}`));
  assert.ok(args.includes(`model_providers.${PROVIDER_ID}.wire_api=responses`));
  assert.ok(args.includes(`model_provider=${PROVIDER_ID}`));
  assert.ok(args.includes("grok-4.5"));
  assert.ok(!args.some((a) => a.includes("wire_api=chat")));
});

test("buildProviderArgs: defaults baseURL to xAI's API when not provided", () => {
  const args = buildProviderArgs({ apiKeyEnvVar: "XAI_API_KEY", defaultModel: "grok-4.5" });
  assert.ok(args.includes(`model_providers.${PROVIDER_ID}.base_url=${DEFAULT_BASE_URL}`));
});

test("buildProviderArgs: baseURL is overridable (e.g. a proxy or regional endpoint)", () => {
  const args = buildProviderArgs({
    baseURL: "https://my-proxy.example.com/v1",
    apiKeyEnvVar: "XAI_API_KEY",
    defaultModel: "grok-4.5",
  });
  assert.ok(args.includes(`model_providers.${PROVIDER_ID}.base_url=https://my-proxy.example.com/v1`));
});

test("buildProviderArgs: always references the env var name, never a literal secret", () => {
  const args = buildProviderArgs({ apiKeyEnvVar: "XAI_API_KEY", defaultModel: "grok-4.5" });
  assert.ok(args.includes(`model_providers.${PROVIDER_ID}.env_key=XAI_API_KEY`));
  assert.ok(!args.some((a) => /sk-|secret|token/i.test(a)));
});

test("buildProviderArgs: always includes --ignore-user-config so the user's personal codex config is never touched", () => {
  const args = buildProviderArgs({ apiKeyEnvVar: "XAI_API_KEY", defaultModel: "grok-4.5" });
  assert.equal(args[0], "--ignore-user-config");
});

test("buildProviderArgs: provider id is always the reserved-name-safe grok-xai, not user-chosen", () => {
  const args = buildProviderArgs({ apiKeyEnvVar: "XAI_API_KEY", defaultModel: "grok-4.5" });
  assert.equal(PROVIDER_ID, "grok-xai");
  assert.ok(args.some((a) => a.startsWith(`model_providers.${PROVIDER_ID}.`)));
});
