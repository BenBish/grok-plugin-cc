#!/usr/bin/env node
// Fake `grok` binary for tests. Mirrors the headless CLI surface used by
// grok-run.mjs (`grok -p ... --cwd ... --output-format json ...`) so the
// broker can be tested without a real Grok session.

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const VALID_REVIEW = {
  verdict: "needs-attention",
  summary: "Found one issue.",
  findings: [
    {
      severity: "medium",
      title: "Example finding",
      body: "This is a fake finding for tests.",
      file: "README.md",
      line_start: 1,
      line_end: 1,
      confidence: 0.9,
      recommendation: "Fix it.",
    },
  ],
  next_steps: ["Address the finding above."],
};

function parseArgs(argv) {
  const args = { deny: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-p" || a === "--single") args.prompt = argv[++i];
    else if (a === "--cwd") args.cwd = argv[++i];
    else if (a === "--output-format") args.outputFormat = argv[++i];
    else if (a === "--max-turns") args.maxTurns = argv[++i];
    else if (a === "--sandbox") args.sandbox = argv[++i];
    else if (a === "--permission-mode") args.permissionMode = argv[++i];
    else if (a === "--json-schema") args.jsonSchema = argv[++i];
    else if (a === "--deny") args.deny.push(argv[++i]);
    else if (a === "-m" || a === "--model") args.model = argv[++i];
    else if (a === "--no-auto-update") args.noAutoUpdate = true;
    else if (!args.prompt && !a.startsWith("-")) args.prompt = a;
  }
  return args;
}

function writeJson(payload) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function readCounter(file) {
  try {
    return Number.parseInt(fs.readFileSync(file, "utf8"), 10) || 0;
  } catch {
    return 0;
  }
}

function bumpCounter(file, value) {
  fs.writeFileSync(file, String(value));
}

/**
 * @param {{text: string, structuredOutput?: unknown}} opts
 */
function successPayload({ text, structuredOutput }) {
  const payload = {
    text,
    stopReason: "EndTurn",
    sessionId: `fake_session_${Math.random().toString(36).slice(2, 10)}`,
    requestId: `fake_request_${Math.random().toString(36).slice(2, 10)}`,
    usage: {},
    num_turns: 1,
    modelUsage: { "grok-4.5": { modelCalls: 1 } },
  };
  if (structuredOutput) payload.structuredOutput = structuredOutput;
  return payload;
}

function main() {
  const argv = process.argv.slice(2);
  if (argv[0] === "version" || argv[0] === "--version" || argv[0] === "-v") {
    console.log("grok 0.0.0-test");
    process.exit(0);
  }
  if (argv[0] === "models") {
    console.log("Default model: grok-4.5\n\nAvailable models:\n  * grok-4.5 (default)");
    process.exit(0);
  }

  const args = parseArgs(argv);
  const mode = process.env.FAKE_GROK_MODE ?? "success-review";

  if (process.env.FAKE_GROK_RECORD_PATH) {
    fs.appendFileSync(process.env.FAKE_GROK_RECORD_PATH, `${JSON.stringify({ args })}\n`);
  }

  switch (mode) {
    case "smoke-ok": {
      writeJson(successPayload({ text: "{\"ok\":true}" }));
      process.exit(0);
      break;
    }
    case "success-review":
    case "success-review-with-warning": {
      writeJson(successPayload({ text: JSON.stringify(VALID_REVIEW), structuredOutput: VALID_REVIEW }));
      process.exit(0);
      break;
    }
    case "success-review-text-only": {
      writeJson(successPayload({ text: `\`\`\`json\n${JSON.stringify(VALID_REVIEW, null, 2)}\n\`\`\`` }));
      process.exit(0);
      break;
    }
    case "invalid-then-valid": {
      const isRetry = (args.prompt ?? "").includes("did not match the required schema");
      if (isRetry) {
        writeJson(successPayload({ text: JSON.stringify(VALID_REVIEW), structuredOutput: VALID_REVIEW }));
      } else {
        writeJson(successPayload({ text: JSON.stringify({ not: "valid" }), structuredOutput: { not: "valid" } }));
      }
      process.exit(0);
      break;
    }
    case "error": {
      process.stderr.write("fake provider error\n");
      process.exit(1);
      break;
    }
    case "malformed-json": {
      process.stdout.write("{not json\n");
      process.exit(0);
      break;
    }
    case "sleep": {
      // Hold the process open so spawnSync timeout handling can be tested.
      // Duration is controlled by FAKE_GROK_SLEEP_MS (default 60s).
      const sleepMs = Number(process.env.FAKE_GROK_SLEEP_MS ?? "60000");
      const ms = Number.isFinite(sleepMs) && sleepMs > 0 ? sleepMs : 60_000;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
      writeJson(successPayload({ text: "{\"ok\":true}" }));
      process.exit(0);
      break;
    }
    case "rate-limited-always": {
      process.stderr.write("429 Too Many Requests\n");
      process.exit(1);
      break;
    }
    case "rate-limited-then-success": {
      const counterFile = process.env.FAKE_GROK_COUNTER_FILE;
      const failuresBeforeSuccess = Number(process.env.FAKE_GROK_RATE_LIMIT_FAILURES ?? "1");
      const count = counterFile ? readCounter(counterFile) : 0;
      if (count < failuresBeforeSuccess) {
        if (counterFile) bumpCounter(counterFile, count + 1);
        process.stderr.write("429 Too Many Requests\n");
        process.exit(1);
      }
      writeJson(successPayload({ text: JSON.stringify(VALID_REVIEW), structuredOutput: VALID_REVIEW }));
      process.exit(0);
      break;
    }
    case "rescue-safe": {
      fs.writeFileSync(path.join(args.cwd, "rescued.txt"), "fixed by fake grok\n");
      writeJson(successPayload({ text: "Added rescued.txt." }));
      process.exit(0);
      break;
    }
    case "rescue-symlink-escape": {
      const outsideDir = fs.mkdtempSync(path.join(path.dirname(args.cwd), "escape-target-"));
      fs.writeFileSync(path.join(outsideDir, "escaped.txt"), "should not be reachable\n");
      fs.symlinkSync(outsideDir, path.join(args.cwd, "escape-link"));
      writeJson(successPayload({ text: "Edited via symlink." }));
      process.exit(0);
      break;
    }
    case "rescue-dangling-symlink-escape": {
      fs.symlinkSync("/nonexistent/outside/target", path.join(args.cwd, "dangling-escape-link"));
      writeJson(successPayload({ text: "Edited via dangling symlink." }));
      process.exit(0);
      break;
    }
    case "rescue-oversized": {
      fs.writeFileSync(path.join(args.cwd, "huge.txt"), Buffer.alloc(3 * 1024 * 1024, "x"));
      writeJson(successPayload({ text: "Wrote a large file." }));
      process.exit(0);
      break;
    }
    case "rescue-binary": {
      fs.writeFileSync(path.join(args.cwd, "binary.dat"), Buffer.from([0, 1, 2, 0, 3, 4]));
      writeJson(successPayload({ text: "Wrote a binary file." }));
      process.exit(0);
      break;
    }
    case "rescue-stale": {
      fs.writeFileSync(path.join(args.cwd, "rescued.txt"), "fixed by fake grok\n");
      execFileSync("git", ["-C", args.cwd, "commit", "-q", "--allow-empty", "-m", "concurrent commit"]);
      writeJson(successPayload({ text: "Added rescued.txt." }));
      process.exit(0);
      break;
    }
    case "rescue-many-files": {
      for (let i = 0; i < 30; i++) {
        fs.writeFileSync(path.join(args.cwd, `file-${i}.txt`), `${i}\n`);
      }
      writeJson(successPayload({ text: "Wrote many files." }));
      process.exit(0);
      break;
    }
    default:
      process.stderr.write(`fake-grok: unknown FAKE_GROK_MODE ${mode}\n`);
      process.exit(1);
  }
}

main();
