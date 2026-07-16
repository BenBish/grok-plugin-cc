# grok-plugin-cc

A Claude Code plugin that delegates code review and rescue work to **Grok
Build** through xAI's official `grok` CLI instead of a local model. It's the
hosted-frontier-model counterpart to
[`local-model-plugin-cc`](https://github.com/BenBish/local-model-plugin-cc):
the job store, diff-safety checks, schema validation, and command shape are
similar, but the runtime harness is Grok Build headless mode
(`grok -p ... --output-format json`).

**Cost and rate limits, unlike a local model:** every `/grok:review`,
`/grok:adversarial-review`, and `/grok:rescue` run is billed against your
xAI account — there's no free local inference here. `/grok:rescue`
specifically asks for confirmation before running, since it can take up to
15 minutes of billed agentic work. See
[xAI's pricing page](https://docs.x.ai/docs/pricing) for current rates; this
repo doesn't hardcode numbers that will drift. Rate-limit (429) errors are
retried with capped exponential backoff (`lib/retry.mjs`) — a heuristic
string match on the Grok CLI error text.

## Commands

- `/grok:setup` — configure the Grok Build CLI model and smoke-test the
  local `grok login`/CLI path.
- `/grok:review` — review uncommitted changes (or `--base <ref>`) via plain
  `grok` headless mode with structured, file-grounded findings.
- `/grok:adversarial-review` — same target selection, steered toward
  challenging design assumptions and failure modes.
- `/grok:rescue` — delegate a coding task via `grok` headless mode, with a
  post-hoc diff-safety check as a second gate. Asks for confirmation first
  — this is a billed, up-to-15-minute run.
- `/grok:status`, `/grok:result`, `/grok:cancel` — manage background jobs.

## Requirements

- Node.js >=20
- The [Grok Build CLI](https://docs.x.ai/build/overview) on `PATH`
- A working `grok login` session, or another auth method supported directly
  by the Grok CLI

## Verify before relying on this

Before using the plugin for real work, run a raw smoke test by hand:

```bash
grok -p 'Reply with exactly the JSON object {"ok":true}.' \
  --output-format json \
  --max-turns 1 \
  --no-auto-update
```

`/grok:setup` smoke-tests a slightly fuller broker path (adds `--cwd`,
`--sandbox read-only`, and the configured `-m`) so setup validates what
review/rescue actually spawn. Default smoke budget is 120s; raise it with
`GROK_SMOKE_TIMEOUT_MS` if cold starts time out. Setup stores only the
selected CLI model id. It does not store API keys.

## What's here

- `.claude-plugin/marketplace.json`, `plugins/grok/` — the Claude Code
  plugin itself (manifest, commands, rescue subagent, broker scripts,
  findings schema).
- `tests/` — `node --test` suite, including a fake `grok` binary fixture
  so CI never needs a live xAI account.
- `CLAUDE.md` / `AGENTS.md` — project spec consumed by coding agents.
- `.agents/skills/` — portable Agent Skills for *contributing to this repo*
  (issue, work, mr, merge, test, manual, create-skill, etc.), unrelated to
  the plugin's own runtime; symlinked at `.claude/skills/` for Claude Code.
- `.codex/config.toml` — Codex project config, including Linear MCP.
- `.mcp.json` — generic MCP server config for clients that still read it.
- `.github/` — CI/workflow configuration.

## Relationship to local-model-plugin-cc

This repo started as a copy of
[`local-model-plugin-cc`](https://github.com/BenBish/local-model-plugin-cc),
with the local/hosted split collapsed to a single always-hosted mode and
Grok-specific setup, rate-limit handling, and docs layered on top. The job
store, diff-safety checks, schema validation, and test harness (including
the fake `grok` binary fixture) are reused essentially unchanged — none of
that logic is specific to local models. See
`plugins/grok/skills/grok-runtime/SKILL.md` for the parts that changed and
why.

## Historical note

This plugin originally tried to run Grok through Codex custom provider
overrides. That path is intentionally gone: Codex 0.142.0 requires
`wire_api=responses`, and xAI rejected Codex's agent tool declaration
(`type: namespace`) at `/v1/responses`. The current harness uses the
official Grok Build CLI instead.

## Conventions

- **Branches**: `feature/<issue-number>-brief-slug` from `main`
- **Commits**: [Conventional Commits](https://www.conventionalcommits.org/)
  (`feat(scope): description`, `fix(scope): description`, etc.)
- **PRs**: reference the issue with `Resolves #N`; one squashed semantic
  commit per PR

See `CLAUDE.md` for the full set of project instructions used by coding
agents working in this repo.
