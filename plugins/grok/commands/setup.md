---
description: Configure Grok Build CLI for grok-plugin-cc.
---

Configure grok-plugin-cc for this machine. Do not skip steps or guess
configuration — this command's whole job is to get a working, verified
config in place before any review/rescue command is used.

Unlike a local-model setup, there is nothing to auto-detect on a loopback
port. This plugin uses the installed `grok` CLI and its own login state.

1. Run:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/scripts/setup.mjs" list-models
   ```
   Present the returned models to the user and ask which to make the
   default. They can also supply a custom model id not in the list.

2. Confirm the user has run `grok login`. If they have not, ask them to run
   it in their shell first. Do not ask for or store an API key.

3. Run configure with the resolved answers:
     ```
   node "${CLAUDE_PLUGIN_ROOT}/scripts/setup.mjs" configure \
     --model grok-4.5="Grok 4.5" \
     --default-model grok-4.5
   ```
   Repeat `--model <id>=<display name>` for each model the user wants
   available. If the user accepts the default, `configure` can be run with
   no flags.

4. Run:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/scripts/setup.mjs" smoke-test
   ```
   This requires the `grok` CLI to be on `PATH` and logged in. The script
   sends a trivial prompt through `grok -p --output-format json` to confirm
   the whole path works end to end. Report the pass/fail result plainly,
   including the log path on failure so the user can see what `grok`
   actually said.

5. Once the smoke test passes, tell the user setup is complete and they can
   use `/grok:review`, `/grok:adversarial-review`, and `/grok:rescue`. Also
   remind them that `/grok:rescue` runs a hosted, billed Grok session (up to
   15 minutes) — unlike a local model, every run has a real dollar cost.
