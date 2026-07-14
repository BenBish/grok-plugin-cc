// Fixed Grok model catalog for /grok:setup. xAI exposes a small, stable set
// of model ids (unlike Ollama/LM Studio's arbitrary "whatever's pulled"
// list in local-model-plugin-cc), so this is a hardcoded catalog rather
// than live discovery — there's no local server to probe for a hosted API.
//
// TODO(verify-before-ship): the ids below are NOT yet confirmed against
// xAI's actual API/docs (https://docs.x.ai/docs/models) — verify the real
// model-id strings before relying on this catalog for anything real.
// `setup.mjs configure --model <id>` also accepts an arbitrary custom id,
// so this list is a convenience default for /grok:setup to suggest, not a
// hard constraint enforced anywhere.
export const GROK_MODELS = [
  { id: "grok-4.5", name: "Grok 4.5" },
  { id: "grok-4.5-fast", name: "Grok 4.5 Fast" },
];

export const DEFAULT_MODEL_ID = GROK_MODELS[0].id;
