import { t } from "~/i18n";
import type {
  ServerProvider,
  ServerProviderVersionAdvisory,
  ServerProviderCompatibilityAdvisory,
} from "@t3tools/contracts";

/**
 * Visual treatment for each server-reported provider status. Centralized so
 * the default-driver card and per-instance cards share the same language.
 */
export const PROVIDER_STATUS_STYLES = {
  disabled: {
    dot: "bg-muted-foreground/50",
  },
  error: {
    dot: "bg-destructive",
  },
  ready: {
    dot: "bg-success",
  },
  warning: {
    dot: "bg-warning",
  },
} as const;

export type ProviderStatusKey = keyof typeof PROVIDER_STATUS_STYLES;

/**
 * Derive the headline + detail copy shown under a provider's name in the
 * settings page. Prefers `provider.message` for server-supplied detail and
 * falls back to generic phrasing when the server has not yet reported any
 * state — which happens before the first probe or when an instance names a
 * driver this build does not ship. A ready provider without account metadata
 * remains available and does not imply an authentication failure.
 */
export function getProviderSummary(provider: ServerProvider | undefined) {
  if (!provider) {
    return {
      headline: t.settings.providerStatus.checkingProviderStatus,
      detail: t.settings.providerStatus.waitingServerReportInstallationAuthenticationHint,
    };
  }
  if (!provider.enabled || provider.status === "disabled") {
    return {
      headline: t.settings.resourceTelemetry.host.disabled,
      detail:
        provider.message ?? t.settings.providerStatus.providerInstalledButDisabledSessionsHint,
    };
  }
  if (!provider.installed) {
    return {
      headline: t.settings.providerStatus.notFound,
      detail: provider.message ?? t.settings.providerStatus.cliNotDetectedOnPath,
    };
  }
  if (provider.auth.status === "unauthenticated") {
    const authLabel = provider.auth.label ?? provider.auth.type;
    return {
      headline: authLabel
        ? t.settings.providerStatus.notAuthenticated(authLabel)
        : t.settings.providerStatus.unauthenticated,
      detail: provider.message ?? null,
    };
  }
  if (provider.status === "warning") {
    return {
      headline: t.settings.providerStatus.needsAttention,
      detail: provider.message ?? t.settings.providerStatus.providerInstalledButServerFullyError,
    };
  }
  if (provider.status === "error") {
    return {
      headline: t.settings.resourceTelemetry.unavailable,
      detail: provider.message ?? t.settings.providerStatus.theProviderFailedItsStartupChecks,
    };
  }
  if (provider.auth.status === "authenticated") {
    const authLabel = provider.auth.label ?? provider.auth.type;
    return {
      headline: authLabel
        ? t.settings.providerStatus.authenticated(authLabel)
        : t.settings.providerStatus.authenticatedStatus,
      detail: provider.message ?? null,
    };
  }
  return {
    headline: t.settings.providerStatus.available,
    detail: provider.message ?? null,
  };
}

/**
 * Normalize a version string for display. Adds the `v` prefix when the
 * driver reported a bare version (e.g. `1.2.3`) so cards render
 * consistently regardless of driver.
 */
export function getProviderVersionLabel(version: string | null | undefined) {
  if (!version) return null;
  // Antigravity reports a release tag such as `agy_acp_server_20260818_01_RC01`.
  // Show the date and candidate so the row title keeps room for the name.
  const antigravity = /^agy_acp_server_(\d{4})(\d{2})(\d{2})_\d+(?:_(\w+))?$/.exec(version);
  if (antigravity) {
    const [, year, month, day, candidate] = antigravity;
    return `${year}-${month}-${day}${candidate ? ` ${candidate}` : ""}`;
  }
  // Only bare semver-like versions get a `v` prefix. Other tags are shown as-is.
  return /^\d/.test(version) ? `v${version}` : version;
}

const COMPATIBILITY_TITLES = {
  graceful: t.settings.providerStatus.limitedSupport,
  unsupported: t.settings.providerStatus.unsupportedVersion,
  broken: t.settings.providerStatus.knownBrokenVersion,
};

/** Compatibility guidance shares the version popover, with safe install actions. */
export function getProviderVersionAdvisoryPresentation(
  advisory: ServerProviderVersionAdvisory | undefined,
  compatibility?: ServerProviderCompatibilityAdvisory | undefined,
  showCompatibility = true,
): {
  readonly title: string;
  readonly detail: string;
  readonly updateCommand: string | null;
  readonly emphasis: "normal" | "strong";
  readonly targetVersion: string | null;
} | null {
  const latestIsIncompatible =
    compatibility?.latestVersionStatus === "broken" ||
    compatibility?.latestVersionStatus === "unsupported";
  if (
    showCompatibility &&
    compatibility &&
    (compatibility.status === "graceful" ||
      compatibility.status === "unsupported" ||
      compatibility.status === "broken")
  ) {
    const targetVersion = compatibility.recommendedVersion;
    const recommendation = getProviderVersionLabel(targetVersion) ?? compatibility.recommendedRange;
    return {
      title: COMPATIBILITY_TITLES[compatibility.status],
      detail:
        compatibility.message ??
        (recommendation
          ? t.settings.providerStatus.recommendedVersionHint(recommendation)
          : t.settings.providerStatus.updateForFullSupport),
      updateCommand:
        targetVersion || latestIsIncompatible ? null : (advisory?.updateCommand ?? null),
      emphasis: compatibility.status === "graceful" ? "normal" : "strong",
      targetVersion,
    };
  }
  if (
    !advisory ||
    advisory.status === "current" ||
    advisory.status === "unknown" ||
    latestIsIncompatible
  ) {
    return null;
  }

  const label = t.settings.providerStatus.updateAvailable;
  const version = advisory.latestVersion;
  const versionLabel = getProviderVersionLabel(version);

  return {
    title: label,
    detail:
      advisory.message ??
      (versionLabel
        ? t.settings.providerStatus.install(label, versionLabel)
        : t.settings.providerStatus.installTheLatestProviderVersion(label)),
    updateCommand: advisory.updateCommand,
    emphasis: "normal" as const,
    targetVersion: null,
  };
}
