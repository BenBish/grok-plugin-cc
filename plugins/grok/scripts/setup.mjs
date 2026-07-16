#!/usr/bin/env node
// Backs /grok:setup. Non-interactive by design — the setup.md command
// prompt drives the conversation with the user and calls this script with
// concrete flags at each step, the same division of labor Claude Code
// commands generally use (the .md file is the interactive part; scripts do
// deterministic work).
//
// This setup validates Grok Build CLI access. Authentication is handled by
// `grok login` (or by environment recognized by the Grok CLI), not by
// storing an API key env var in this plugin's config.
//
//   node setup.mjs list-models
//   node setup.mjs configure [--model <id>[=<display name>]] [--default-model <id>]
//   node setup.mjs show
//   node setup.mjs smoke-test

import process from "node:process";
import { spawnSync } from "node:child_process";
import { readPluginConfig, writePluginConfig } from "./lib/plugin-config.mjs";
import { checkGrokOnPath, runGrok, GrokNotFoundError } from "./lib/grok-run.mjs";
import { jobLogPath } from "./lib/job-store.mjs";
import { DEFAULT_MODEL_ID, GROK_MODELS } from "./lib/models.mjs";

// Smoke exercises the same broker flags review/rescue use (--cwd, sandbox,
// configured model). Cold first calls can exceed 30s even when a minimal raw
// `grok -p` smoke succeeds; default is 120s, override with GROK_SMOKE_TIMEOUT_MS.
const DEFAULT_SMOKE_TIMEOUT_MS = 120_000;

/**
 * @returns {number}
 */
function smokeTimeoutMs() {
  const raw = process.env.GROK_SMOKE_TIMEOUT_MS;
  if (raw === undefined || raw === "") return DEFAULT_SMOKE_TIMEOUT_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    console.error(
      `Warning: GROK_SMOKE_TIMEOUT_MS=${JSON.stringify(raw)} is not a positive number; using default ${DEFAULT_SMOKE_TIMEOUT_MS}ms.`,
    );
    return DEFAULT_SMOKE_TIMEOUT_MS;
  }
  return parsed;
}

function displayNameForModel(id) {
  return id
    .split(/[-_]/)
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(" ");
}

function discoverGrokModels() {
  const result = spawnSync("grok", ["models"], { encoding: "utf8" });
  if (result.status !== 0) return GROK_MODELS;
  const models = [];
  for (const line of result.stdout.split("\n")) {
    const match = line.match(/^\s*\*\s+([A-Za-z0-9._-]+)/);
    if (match) models.push({ id: match[1], name: displayNameForModel(match[1]) });
  }
  return models.length > 0 ? models : GROK_MODELS;
}

function cmdListModels() {
  console.log(JSON.stringify({ models: discoverGrokModels() }, null, 2));
}

function parseConfigureArgs(argv) {
  const args = { models: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--default-model") args.defaultModel = argv[++i];
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
  const models = args.models.length > 0 ? args.models : discoverGrokModels();
  const defaultModel = args.defaultModel ?? models[0]?.id ?? DEFAULT_MODEL_ID;

  const config = {
    authMode: "grok-login",
    models,
    defaultModel,
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
    checkGrokOnPath();
  } catch (err) {
    if (err instanceof GrokNotFoundError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }

  const logPath = jobLogPath("setup-smoke-test", `smoke-${Date.now()}`);
  const timeoutMs = smokeTimeoutMs();
  // Intentionally uses broker flags (cwd, sandbox, model) rather than the
  // minimal README raw smoke — setup must verify the path real jobs take.
  const result = runGrok({
    dir: process.cwd(),
    prompt: 'Reply with exactly the JSON object {"ok":true}.',
    logPath,
    timeoutMs,
    model: config.defaultModel,
    maxTurns: 1,
    sandbox: "read-only",
  });

  if (result.timedOut) {
    console.error(
      `Smoke test timed out after ${timeoutMs}ms (hard process budget; not a malformed-JSON failure). ` +
        `A minimal raw \`grok -p\` call may still succeed if only this budget is too tight — ` +
        `raise GROK_SMOKE_TIMEOUT_MS if needed.\nFull log: ${logPath}`,
    );
    process.exit(1);
  }
  if (result.exitCode !== 0) {
    console.error(`Smoke test failed: ${result.errorDetail}\nFull log: ${logPath}`);
    process.exit(1);
  }
  try {
    const response = JSON.parse(result.text ?? "");
    if (response.ok !== true) throw new Error("missing ok:true");
  } catch {
    console.error(
      `Smoke test failed: Grok returned malformed smoke-test output (CLI finished within ${timeoutMs}ms, but response was not valid {"ok":true} JSON).\nFull log: ${logPath}`,
    );
    process.exit(1);
  }
  console.log(`Smoke test passed. Grok responded. Full log: ${logPath}`);
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
