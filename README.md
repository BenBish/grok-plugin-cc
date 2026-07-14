# grok-plugin-cc

A Claude Code plugin that delegates code review and rescue work to **Grok
4.5** (via [xAI's API](https://docs.x.ai/)) instead of a local model. It's
the hosted-frontier-model counterpart to
[`local-model-plugin-cc`](https://github.com/BenBish/local-model-plugin-cc),
which does the same for local models (Ollama, LM Studio, custom
OpenAI-compatible endpoints), and shares that repo's architecture *and its
underlying CLI*: a thin broker over OpenAI's own
[`codex`](https://developers.openai.com/codex/cli) CLI, pointed at xAI's
hosted, OpenAI-compatible endpoint via ephemeral `-c model_providers.*` CLI
overrides instead of a local model server. No separate agent runtime, no
generated config file — codex's own sandboxing (`-c sandbox_mode=read-only`
/ `-s workspace-write`) and tool-calling loop do the work, exactly as in
`local-model-plugin-cc`, which is itself the local-model counterpart to
[`openai/codex-plugin-cc`](https://github.com/openai/codex-plugin-cc).

**Cost and rate limits, unlike a local model:** every `/grok:review`,
`/grok:adversarial-review`, and `/grok:rescue` run is billed against your
xAI account — there's no free local inference here. `/grok:rescue`
specifically asks for confirmation before running, since it can take up to
15 minutes of billed agentic work. See
[xAI's pricing page](https://docs.x.ai/docs/pricing) for current rates; this
repo doesn't hardcode numbers that will drift. Rate-limit (429) errors are
retried with capped exponential backoff (`lib/retry.mjs`) — a heuristic
string match, since `codex` exposes no structured HTTP status.

**Known open risk:** the `wire_api=responses` override this plugin passes
to `codex` was only verified end-to-end against Ollama/LM Studio in
`local-model-plugin-cc`; xAI's public API is documented as
Chat-Completions-shaped, not the newer Responses API shape. This has not
yet been confirmed against a real xAI account — see "Verify before relying
on this" below, and
`plugins/grok/skills/grok-runtime/SKILL.md` for the full writeup.

## Commands

- `/grok:setup` — configure Grok 4.5: pick a model from a small fixed
  catalog (or supply a custom id), the name of an env var holding your xAI
  API key, an optional base URL override, and smoke-test the result.
- `/grok:review` — review uncommitted changes (or `--base <ref>`) via plain
  `codex exec` under a read-only sandbox. Structured, file-grounded
  findings.
- `/grok:adversarial-review` — same target selection, steered toward
  challenging design assumptions and failure modes.
- `/grok:rescue` — delegate a coding task via `codex exec` under a
  workspace-write sandbox, with a post-hoc diff-safety check as a second
  gate. Asks for confirmation first — this is a billed, up-to-15-minute run.
- `/grok:status`, `/grok:result`, `/grok:cancel` — manage background jobs.

## Requirements

- Node.js >=20
- The [`codex`](https://developers.openai.com/codex/cli) CLI on `PATH` (a
  required peer dependency)
- An [xAI](https://x.ai/) API key with access to Grok 4.5, in an environment
  variable of your choosing (never written to disk by this plugin — only
  the variable *name* is stored)

## Verify before relying on this

Before using the plugin for real work, run a raw smoke test by hand with a
real `XAI_API_KEY` (this is exactly what `/grok:setup`'s smoke-test step
automates, but worth understanding once directly):

```bash
XAI_API_KEY=... codex exec \
  -c model_providers.grok-xai.base_url=https://api.x.ai/v1 \
  -c model_providers.grok-xai.wire_api=responses \
  -c model_providers.grok-xai.env_key=XAI_API_KEY \
  -c model_provider=grok-xai \
  -m <model-id> --ignore-user-config \
  "reply with exactly: ok"
```

If this fails in a way that looks wire-format-related (garbled/empty output
despite exit code 0, or a rejected `wire_api` value), don't assume the
plugin's code is at fault — see
`plugins/grok/skills/grok-runtime/SKILL.md`'s "Known open risks" section.

Also verify the model-id strings in `plugins/grok/scripts/lib/models.mjs`
against [xAI's model docs](https://docs.x.ai/docs/models) — they were not
confirmed against a live API at the time this plugin was written.

## What's here

- `.claude-plugin/marketplace.json`, `plugins/grok/` — the Claude Code
  plugin itself (manifest, commands, rescue subagent, broker scripts,
  findings schema).
- `tests/` — `node --test` suite, including a fake `codex` binary fixture
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
the fake `codex` binary fixture) are reused essentially unchanged — none of
that logic is specific to local models. See
`plugins/grok/skills/grok-runtime/SKILL.md` for the parts that changed and
why.

## Conventions

- **Branches**: `feature/<issue-number>-brief-slug` from `main`
- **Commits**: [Conventional Commits](https://www.conventionalcommits.org/)
  (`feat(scope): description`, `fix(scope): description`, etc.)
- **PRs**: reference the issue with `Resolves #N`; one squashed semantic
  commit per PR

See `CLAUDE.md` for the full set of project instructions used by coding
agents working in this repo.
