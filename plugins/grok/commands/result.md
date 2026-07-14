---
description: Show the final output of a completed Grok job (defaults to the latest job for this repository).
argument-hint: "[job-id]"
---

Run:
```
node "${CLAUDE_PLUGIN_ROOT}/scripts/result.mjs" [--job-id <id>]
```

Pass `--job-id <id>` only if `$ARGUMENTS` contains a job id; otherwise this
defaults to the latest job (any kind) for the current repository. If the job
is still running, tell the user to check back with `/grok:status`. Present
a completed review's findings the same way `/grok:review` does; present a
completed rescue's `summary` and `changed_files` list.
