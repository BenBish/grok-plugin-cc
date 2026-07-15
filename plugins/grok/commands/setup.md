---
description: Configure Grok 4.5 (via xAI's API) for grok-plugin-cc.
---

Configure grok-plugin-cc for this machine. Do not skip steps or guess
configuration — this command's whole job is to get a working, verified
config in place before any review/rescue command is used.

Unlike a local-model setup, there is nothing to auto-detect: Grok 4.5 is a
hosted API, not a server on your machine.

1. Run:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/scripts/setup.mjs" list-models
   ```
   Present the returned models to the user and ask which to make the
   default. They can also supply a custom model id not in the list.

2. Ask the user for the *name* of an environment variable that holds their
   xAI API key (e.g. `XAI_API_KEY`). Never ask for or write the literal key
   value — only the variable name is stored. If they want a non-default API
   base URL (e.g. a proxy), ask for that too; otherwise it defaults to
   `https://api.x.ai/v1`.

3. Run configure with the resolved answers:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/scripts/setup.mjs" configure \
     --api-key-env XAI_API_KEY \
     --model grok-4.5="Grok 4.5" \
     --default-model grok-4.5 \
     [--base-url https://api.x.ai/v1]
   ```
   Repeat `--model <id>=<display name>` for each model the user wants
   available.

4. Run:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/scripts/setup.mjs" smoke-test
   ```
   This requires the `codex` CLI to be on `PATH` (setup.mjs will say so
   clearly if it isn't — point the user to
   https://developers.openai.com/codex/cli), the API key env var to be set
   in the user's shell, and sends a trivial prompt to the configured model
   through `codex exec` to confirm the whole path works end to end,
   including the `wire_api=responses` override against xAI's API. With
   current Codex/xAI behavior, this is expected to fail with the known
   tool-schema 422 (`unknown variant namespace`), because Codex's Responses
   API tool declaration does not match xAI's accepted shape. Report the
   pass/fail result to the user plainly, including the log path on failure
   so they can see what codex actually said. If the script reports the
   known Codex/xAI incompatibility, do not retry with another model or
   `wire_api=chat`; current Codex rejects `chat` at config-load time.

5. Once the smoke test passes, tell the user setup is complete and they can
   use `/grok:review`, `/grok:adversarial-review`, and `/grok:rescue`. Also
   remind them that `/grok:rescue` runs a hosted, billed Grok session (up to
   15 minutes) — unlike a local model, every run has a real dollar cost.
