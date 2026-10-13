/** Displays one persisted discussion statement patch in the shared responsive diff shell. */
import type { CodeViewDiffItem } from "@pierre/diffs";
import type { CodeViewHandle } from "@pierre/diffs/react";
import type { Discussion, EnvironmentId } from "@t3tools/contracts";
import { useEffect, useMemo, useState } from "react";
import { XIcon, ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { t } from "~/i18n";
import { useTheme } from "~/hooks/useTheme";
import { useEnvironmentSettings } from "~/hooks/useSettings";
import { getRenderablePatch, resolveDiffThemeName } from "~/lib/diffRendering";
import { PREFERRED_HIGHLIGHTER } from "~/lib/syntaxHighlighting";
import { serverEnvironment } from "~/state/server";
import { useEnvironmentQuery } from "~/state/query";
import { DiffPanelShell, DiffPanelLoadingState, type DiffPanelMode } from "../DiffPanelShell";
import { StyledDiffCodeView, type StyledDiffCodeViewOptions } from "../diffs/StyledDiffCodeView";
import { useCodeViewFileReveal } from "../diffs/useCodeViewFileReveal";
import { Button } from "../ui/button";
import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";
import {
  discussionDiffContent,
  discussionDiffTitle,
  type DiscussionDiffSelection,
} from "./discussionDiff.logic";

/**
 * Reads only the selected statement; the parent keys this component by environment/discussion/entry.
 * @param props.discussion Frozen seats resolve heading identity.
 * @param props.environmentId Destination environment for the read-only checkpoint diff query.
 * @param props.selection Persisted entry and requested current/previous file path.
 * @param props.mode Inline shell starts at the window top; sheet shell has no drag region.
 * @param props.onClose Unmounts this query and viewer; no automatic request retries are added.
 * @returns A diff shell with distinct loading, error/retry, empty, raw and file presentations.
 */
export function DiscussionDiffPanel({
  discussion,
  environmentId,
  selection,
  mode,
  onClose,
}: {
  discussion: Discussion;
  environmentId: EnvironmentId;
  selection: DiscussionDiffSelection;
  mode: DiffPanelMode;
  onClose: () => void;
}) {
  const query = useEnvironmentQuery(
    serverEnvironment.discussionEntryDiff({
      environmentId,
      input: { discussionId: discussion.id, entryId: selection.entryId },
    }),
  );
  const live = useEnvironmentQuery(
    serverEnvironment.discussionLive({ environmentId, input: { discussionId: discussion.id } }),
  );
  const entry = live.data?.entries.find((candidate) => candidate.id === selection.entryId);
  const seat = discussion.seats.find((candidate) => candidate.id === entry?.seatId);
  const title = entry
    ? discussionDiffTitle(
        entry,
        seat?.personaName ?? t.settings.discussions.deletedPersona,
        t.discussions,
      )
    : t.discussions.title;
  const patch = query.data?.diff;
  const parsed = useMemo(() => getRenderablePatch(patch), [patch]);
  const view = discussionDiffContent(
    discussion.id,
    selection.entryId,
    query,
    parsed,
    selection.filePath,
    t.discussions,
  );
  const { resolvedTheme } = useTheme();
  const settings = useEnvironmentSettings(environmentId);
  const options = useMemo(
    () =>
      ({
        diffStyle: settings.diffLayout === "split" ? "split" : "unified",
        lineDiffType: "none",
        overflow: settings.wordWrap ? "wrap" : "scroll",
        theme: resolveDiffThemeName(resolvedTheme),
        preferredHighlighter: PREFERRED_HIGHLIGHTER,
        themeType: resolvedTheme,
        stickyHeaders: true,
      }) satisfies StyledDiffCodeViewOptions<undefined>,
    [settings.diffLayout, settings.wordWrap, resolvedTheme],
  );
  const [viewer, setViewer] = useState<CodeViewHandle<undefined, undefined> | null>(null);
  const [foldState, setFoldState] = useState({ selection, ids: new Set<string>() });
  const files = parsed?.kind === "files" ? parsed.files : null;
  const selectedIndex = view.kind === "files" ? view.selectedIndex : -1;
  const items = useMemo(
    () =>
      (files ?? []).map((fileDiff, index): CodeViewDiffItem<undefined> => ({
        id: String(index),
        type: "diff",
        fileDiff,
        collapsed:
          foldState.ids.has(String(index)) &&
          (foldState.selection === selection || index !== selectedIndex),
      })),
    [files, foldState, selection, selectedIndex],
  );
  const ready = useMemo(
    () => items.filter((item) => !item.collapsed).map((item) => item.id),
    [items],
  );
  const reveal = useCodeViewFileReveal(viewer, selection, ready);
  useEffect(() => {
    if (selectedIndex < 0) return;
    const id = String(selectedIndex);
    // A fresh selection object also re-reveals the same row without closing the panel.
    reveal(id);
  }, [selectedIndex, reveal]);
  return (
    <DiffPanelShell
      mode={mode}
      header={
        <>
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{title}</span>
          <div className="shrink-0 [-webkit-app-region:no-drag]">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t.discussions.diff.close}
                    onClick={onClose}
                  />
                }
              >
                <XIcon />
              </TooltipTrigger>
              <TooltipPopup>{t.discussions.diff.close}</TooltipPopup>
            </Tooltip>
          </div>
        </>
      }
    >
      {view.kind === "loading" ? (
        <DiffPanelLoadingState label={view.label} />
      ) : view.kind === "error" ? (
        <div className="space-y-3 px-4 py-5">
          <p className="text-sm text-muted-foreground">{view.label}</p>
          <Button variant="outline" size="sm" onClick={query.refresh}>
            {t.discussions.diff.retry}
          </Button>
        </div>
      ) : view.kind === "empty" ? (
        <p className="px-4 py-5 text-sm text-muted-foreground">{view.label}</p>
      ) : view.kind === "raw" ? (
        <div className="min-h-0 flex-1 space-y-2 overflow-auto px-4 py-5">
          <p className="text-xs text-muted-foreground">{view.reason}</p>
          <pre className="whitespace-pre-wrap break-words font-mono text-xs">{view.text}</pre>
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          {view.notice ? (
            <p className="shrink-0 px-4 py-3 text-xs text-muted-foreground">{view.notice}</p>
          ) : null}
          <div className="min-h-0 flex-1">
            <StyledDiffCodeView
              className="@container h-full overflow-auto [scrollbar-gutter:stable]"
              viewerRef={setViewer}
              items={items}
              options={options}
              renderHeaderPrefix={(item) => (
                <Button
                  size="icon-micro"
                  variant="ghost-muted"
                  aria-expanded={!item.collapsed}
                  aria-label={item.collapsed ? t.git.diff.expandDiff : t.git.diff.collapseDiff}
                  onClick={() =>
                    setFoldState((current) => {
                      const next = new Set(current.ids);
                      if (current.selection !== selection) next.delete(String(selectedIndex));
                      if (item.collapsed) next.delete(item.id);
                      else next.add(item.id);
                      return { selection, ids: next };
                    })
                  }
                >
                  {item.collapsed ? <ChevronRightIcon /> : <ChevronDownIcon />}
                </Button>
              )}
              onRevealSearchMatch={(item) =>
                setFoldState((current) => {
                  const next = new Set(current.ids);
                  if (current.selection !== selection) next.delete(String(selectedIndex));
                  next.delete(item.id);
                  return { selection, ids: next };
                })
              }
            />
          </div>
        </div>
      )}
    </DiffPanelShell>
  );
}
