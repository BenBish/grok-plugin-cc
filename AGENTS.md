# AGENTS.md

<!-- Cross-agent project spec for this public Claude Code plugin repo. -->

## Structure

```
.claude-plugin/marketplace.json
plugins/grok/
  .claude-plugin/plugin.json
  commands/{setup,review,adversarial-review,rescue,status,result,cancel}.md
  agents/grok-rescue.md
  scripts/{local-companion,setup,status,result,cancel}.mjs, scripts/lib/*.mjs
  schemas/review-output.schema.json
  skills/grok-runtime/
tests/*.test.mjs
```

## Commands

All commands run from project root:

```bash
npm install       # install devDependencies
npm test          # run tests
npm run lint      # type-check .mjs sources
```

No dev server, no build step, no database. This is a Claude Code plugin
distributed directly from this git repo — every file under `plugins/grok/`
must be runnable as committed, since installing the plugin does not run
`npm install` or any build in the end user's environment.

Runtime peer dependency: the `grok` CLI (Grok Build CLI) must be on the
end user's `PATH`. `/grok:setup` checks for it and guides installation;
nothing in this repo vendors or auto-installs it. A working `grok login`
session (or another auth method the CLI supports directly) is also required
at runtime — see README.md's "Verify before relying on this" section.

## Architecture

- **Broker**: `plugins/grok/scripts/local-companion.mjs` spawns
  `grok -p ... --output-format json` (no CLI config file). Model id is
  passed as a flag; selection is stored only by `/grok:setup`.
- **Job ledger**: flat JSON under the user's XDG state dir, never inside a
  target repository.
- **Review safety**: deny rules for write/edit tools plus prompt
  instructions (do not rely on `--sandbox read-only` alone).
- **Rescue safety**: post-run diff-safety checks in
  `scripts/lib/diff-safety.mjs` after Grok mutates the workspace.
- **Product skill**: `plugins/grok/skills/grok-runtime/` documents the
  broker contract. Portable contributor skills (`issue`, `work`, `mr`, …)
  are **not** vendored here — install a user-level skills plugin if needed.

## Gotchas

- Do not reintroduce `.agents/skills/`, `.claude/skills`, `.codex/`, or
  `.mcp.json` — those are personal/dev tooling, not product surface.
  CI fails if they reappear.
- Nothing under `plugins/grok/` may assume bun is installed on the user's
  machine.
- Rate-limit retry (`scripts/lib/retry.mjs`) matches error text, not HTTP
  status codes.
- Abandoned path: routing Grok through Codex provider overrides (xAI
  rejected Codex's Responses API tool schema). Do not reintroduce without
  proof that is fixed.
