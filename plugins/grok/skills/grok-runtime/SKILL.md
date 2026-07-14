---
name: grok-runtime
description: How the grok-plugin-cc broker scripts work — job model, codex CLI delegation, the Grok/xAI provider wiring, and the known wire-format blocker. Use when invoking or debugging the local-companion.mjs / setup.mjs / status.mjs / result.mjs / cancel.mjs scripts.
---

# grok-runtime

This plugin delegates work to Grok 4.5 by brokering to the `codex` CLI (the
same CLI `openai/codex-plugin-cc` itself wraps, and the same broker
architecture [`local-model-plugin-cc`](https://github.com/BenBish/local-model-plugin-cc)
uses for local models), pointed at xAI's hosted API instead of a local
server or an agent runtime of this plugin's own. Everything here describes
that broker contract, including the constraints local-model-plugin-cc found
by testing against a real local model — some of which are architectural
(codex CLI's own behavior, not model-specific) and transfer unchanged, plus
the currently confirmed Codex/xAI Responses API tool-schema blocker.

## Job model

Every `/grok:review`, `/grok:adversarial-review`, and `/grok:rescue`
invocation creates one job, recorded outside the target repository (under
the user's XDG state dir, keyed by resolved git-root identity). A job is
one of:

- `review` / `adversarial-review` — read-only, runs plain `codex exec`
  under `-c sandbox_mode=read-only`.
- `rescue` — mutating, runs plain `codex exec` under `-s workspace-write`.
  Empirically (in local-model-plugin-cc), codex's sandbox refuses writes
  under `.git/` regardless of sandbox mode, though that isn't documented
  behavior we can cite, so the broker's own diff-safety pass (below) is
  still the primary defense, not this.

All three always use plain `codex exec`, never `codex exec review` — see
"Why not `codex exec review`" below.

Jobs have status `running` → `completed` | `failed` | `cancelled`.
Foreground invocations (no `--background`) block until the job reaches a
terminal state and print the final JSON result directly. Background
invocations print a job ID immediately; use `/grok:status` and
`/grok:result` to check on them later.

## What the companion script does per job

1. Resolve the repo root and repo identity from the current working
   directory (`git rev-parse --show-toplevel`, real-path resolved).
2. Load the plugin's own config (written by `/grok:setup`) and build the
   `codex` CLI args that select the Grok provider/model: always `-c
   model_providers.grok-xai.base_url=https://api.x.ai/v1 (or an override)
   -c model_providers.grok-xai.wire_api=responses -c
   model_providers.grok-xai.env_key=<VAR> -c model_provider=grok-xai`. The
   provider id is always the fixed `grok-xai`, not user-chosen — codex
   rejects overrides for reserved built-in provider names, and prefixing
   avoids that whole class of problem the same way local-model-plugin-cc's
   `localmodel-` prefix does. No config file is ever generated or
   written — everything is passed as CLI flags, and `--ignore-user-config`
   ensures the user's personal `~/.codex/config.toml` is never read or
   affected. Unlike local-model-plugin-cc, `env_key` is always present:
   there is no no-auth case for a hosted API.
3. Spawn `codex exec <provider args> <sandbox args> -C <repo>
   --skip-git-repo-check --json -o <tmpfile> <prompt>` and read the final
   message from the `-o` file — far more reliable than scraping the
   `--json` NDJSON event stream for text, which is only used for
   diagnostics (logged) and extracting the `thread_id`
   (`type: "thread.started"` event).
4. The exit code is the only thing trusted as a hard success/failure
   signal. Codex emits non-fatal `item.completed` events with
   `item.type === "error"` for things like "model metadata not found, using
   fallback metadata" — these are warnings, not failures. Don't treat any
   `type: "error"` event as fatal on its own — but see the retry section
   below, since a rate-limit error also arrives as one of these events and
   *is* meant to be acted on (via the exit code, not the event itself).
5. Rate-limit handling (new vs. local-model-plugin-cc, which never needed
   it): each `runCodex()` call is wrapped in `withRateLimitRetry`
   (`lib/retry.mjs`), which retries with exponential backoff, up to a
   capped number of attempts, only when the failure looks rate-limit-shaped
   (a string match on `429`/`rate limit`/`too many requests` in codex's
   last error message — codex exposes no structured HTTP status, so this is
   a heuristic, not something more principled). Retries share the same
   `deadline` as the surrounding job's timeout budget rather than getting
   their own, so a pathological run can't multiply the stated timeout.
6. For reviews: the prompt (`prompts.mjs`) itself specifies the required
   JSON shape and instructs the model to investigate via `git
   status`/`git diff` before answering. The broker validates the parsed
   JSON against `schemas/review-output.schema.json` and, on a mismatch,
   does one fresh retry (not a session-resume — a new `codex exec` call
   with the validation errors folded into the prompt) before failing the
   job.
7. For rescue: after the run, `diff-safety.mjs` checks every changed file
   (via `git status`) against the repo root (no path/symlink escape, no
   oversized/binary files, HEAD hasn't moved since the run started) before
   reporting the rescue as `completed`. A rejection here fails the job even
   if codex itself reported success — this is a deliberate second gate.

## Why not `codex exec review`

`codex exec review` looks like the obvious choice for `/grok:review` — it
has built-in `--uncommitted`/`--base <ref>` diff-scoping and reliably calls
`git status`/`git diff` itself before answering. Two things rule it out, as
confirmed empirically by local-model-plugin-cc against a local model (not
yet independently re-verified against Grok specifically, but this is
`codex` CLI behavior, not a model-specific behavior, so it should transfer):

1. `--uncommitted`/`--base` can't be combined with a custom `[PROMPT]`
   argument (`error: the argument '--uncommitted' cannot be used with
   '[PROMPT]'`), so there's no way to inject this plugin's schema
   instructions or the adversarial-review framing while using them.
2. Even without that conflict, `codex exec review` ignores `--output-schema`
   entirely and always emits its own native `[P1] Title — file:line...`
   text format — not this plugin's JSON schema, and not something
   `--output-schema` overrides.

So `/grok:review` and `/grok:adversarial-review` both use plain `codex
exec` with the diff target (uncommitted changes, or a `--base <ref>` diff)
described in the prompt text instead (`prompts.mjs`), and rely on
prompt-only schema instructions plus the broker's own validate-and-retry
logic rather than `--output-schema`.

## Why not `--output-schema` even on plain `codex exec`

local-model-plugin-cc found, head-to-head against a local model with only
`--output-schema` toggled: **with** it, the model skipped investigation and
answered immediately with a schema-shaped but factually wrong result;
**without** it, the model ran `git status`/`git diff`/`cat`/`find`/`ls`
before producing a correctly-grounded answer in the prompt-specified shape.
This plugin inherits that decision (schema conformance enforced entirely
via prompt instructions plus the broker's validate-and-one-retry logic, not
via `--output-schema`) without having independently re-tested it against
Grok. If Grok reviews come back suspiciously fast with confident-but-wrong
findings, re-run that head-to-head comparison before assuming the prompt
needs tuning instead.

## Known blockers and risks

- **Codex/xAI Responses API tool-schema incompatibility — current blocker.**
  Codex 0.142.0 accepts only `wire_api=responses` for custom providers
  (`wire_api="chat"` is rejected at config-load time). With xAI's
  `/v1/responses` endpoint, Codex reaches the provider, but xAI rejects
  Codex's current agent tool declaration with a 422 like `unknown variant
  namespace`, because the serialized tool shape does not match xAI's
  accepted schema. This is not model-specific; switching from a bad model id
  to `grok-4.5` still fails the same way. Do not keep retrying setup or
  guess alternate `wire_api` values — the plugin cannot run Grok
  reviews/rescues through Codex until Codex or xAI supports a compatible
  tool schema.
- The rate-limit retry heuristic (`lib/retry.mjs`) is a string match on
  codex's last error message, not a structured status code — codex doesn't
  expose one. If xAI's actual 429 error text doesn't contain anything
  matching `/429|rate.?limit|too many requests/i`, retries silently won't
  fire; if this comes up, widen the pattern based on the real error text
  observed in a job's log file rather than guessing.
- The fixed model catalog in `lib/models.mjs` intentionally includes only
  `grok-4.5`, the documented text model in xAI's model docs
  (`https://docs.x.ai/docs/models`). If a user configures a custom model id
  through `/grok:setup`, confirm that custom id against the live API before
  trusting it.
- Cost: unlike a local model, every `/grok:rescue`/`/grok:review` run is
  billed against the configured xAI account. `/grok:rescue` in particular
  can run up to 15 minutes and is gated behind an explicit user
  confirmation in `commands/rescue.md` for exactly this reason — don't
  remove that confirmation step.
- If a job fails in a way that looks like a parsing problem rather than a
  real model/task failure, check the job's log file (path in the job
  record) for the raw `codex` invocation and its `--json` event stream
  before assuming the broker's code is at fault.
