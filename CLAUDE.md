# CLAUDE.md

## Project

**Name**: grok-plugin-cc
**Description**: Claude Code plugin that delegates `/grok:review`, `/grok:adversarial-review`, and `/grok:rescue` to Grok 4.5 via xAI's Grok Build CLI (`grok`), by brokering directly to that CLI in headless mode (`grok -p ... --output-format json`, no config file) — the same broker architecture [`local-model-plugin-cc`](https://github.com/BenBish/local-model-plugin-cc) uses for local models, just pointed at a hosted CLI instead of a local runtime. Authentication is owned by the `grok` CLI (`grok login`, or any auth method it supports directly); this plugin stores only the selected CLI model id, written by `/grok:setup` (see `scripts/lib/plugin-config.mjs`).

## Stack

- **Language/Runtime**: Node.js >=20, plain `.mjs` (no build step — shipped scripts must run as-is since Claude Code installs the plugin directly from this git repo)
- **Framework**: none — Claude Code plugin manifest conventions (`.claude-plugin/`, `commands/*.md`, `agents/*.md`)
- **Database**: none — the job ledger is flat JSON files under the user's XDG state dir, never inside a target repo. No config file is generated for the `grok` CLI either — model selection is passed as a CLI flag on every invocation.
- **Package manager**: npm for `devDependencies` (TypeScript, used only for `tsc --noEmit` type-checking of the `.mjs` sources via JSDoc). Nothing shipped in `plugins/grok/` may assume bun is installed on an end user's machine, even though the starter template this repo was scaffolded from defaults to bun.

## Commands

Run from project root:

```bash
npm install       # install devDependencies (typescript, @types/node)
npm test          # run tests (node --test tests/*.test.mjs)
npm run lint      # type-check the .mjs sources (tsc --noEmit, checkJs)
```

## Repository Layout

```
.claude-plugin/marketplace.json          # marketplace manifest
plugins/grok/
  .claude-plugin/plugin.json             # plugin manifest
  commands/                              # /grok:* slash commands
  agents/grok-rescue.md                  # thin Bash-only forwarder subagent
  scripts/                               # broker: spawns `grok -p`, job ledger, rate-limit retry
    lib/
  schemas/review-output.schema.json      # findings JSON schema
  skills/grok-runtime/                   # skill documenting the broker contract and open risks
tests/                                   # node --test suite incl. fake-grok CLI fixture (fake-grok.mjs)
```

## Known open risks (see plugins/grok/skills/grok-runtime/SKILL.md for detail)

- `--sandbox read-only` did not block writes during local spike testing of the `grok` CLI; review safety relies on explicit deny rules for write/edit tools plus prompt instructions, not the sandbox flag alone.
- The rate-limit retry heuristic (`scripts/lib/retry.mjs`) is a string match on the `grok` CLI's error text, not a structured HTTP status code.
- This plugin previously tried routing Grok through Codex provider overrides; that path is abandoned (xAI rejected Codex's Responses API tool schema) and should not be reintroduced without proof that's fixed.

## Conventions

### Branches
`feature/<issue-number>-brief-slug` from `main`

### Commits
Conventional Commits: `feat(scope): description`, `fix(scope): description`, `docs: description`, `chore: description`

### PRs
- Reference the issue with `Resolves #N`
- One squashed semantic commit per PR

## Do Not Commit

- `.env`, `.env.local`, any secrets or credentials
- `.claude/settings.local.json`
- Build artefacts (`dist/`, `build/`, `.next/`, `node_modules/`)
