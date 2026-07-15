import path from "node:path";
import { pluginConfigPath } from "./paths.mjs";
import { ensureDir, atomicWriteJson, readJsonSafe } from "./fs-utils.mjs";

/**
 * Plugin config shape (written by /grok:setup):
 * {
 *   authMode: "grok-login",
 *   models: [{ id, name }],
 *   defaultModel,
 *   configuredAt
 * }
 * Grok CLI owns authentication (`grok login`, or any environment it
 * supports directly). This plugin stores no API key or API-key env var.
 */
export function readPluginConfig() {
  return readJsonSafe(pluginConfigPath(), null);
}

export function writePluginConfig(config) {
  ensureDir(path.dirname(pluginConfigPath()));
  atomicWriteJson(pluginConfigPath(), config);
  return pluginConfigPath();
}
