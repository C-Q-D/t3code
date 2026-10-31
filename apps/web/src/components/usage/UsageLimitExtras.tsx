/** Independent quota notices and actions; shared destinations appear once across accounts. */
import { t } from "~/i18n";
import type { EnvironmentId, UsageProviderKind } from "@t3tools/contracts";
import {
  CHATGPT_USAGE_URL,
  collectExternalUsageLinks,
  collectLimitNotices,
  usesChatGptSharing,
} from "@t3tools/shared/usageLimits";
import { AlertTriangleIcon, ExternalLinkIcon } from "lucide-react";
import type { EnvironmentUsageStatus } from "../../state/usage";
import { ensureLocalApi } from "../../localApi";
import { Button } from "../ui/button";
import { CursorEnableLimits } from "./UsageCursorEnable";
import { limitExtraCards } from "./usageLimitFaders.logic";
import { useLimitPresentations } from "./UsageLimits";

/** Filters shared usage links and provides Cursor environments requiring explicit opt-in. */
export interface UsageLimitExtrasProps {
  readonly selectedEnvironmentIds: ReadonlySet<EnvironmentId> | null;
  readonly hiddenProviders: ReadonlySet<UsageProviderKind>;
  readonly cursorEnvironments: readonly EnvironmentUsageStatus[];
  readonly onCursorEnabled: () => void;
}

/** Return no section when there are no notices, opt-ins, or destinations; external navigation uses the local shell. */
export function UsageLimitExtras({
  selectedEnvironmentIds,
  hiddenProviders,
  cursorEnvironments,
  onCursorEnabled,
}: UsageLimitExtrasProps) {
  const presentations = useLimitPresentations(selectedEnvironmentIds, hiddenProviders);
  const notices = [
    ...new Set(collectLimitNotices(presentations, t.chat.workLog.shared.usageLimits)),
  ];
  const links = collectExternalUsageLinks(presentations);
  const sharedUsage = [...presentations.values()].some((presentation) =>
    presentation.serverConfig?.providers?.some(usesChatGptSharing),
  );
  const cards = limitExtraCards(
    notices,
    cursorEnvironments,
    links,
    sharedUsage ? { url: CHATGPT_USAGE_URL, label: t.tools.usage.chatgptSharedUsage } : null,
  );
  if (cards.length === 0) return null;
  return (
    <div className="usage-limit-extras">
      {cards.map((card) => {
        if (card.kind === "notice")
          return (
            <section key={card.notice} className="usage-limit-extra usage-limit-extra-warning">
              <AlertTriangleIcon className="size-4 shrink-0" aria-hidden />
              <p>{card.notice}</p>
            </section>
          );
        if (card.kind === "cursor")
          return (
            <CursorEnableLimits
              key="cursor"
              environments={card.environments}
              onEnabled={onCursorEnabled}
            />
          );
        const { link } = card;
        return (
          <section className="usage-limit-extra" key={link.url}>
            <h3>{link.label}</h3>
            {link.accounts?.length ? <p>{link.accounts.join(", ")}</p> : null}
            {link.url === CHATGPT_USAGE_URL ? (
              <p>{t.tools.usage.chatgptUsageHint}</p>
            ) : link.message ? (
              <p>{link.message}</p>
            ) : null}
            <div>
              <Button
                variant="ghost-muted"
                size="xs"
                onClick={() => void ensureLocalApi().shell.openExternal(link.url)}
              >
                {t.tools.usage.manageUsage}
                <ExternalLinkIcon className="size-3.5" aria-hidden />
              </Button>
            </div>
          </section>
        );
      })}
    </div>
  );
}
