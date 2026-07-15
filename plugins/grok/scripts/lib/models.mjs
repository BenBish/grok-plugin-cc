// Fixed Grok Build model catalog for /grok:setup. `grok models` currently
// exposes `grok-4.5` on this CLI install; `setup.mjs list-models` will use
// live CLI discovery when available and fall back to this value otherwise.
//
// `setup.mjs configure --model <id>` also accepts an arbitrary custom id,
// so this list is a convenience default for /grok:setup to suggest, not a
// hard constraint enforced anywhere.
export const GROK_MODELS = [
  { id: "grok-4.5", name: "Grok 4.5" },
];

export const DEFAULT_MODEL_ID = GROK_MODELS[0].id;
