// Builds the `codex` CLI args that select the Grok 4.5 (xAI) provider,
// without ever writing a config file. Always uses `-c
// model_providers.<id>.base_url=... -c model_providers.<id>.wire_api=responses
// -c model_providers.<id>.env_key=<VAR> -c model_provider=<id> -m <model>` —
// the same ephemeral-override mechanism local-model-plugin-cc uses for its
// "custom OpenAI-compatible endpoint" mode, just always-hosted: unlike that
// repo's oss/custom split, Grok has no local/no-auth case, so there is only
// one mode here and `env_key` is always required, never optional.
//
// KNOWN BLOCKER, not model-specific: current codex versions reject
// `wire_api="chat"` at config-load time, so `responses` is the only value
// this provider can pass. Codex reaches xAI's /v1/responses endpoint, but
// xAI rejects Codex's current agent tool declaration (`type: namespace`).
// See plugins/grok/skills/grok-runtime/SKILL.md for the full writeup.
//
// The provider id is always `grok-xai` (not user-chosen): codex rejects
// `model_providers.<id>.*` overrides when `<id>` collides with a reserved
// built-in provider name (confirmed for "ollama" in local-model-plugin-cc);
// prefixing avoids that whole class of problem, same reasoning as that
// repo's `localmodel-` prefix.
//
// `--ignore-user-config` is always included so this never reads or is
// affected by the user's personal ~/.codex/config.toml.

export const PROVIDER_ID = "grok-xai";
export const DEFAULT_BASE_URL = "https://api.x.ai/v1";

/**
 * @param {{baseURL?: string|null, apiKeyEnvVar: string, defaultModel: string}} pluginConfig
 * @returns {string[]}
 */
export function buildProviderArgs(pluginConfig) {
  const baseURL = pluginConfig.baseURL || DEFAULT_BASE_URL;
  const args = ["--ignore-user-config"];
  args.push("-c", `model_providers.${PROVIDER_ID}.name=xAI Grok`);
  args.push("-c", `model_providers.${PROVIDER_ID}.base_url=${baseURL}`);
  args.push("-c", `model_providers.${PROVIDER_ID}.wire_api=responses`);
  args.push("-c", `model_providers.${PROVIDER_ID}.env_key=${pluginConfig.apiKeyEnvVar}`);
  args.push("-c", `model_provider=${PROVIDER_ID}`);
  args.push("-m", pluginConfig.defaultModel);
  return args;
}
