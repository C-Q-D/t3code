/** Formats model availability notices without changing provider gating or model identities. */
import { PROVIDER_DISPLAY_NAMES, type ServerProvider } from "@t3tools/contracts";
import { compareSemverVersions } from "@t3tools/shared/semver";

// Name the thing the user updates; "Claude" alone reads like the app or model.
const RUNTIME_NAMES: Partial<Record<string, string>> = {
  claudeAgent: "Claude Code",
};

/** Joins model names using the existing English list punctuation. */
function formatModelList(names: ReadonlyArray<string>): string {
  if (names.length <= 2) return names.join(" and ");
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

/** Default wording for clients that do not supply localized model-picker messages. */
const englishUpdateRequiredMessages = {
  formatModelList,
  updateRequired: (provider: string, version: string, models: string) =>
    `Update ${provider} to ${version} or newer to use ${models}.`,
  codexRuntime: "the Codex CLI",
};

/**
 * Model picker notice for models the manifest announces but the installed
 * provider is too old to run, e.g. "Update Claude Code to v2.1.300 or newer to
 * use Claude Opus 6." With a search query, only gated models it matches are
 * named, so searching for one explains why it is missing. Null when nothing
 * gated matches.
 */
export function formatProviderUpdateRequiredNotice(
  provider: Pick<ServerProvider, "driver" | "updateRequiredModels">,
  searchQuery = "",
  messages: typeof englishUpdateRequiredMessages = englishUpdateRequiredMessages,
): string | null {
  const query = searchQuery.trim().toLocaleLowerCase();
  const models = (provider.updateRequiredModels ?? []).filter(
    (model) =>
      query.length === 0 ||
      model.name.toLocaleLowerCase().includes(query) ||
      model.slug.toLocaleLowerCase().includes(query),
  );
  if (models.length === 0) return null;
  // The highest bar unlocks every listed model.
  const minVersion = models
    .map((model) => model.minVersion)
    .reduce((highest, version) =>
      compareSemverVersions(version, highest) > 0 ? version : highest,
    );
  const providerName =
    provider.driver === "codex"
      ? messages.codexRuntime
      : (RUNTIME_NAMES[provider.driver] ??
        PROVIDER_DISPLAY_NAMES[provider.driver] ??
        provider.driver);
  const version = minVersion.startsWith("v") ? minVersion : `v${minVersion}`;
  const names = messages.formatModelList(models.map((model) => model.name));
  return messages.updateRequired(providerName, version, names);
}
