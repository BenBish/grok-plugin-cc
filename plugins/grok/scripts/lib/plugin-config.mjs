import path from "node:path";
import { pluginConfigPath } from "./paths.mjs";
import { ensureDir, atomicWriteJson, readJsonSafe } from "./fs-utils.mjs";

/**
 * Plugin config shape (written by /grok:setup):
 * {
 *   baseURL: string,       // defaults to https://api.x.ai/v1, overridable
 *   apiKeyEnvVar: string,  // name of an env var holding the xAI API key — never a literal secret, see codex-config.mjs
 *   models: [{ id, name }], defaultModel, configuredAt
 * }
 * Unlike local-model-plugin-cc, there is no oss/custom split and no
 * localProvider/providerId — Grok is always the same single hosted
 * provider, so those fields don't exist here.
 */
export function readPluginConfig() {
  return readJsonSafe(pluginConfigPath(), null);
}

export function writePluginConfig(config) {
  ensureDir(path.dirname(pluginConfigPath()));
  atomicWriteJson(pluginConfigPath(), config);
  return pluginConfigPath();
}
