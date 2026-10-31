/** Nightly release previews and external links; release selection stays in desktop update state. */
import { t } from "~/i18n";
import type { DesktopBridge, DesktopUpdateState } from "@t3tools/contracts";
import { ExternalLinkIcon } from "lucide-react";

import {
  getDesktopUpdateReleaseHistoryUrl,
  getDesktopUpdateReleaseUrl,
} from "../desktopUpdate.logic";
import { formatRelativeTimeLabel } from "../../timestampFormat";
import { openDesktopUpdateReleaseNotes } from "../desktopUpdate.toast";

type DesktopUpdateShell = Pick<DesktopBridge, "openExternal">;

/** Give repeated note text stable occurrence keys without changing item order. */
function keyReleaseNoteItems(items: ReadonlyArray<string>) {
  const occurrences = new Map<string, number>();
  return items.map((item) => {
    const occurrence = occurrences.get(item) ?? 0;
    occurrences.set(item, occurrence + 1);
    return { item, key: JSON.stringify([item, occurrence]) };
  });
}

/** Feed times read "3h ago"; build days from a prerelease version read "today" or "2d ago". */
function formatReleaseAge(releasedAt: string): string {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(releasedAt);
  if (!day) return formatRelativeTimeLabel(releasedAt);
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const days = Math.round(
    (today - Date.UTC(Number(day[1]), Number(day[2]) - 1, Number(day[3]))) / 86_400_000,
  );
  return days <= 0 ? "today" : `${days}d ago`;
}

/** Open an exact release URL through the desktop shell; the shared opener reports failures. */
function ReleaseLink({
  children,
  releaseUrl,
  shell,
}: {
  readonly children: string;
  readonly releaseUrl: string;
  readonly shell: DesktopUpdateShell | undefined;
}) {
  return (
    <a
      className="sidebar-update-release-link"
      href={releaseUrl}
      onClick={(event) => {
        event.preventDefault();
        void openDesktopUpdateReleaseNotes(shell, releaseUrl);
      }}
    >
      {children}
      <ExternalLinkIcon aria-hidden className="size-3 shrink-0" strokeWidth={2} />
    </a>
  );
}

/** Render nightly previews and omitted-change links; other states fall back to the tooltip text. */
export function SidebarUpdateReleaseNotes({
  shell,
  state,
  tooltip,
}: {
  readonly shell: DesktopUpdateShell | undefined;
  readonly state: DesktopUpdateState;
  readonly tooltip: string;
}) {
  if (state.releaseNotes.length === 0) {
    return <>{tooltip}</>;
  }
  const releasedAt = state.releaseNotes.find(
    (releaseNote) => releaseNote.version === state.availableVersion,
  )?.releasedAt;

  return (
    <div className="sidebar-update-release-notes dropdown-glass">
      <h2 className="sidebar-update-release-title">{t.sidebar.updates.changesTitle}</h2>
      {releasedAt ? (
        <div className="sidebar-update-release-status">
          {state.availableVersion} · {formatReleaseAge(releasedAt)}
        </div>
      ) : null}
      {state.status !== "available" ? (
        <div className="sidebar-update-release-status">{tooltip}</div>
      ) : null}
      <div className="sidebar-update-release-scroll">
        {state.releaseNotes.map((releaseNote) => {
          const releaseUrl = getDesktopUpdateReleaseUrl(releaseNote.version);
          const omittedItemCount = Math.max(0, releaseNote.totalItems - releaseNote.items.length);
          const linkLabel =
            releaseNote.stats ??
            (omittedItemCount === 0
              ? t.sidebar.updates.viewRelease
              : t.sidebar.updates.moreChanges(omittedItemCount));

          return (
            <section className="sidebar-update-release-section" key={releaseNote.version}>
              <h3 className="sidebar-update-release-version">
                {t.sidebar.updates.versionChanges(releaseNote.version)}
              </h3>
              {releaseNote.intro !== undefined ? (
                <p>{releaseNote.intro}</p>
              ) : (
                <ul className="sidebar-update-release-items">
                  {keyReleaseNoteItems(releaseNote.items).map(({ item, key }) => (
                    <li className="list-disc break-words" key={key}>
                      {item}
                    </li>
                  ))}
                </ul>
              )}
              {releaseUrl ? (
                <ReleaseLink releaseUrl={releaseUrl} shell={shell}>
                  {linkLabel}
                </ReleaseLink>
              ) : null}
            </section>
          );
        })}
        {state.omittedReleaseCount > 0 ? (
          <div className="sidebar-update-release-history">
            <ReleaseLink releaseUrl={getDesktopUpdateReleaseHistoryUrl()} shell={shell}>
              {t.sidebar.updates.olderReleases(state.omittedReleaseCount)}
            </ReleaseLink>
          </div>
        ) : null}
      </div>
    </div>
  );
}
