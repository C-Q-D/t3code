import { t } from "~/i18n";
import type { EnvironmentId } from "@t3tools/contracts";
import { ExternalLinkIcon } from "lucide-react";
import { useState } from "react";

import { useEnvironmentSettings } from "../../hooks/useSettings";
import { readGitHubSettings } from "@t3tools/client-runtime/source-control-clients";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button, InlineButton } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

const DEFAULT_HOST = "github.com";

/** Where to create a token for a host: GitHub's own page, or the same path on an Enterprise host. */
function newTokenUrl(host: string): string {
  return `https://${host}/settings/personal-access-tokens/new`;
}

/**
 * A GitHub token for one host, kept in the server's secret store. It is used before
 * `GH_TOKEN` and the `gh` login, so it also works on a server without `gh` installed.
 * Write-only: the saved token is never shown, only whether one is set.
 */
export function GitHubTokenSettings({
  environmentId,
  onSaved,
}: {
  readonly environmentId: EnvironmentId;
  readonly onSaved: () => void;
}) {
  const { tokens } = useEnvironmentSettings(environmentId, readGitHubSettings);
  const updateSettings = useAtomCommand(serverEnvironment.updateSettings, {
    label: t.settings.gitHubToken.saveGitHubToken,
  });
  const [host, setHost] = useState(DEFAULT_HOST);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const normalizedHost = host.trim().toLowerCase();
  const isSaved = (tokens[normalizedHost] ?? "").length > 0;
  const savedHosts = Object.entries(tokens)
    .filter(([, value]) => value.length > 0)
    .map(([saved]) => saved);

  const save = async (target: string, token: string) => {
    setSaving(true);
    try {
      const result = await updateSettings({
        environmentId,
        // The map travels whole: every other saved token as its redaction marker, which keeps it.
        input: {
          patch: { sourceControlHosts: { github: { tokens: { ...tokens, [target]: token } } } },
        },
      });
      if (result._tag === "Success") {
        setDraft("");
        onSaved();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (normalizedHost && draft.trim()) void save(normalizedHost, draft.trim());
      }}
    >
      {/* Locked while saving: a successful save clears the draft, which would drop edits made mid-request. */}
      <fieldset disabled={saving} className="contents">
        <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">
          {t.settings.gitHubToken.aTokenSavedHereIsUsedBefore}{" "}
          <code className="rounded bg-muted px-1 py-px text-2xs">GH_TOKEN</code>{" "}
          {t.settings.gitHubToken.andThe}{" "}
          <code className="rounded bg-muted px-1 py-px text-2xs">gh</code>{" "}
          {t.settings.gitHubToken.loginGitHubWorksWithoutGitHubHint}{" "}
          <InlineButton
            render={
              <a
                href={newTokenUrl(normalizedHost || DEFAULT_HOST)}
                target="_blank"
                rel="noreferrer noopener"
              />
            }
          >
            {t.settings.gitHubToken.createAToken}
            <ExternalLinkIcon aria-hidden className="size-3" />
          </InlineButton>
        </p>
        <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
          <div className="grid gap-1.5">
            <Label htmlFor={`github-token-host-${environmentId}`}>
              {t.settings.connections.pairing.hostLabel}
            </Label>
            <Input
              id={`github-token-host-${environmentId}`}
              autoComplete="off"
              size="sm"
              placeholder={DEFAULT_HOST}
              value={host}
              onChange={(event) => setHost(event.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`github-token-${environmentId}`}>{t.settings.gitHubToken.token}</Label>
            <Input
              id={`github-token-${environmentId}`}
              type="password"
              autoComplete="off"
              size="sm"
              placeholder={
                isSaved
                  ? t.settings.gitHubToken.storedSecretEnterValueReplace
                  : t.settings.gitHubToken.notSet
              }
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {savedHosts.length === 0
              ? t.settings.gitHubToken.tokenSavedServerUsesGhHint
              : t.settings.gitHubToken.savedFor(savedHosts.join(", "))}
          </p>
          <div className="flex shrink-0 gap-2">
            {isSaved ? (
              <Button
                size="xs"
                variant="outline"
                disabled={saving}
                onClick={() => void save(normalizedHost, "")}
              >
                {t.settings.gitHubToken.remove}
              </Button>
            ) : null}
            <Button type="submit" size="xs" disabled={!normalizedHost || !draft.trim() || saving}>
              {t.settings.gitHubToken.save}
            </Button>
          </div>
        </div>
      </fieldset>
    </form>
  );
}
