# CLAUDE.md

## Project

**Name**: grok-plugin-cc
**Description**: Claude Code plugin that delegates `/grok:review`, `/grok:adversarial-review`, and `/grok:rescue` to Grok 4.5 via xAI's hosted API, by brokering to the `codex` CLI via ephemeral `-c model_providers.*` overrides (no config file) — the same CLI `openai/codex-plugin-cc` itself wraps and the same broker architecture [`local-model-plugin-cc`](https://github.com/BenBish/local-model-plugin-cc) uses for local models, just pointed at a hosted provider instead of reimplementing an agent runtime. Unlike that repo's oss/custom split, there is only one mode here: Grok 4.5 always requires a real API key (env var name only, never a literal secret — see `scripts/lib/codex-config.mjs`).

## Stack

- **Language/Runtime**: Node.js >=20, plain `.mjs` (no build step — shipped scripts must run as-is since Claude Code installs the plugin directly from this git repo)
- **Framework**: none — Claude Code plugin manifest conventions (`.claude-plugin/`, `commands/*.md`, `agents/*.md`)
- **Database**: none — the job ledger is flat JSON files under the user's XDG state dir, never inside a target repo. No config file is generated for codex either — provider/model selection is passed as CLI flags on every invocation.
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
  scripts/                               # broker: spawns `codex exec`, job ledger, rate-limit retry
    lib/
  schemas/review-output.schema.json      # findings JSON schema
  skills/grok-runtime/                   # skill documenting the broker contract and open risks
tests/                                   # node --test suite incl. fake-codex fixture
```

## Known open risks (see plugins/grok/skills/grok-runtime/SKILL.md for detail)

- `wire_api=responses` was only verified against Ollama/LM Studio in local-model-plugin-cc, not against xAI's Chat-Completions-shaped API — unresolved until manually spiked with a real `XAI_API_KEY`.
- `plugins/grok/scripts/lib/models.mjs`'s fixed model catalog was not verified against xAI's actual API/docs at write time.
- The rate-limit retry heuristic (`scripts/lib/retry.mjs`) is a string match on codex's error text, not a structured status code.

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
