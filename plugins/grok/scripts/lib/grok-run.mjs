import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";

export class GrokNotFoundError extends Error {}

export function checkGrokOnPath() {
  const result = spawnSync("grok", ["version"], { encoding: "utf8" });
  if (result.error && /** @type {NodeJS.ErrnoException} */ (result.error).code === "ENOENT") {
    throw new GrokNotFoundError(
      "grok CLI not found on PATH. Install it with xAI's Grok Build CLI installer and run `grok login`, then re-run /grok:setup.",
    );
  }
  if (result.status !== 0) {
    throw new GrokNotFoundError(`grok CLI found but exited with status ${result.status}: ${result.stderr?.trim()}`);
  }
  return result.stdout.trim();
}

function parseGrokJson(stdout) {
  try {
    return { value: JSON.parse(stdout), error: null };
  } catch (err) {
    return { value: null, error: err.message };
  }
}

/**
 * Run `grok` headlessly to completion.
 *
 * Uses Grok Build's own CLI/runtime instead of routing xAI through Codex
 * provider overrides. `--output-format json` gives a single JSON object
 * containing `text`, `structuredOutput` (when --json-schema is used),
 * `sessionId`, and usage metadata.
 *
 * @param {{
 *   dir: string,
 *   prompt: string,
 *   logPath: string,
 *   timeoutMs: number,
 *   model?: string|null,
 *   maxTurns: number,
 *   sandbox: string,
 *   permissionMode?: string|null,
 *   denyRules?: string[],
 *   jsonSchema?: string|null,
 * }} opts
 */
export function runGrok({
  dir,
  prompt,
  logPath,
  timeoutMs,
  model,
  maxTurns,
  sandbox,
  permissionMode,
  denyRules = [],
  jsonSchema,
}) {
  const args = [
    "-p",
    prompt,
    "--cwd",
    dir,
    "--output-format",
    "json",
    "--max-turns",
    String(maxTurns),
    "--sandbox",
    sandbox,
    "--no-auto-update",
  ];
  if (model) args.push("-m", model);
  if (permissionMode) args.push("--permission-mode", permissionMode);
  for (const rule of denyRules) args.push("--deny", rule);
  if (jsonSchema) args.push("--json-schema", jsonSchema);

  const result = spawnSync("grok", args, {
    cwd: dir,
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 64 * 1024 * 1024,
  });

  fs.appendFileSync(logPath, `$ grok ${args.map((a) => JSON.stringify(a)).join(" ")}\n`);
  fs.appendFileSync(logPath, `${result.stdout ?? ""}\n`);
  if (result.stderr) fs.appendFileSync(logPath, `--- stderr ---\n${result.stderr}\n`);

  if (/** @type {NodeJS.ErrnoException|undefined} */ (result.error)?.code === "ENOENT") {
    throw new GrokNotFoundError("grok CLI not found on PATH.");
  }

  if (result.signal === "SIGTERM" && timeoutMs) {
    return {
      timedOut: true,
      sessionId: null,
      text: null,
      structuredOutput: null,
      exitCode: null,
      errorDetail: null,
    };
  }

  const stdout = result.stdout ?? "";
  const parsed = result.status === 0 ? parseGrokJson(stdout) : { value: null, error: null };
  const sessionId = parsed.value?.sessionId ?? null;

  if (result.status !== 0) {
    return {
      timedOut: false,
      sessionId,
      text: null,
      structuredOutput: null,
      exitCode: result.status,
      errorDetail: result.stderr?.trim() || parsed.value?.text || `exit code ${result.status}`,
    };
  }

  if (!parsed.value) {
    return {
      timedOut: false,
      sessionId: null,
      text: null,
      structuredOutput: null,
      exitCode: 1,
      errorDetail: `grok returned malformed JSON: ${parsed.error}`,
    };
  }

  return {
    timedOut: false,
    sessionId,
    text: parsed.value.text ?? null,
    structuredOutput: parsed.value.structuredOutput ?? null,
    exitCode: 0,
    errorDetail: null,
  };
}

/**
 * Spawn this same script detached (for background jobs) and return its PID
 * immediately without waiting for completion. The caller is responsible for
 * having already arranged for `--worker` mode to actually run the job.
 */
export function spawnDetachedWorker({ scriptPath, workerArgs, logPath }) {
  const logFd = fs.openSync(logPath, "a");
  const child = spawn(process.execPath, [scriptPath, ...workerArgs], {
    detached: true,
    stdio: ["ignore", logFd, logFd],
  });
  child.unref();
  fs.closeSync(logFd);
  return child.pid;
}
