---
name: grok-runtime
description: How the grok-plugin-cc broker scripts work — job model, Grok Build CLI delegation, setup, review/rescue execution, and safety gates. Use when invoking or debugging local-companion.mjs / setup.mjs / status.mjs / result.mjs / cancel.mjs.
---

# grok-runtime

This plugin delegates work to Grok Build by brokering to the official
`grok` CLI in headless mode. Authentication is owned by the CLI (`grok
login`, or any auth method the CLI supports directly); this plugin stores
only the selected CLI model id.

## Job model

Every `/grok:review`, `/grok:adversarial-review`, and `/grok:rescue`
invocation creates one job under the user's XDG state dir, keyed by the
resolved git-root identity.

- `review` / `adversarial-review` are read-oriented jobs using `grok -p`
  with `--output-format json`, `--json-schema`, `--sandbox read-only`, and
  deny rules for `Write(*)` and `Edit(*)`.
- `rescue` is mutating and uses `grok -p` with `--sandbox workspace` and
  `--permission-mode bypassPermissions`, followed by this plugin's own
  diff-safety checks.
- Foreground jobs print final JSON to stdout. Background jobs print a job
  id; use `/grok:status`, `/grok:result`, and `/grok:cancel`.

## Runtime flow

1. Resolve repo root and repo identity from the current directory.
2. Load plugin config written by `/grok:setup`; default model is the first
   model discovered from `grok models`, falling back to `grok-4.5`.
3. Spawn `grok -p <prompt> --cwd <repo> --output-format json --max-turns
   <n> --no-auto-update` with mode-specific sandbox/schema flags.
4. Parse the single JSON stdout object from Grok. For reviews, prefer
   `structuredOutput`; fall back to parsing JSON from `text`.
5. Validate review output against `schemas/review-output.schema.json`.
   Invalid review output gets one fresh retry with validation errors folded
   into the prompt.
6. For rescue, snapshot repo state before the run and validate changed
   files afterward: no path/symlink escape, no `.git` internals, no binary
   or oversized files, and HEAD must not have moved.
7. Rate-limit retries are string-match based on Grok CLI error text
   (`429`, `rate limit`, `too many requests`) because the CLI exposes no
   structured HTTP status to this broker.

## Known risks

- Grok's `--sandbox read-only` did not block writes during local spike
  testing; review safety relies on explicit deny rules for write/edit tools
  plus prompt instructions. Do not remove the deny rules.
- Rescue can make real file changes and is billed against the configured
  Grok account. Keep the confirmation step in `commands/rescue.md`.
- If a job fails unexpectedly, inspect the job log path from the job record;
  it contains the exact `grok` command, stdout, and stderr.
- This plugin previously used Codex provider overrides, but that path is
  obsolete: Codex's Responses API tool schema was rejected by xAI. Do not
  reintroduce Codex unless that compatibility issue is proven fixed.
