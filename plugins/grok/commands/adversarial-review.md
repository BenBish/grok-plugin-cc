---
description: Run a Grok 4.5 review steered toward challenging design assumptions, failure modes, and alternatives.
argument-hint: "[--base <ref>] [--focus <text>] [--wait|--background]"
---

Same target-selection rules as `/grok:review` (uncommitted changes by
default, `--base <ref>` for a branch diff, `--wait`/`--background`, same
scope-estimation-and-recommend behavior, same "nothing to review" check).
This command is also read-only.

Additionally parse `--focus <text>` from `$ARGUMENTS` — free text the user
wants the reviewer to pay particular attention to (e.g. "concurrency" or
"what happens if the upstream API times out"). Everything after `--focus`
up to the next recognized flag (or end of input) is the focus text.

Invoke:
```
node "${CLAUDE_PLUGIN_ROOT}/scripts/local-companion.mjs" adversarial-review [--base <ref>] [--focus "<text>"] [--background]
```

Present results the same way as `/grok:review`. This command intentionally
produces a more skeptical review than `/grok:review` — do not soften or
filter the findings when relaying them to the user.

If the command reports "No Grok configuration found," tell the user
to run `/grok:setup` first.
