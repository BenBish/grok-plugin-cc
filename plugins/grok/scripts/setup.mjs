#!/usr/bin/env node
// Backs /grok:setup. Non-interactive by design — the setup.md command
// prompt drives the conversation with the user and calls this script with
// concrete flags at each step, the same division of labor Claude Code
// commands generally use (the .md file is the interactive part; scripts do
// deterministic work).
//
// Unlike local-model-plugin-cc, there is no `detect` step: Grok 4.5 is a
// hosted API, not a local server — there's nothing to discover on a
// loopback port. Configuration always requires an API key env var name and
// always picks a model from a small fixed catalog (see models.mjs).
//
//   node setup.mjs list-models
//   node setup.mjs configure --api-key-env <VAR> [--base-url <url>] \
//     --model <id>[=<display name>] [--model <id2>...] [--default-model <id>]
//   node setup.mjs show
//   node setup.mjs smoke-test

import process from "node:process";
import { readPluginConfig, writePluginConfig } from "./lib/plugin-config.mjs";
import { buildProviderArgs, DEFAULT_BASE_URL } from "./lib/codex-config.mjs";
import { checkCodexOnPath, runCodex, CodexNotFoundError } from "./lib/codex-run.mjs";
import { jobLogPath } from "./lib/job-store.mjs";
import { GROK_MODELS } from "./lib/models.mjs";

// apiKeyEnvVar is interpolated directly into a codex `-c
// model_providers.<id>.env_key=<value>` TOML override (see
// codex-config.mjs) — not passed through a shell, so this isn't a
// shell-injection concern, but an unvalidated name containing "=" would
// break codex's own key=value parsing of the -c flag. Rejecting anything
// but a safe identifier here, before it's ever persisted, turns that into a
// clear error at configure time instead of a confusing codex failure later.
const SAFE_ENV_VAR_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

function cmdListModels() {
  console.log(JSON.stringify({ models: GROK_MODELS }, null, 2));
}

function parseConfigureArgs(argv) {
  const args = { models: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--api-key-env") args.apiKeyEnvVar = argv[++i];
    else if (arg === "--base-url") args.baseURL = argv[++i];
    else if (arg === "--default-model") args.defaultModel = argv[++i];
    else if (arg === "--model") {
      // Split on the first "=" only — String.split("=") would silently
      // truncate a display name that itself contains "=".
      const raw = argv[++i];
      const eqIdx = raw.indexOf("=");
      const id = eqIdx === -1 ? raw : raw.slice(0, eqIdx);
      const name = eqIdx === -1 ? id : raw.slice(eqIdx + 1);
      args.models.push({ id, name });
    }
  }
  return args;
}

function cmdConfigure(argv) {
  const args = parseConfigureArgs(argv);
  if (!args.apiKeyEnvVar) {
    console.error(
      "--api-key-env is required (the name of an env var holding your xAI API key, e.g. XAI_API_KEY — never pass the literal key).",
    );
    process.exit(1);
  }
  if (!SAFE_ENV_VAR_NAME.test(args.apiKeyEnvVar)) {
    console.error(
      `--api-key-env must be a valid environment variable name (${SAFE_ENV_VAR_NAME}): got ${JSON.stringify(args.apiKeyEnvVar)}`,
    );
    process.exit(1);
  }
  if (args.models.length === 0) {
    console.error("At least one --model <id> is required (see `node setup.mjs list-models`).");
    process.exit(1);
  }

  const config = {
    baseURL: args.baseURL || DEFAULT_BASE_URL,
    apiKeyEnvVar: args.apiKeyEnvVar,
    models: args.models,
    defaultModel: args.defaultModel ?? args.models[0].id,
    configuredAt: new Date().toISOString(),
  };
  writePluginConfig(config);
  console.log(JSON.stringify({ config }, null, 2));
}

function cmdShow() {
  const config = readPluginConfig();
  if (!config) {
    console.log(JSON.stringify({ configured: false }));
    return;
  }
  console.log(JSON.stringify({ configured: true, config }, null, 2));
}

async function cmdSmokeTest() {
  const config = readPluginConfig();
  if (!config) {
    console.error("No configuration found. Run `configure` first.");
    process.exit(1);
  }
  try {
    checkCodexOnPath();
  } catch (err) {
    if (err instanceof CodexNotFoundError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }

  const logPath = jobLogPath("setup-smoke-test", `smoke-${Date.now()}`);
  const result = runCodex({
    dir: process.cwd(),
    providerArgs: buildProviderArgs(config),
    sandboxArgs: ["-c", "sandbox_mode=read-only"],
    prompt: "Reply with exactly the single word: ok",
    logPath,
    timeoutMs: 30_000,
  });

  if (result.timedOut) {
    console.error(`Smoke test timed out. Full log: ${logPath}`);
    process.exit(1);
  }
  if (result.exitCode !== 0) {
    console.error(`Smoke test failed: ${result.errorDetail}\nFull log: ${logPath}`);
    process.exit(1);
  }
  console.log(`Smoke test passed. Model responded. Full log: ${logPath}`);
}

async function main() {
  const [, , command, ...rest] = process.argv;
  switch (command) {
    case "list-models":
      return cmdListModels();
    case "configure":
      return cmdConfigure(rest);
    case "show":
      return cmdShow();
    case "smoke-test":
      return cmdSmokeTest();
    default:
      console.error("Usage: setup.mjs <list-models|configure|show|smoke-test>");
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err.stack ?? String(err));
  process.exit(1);
});
