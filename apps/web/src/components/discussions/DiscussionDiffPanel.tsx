/** Displays one persisted statement in the H1/H2 slab, retaining the shared virtualized diff viewer. */
import type { CodeViewDiffItem } from "@pierre/diffs";
import type { CodeViewHandle } from "@pierre/diffs/react";
import type { Discussion, EnvironmentId } from "@t3tools/contracts";
import { useEffect, useState } from "react";
import { XIcon, ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { t } from "~/i18n";
import { useTheme } from "~/hooks/useTheme";
import { useEnvironmentSettings } from "~/hooks/useSettings";
import { getRenderablePatch, resolveDiffThemeName } from "~/lib/diffRendering";
import { PREFERRED_HIGHLIGHTER } from "~/lib/syntaxHighlighting";
import { serverEnvironment } from "~/state/server";
import { useEnvironmentQuery } from "~/state/query";
import { isElectron } from "~/env";
import { cn } from "~/lib/utils";
import { PixelSeat } from "./PixelSeat";
import { StyledDiffCodeView, type StyledDiffCodeViewOptions } from "../diffs/StyledDiffCodeView";
import { useCodeViewFileReveal } from "../diffs/useCodeViewFileReveal";
import { Button } from "../ui/button";
import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";
import {
  discussionDiffContent,
  discussionDiffTitle,
  type DiscussionDiffSelection,
} from "./discussionDiff.logic";

// H1 styles live inside Pierre's shadow root; the shared viewer still owns scrolling and search.
const DISCUSSION_DIFF_CSS = `
:host { --diffs-font-size: var(--text-secondary-copy); }
[data-diffs-header] {
  background-color: var(--color-discussion-diff-header) !important;
  border-radius: 0;
  box-shadow: var(--shadow-discussion-diff-header);
  padding-inline: calc(var(--spacing) * 1.5) calc(var(--spacing) * 2.5) !important;
}
[data-change-icon] { display: none; }
:is([data-diff], [data-file], [data-virtualizer-buffer]) {
  --diffs-grid-number-column-width: calc(var(--spacing) * 9);
}
[data-column-number] { padding-inline-end: calc(var(--spacing) * 1.5); }
[data-indicators="classic"] [data-line] { padding-inline-start: calc(var(--spacing) * 4.5); }
[data-indicators="classic"] [data-line]::before { width: calc(var(--spacing) * 4.5); }
`;

/**
 * Reads only the selected statement; the parent keys this component by environment/discussion/entry.
 * @param props.discussion Frozen seats resolve heading identity.
 * @param props.environmentId Destination environment for the read-only checkpoint diff query.
 * @param props.selection Persisted entry and requested current/previous file path.
 * @param props.mode Inline mounts in the frame slot; sheet uses the H2 modal host.
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
  mode: "inline" | "sheet";
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
  // Parsing and viewer collections must retain identity until their inputs change; compiler caching stops at the viewer boundary.
  const calculateParsed = () => getRenderablePatch(patch);
  const [parsedCache, setParsedCache] = useState(() => ({
    inputs: [patch] as const,
    value: calculateParsed(),
  }));
  let parsed = parsedCache.value;
  if (!Object.is(parsedCache.inputs[0], patch)) {
    parsed = calculateParsed();
    setParsedCache({ inputs: [patch] as const, value: parsed });
  }
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
  const options = {
    diffStyle: settings.diffLayout === "split" ? "split" : "unified",
    lineDiffType: "none",
    overflow: settings.wordWrap ? "wrap" : "scroll",
    theme: resolveDiffThemeName(resolvedTheme),
    preferredHighlighter: PREFERRED_HIGHLIGHTER,
    themeType: resolvedTheme,
    stickyHeaders: true,
  } satisfies StyledDiffCodeViewOptions<undefined>;
  const [viewer, setViewer] = useState<CodeViewHandle<undefined, undefined> | null>(null);
  const [foldState, setFoldState] = useState({ selection, ids: new Set<string>() });
  const files = parsed?.kind === "files" ? parsed.files : null;
  const selectedIndex = view.kind === "files" ? view.selectedIndex : -1;
  const calculateItems = () =>
    (files ?? []).map((fileDiff, index): CodeViewDiffItem<undefined> => ({
      id: String(index),
      type: "diff",
      fileDiff,
      collapsed:
        foldState.ids.has(String(index)) &&
        (foldState.selection === selection || index !== selectedIndex),
    }));
  const [itemsCache, setItemsCache] = useState(() => ({
    inputs: [files, foldState, selection, selectedIndex] as const,
    value: calculateItems(),
  }));
  let items = itemsCache.value;
  if (
    !Object.is(itemsCache.inputs[0], files) ||
    !Object.is(itemsCache.inputs[1], foldState) ||
    !Object.is(itemsCache.inputs[2], selection) ||
    !Object.is(itemsCache.inputs[3], selectedIndex)
  ) {
    items = calculateItems();
    setItemsCache({ inputs: [files, foldState, selection, selectedIndex] as const, value: items });
  }
  const calculateReady = () => items.filter((item) => !item.collapsed).map((item) => item.id);
  const [readyCache, setReadyCache] = useState(() => ({
    inputs: [items] as const,
    value: calculateReady(),
  }));
  let ready = readyCache.value;
  if (!Object.is(readyCache.inputs[0], items)) {
    ready = calculateReady();
    setReadyCache({ inputs: [items] as const, value: ready });
  }
  const reveal = useCodeViewFileReveal(viewer, selection, ready);
  useEffect(() => {
    if (selectedIndex < 0) return;
    const id = String(selectedIndex);
    // A fresh selection object also re-reveals the same row without closing the panel.
    reveal(id);
  }, [selectedIndex, reveal]);
  return (
    <aside
      aria-label={t.discussions.diff.panelTitle}
      className={cn(
        "discussion-diff-panel flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden rounded-slab",
        mode === "sheet"
          ? "surface-glass shadow-discussion-diff-overlay"
          : "bg-sidebar shadow-slab-frame",
      )}
    >
      <div
        className={cn(
          "flex h-13 min-h-(--workspace-topbar-height) shrink-0 items-center gap-2.5 pl-4.5 text-body",
          isElectron && mode !== "sheet" && "drag-region",
        )}
      >
        {seat ? (
          <PixelSeat
            role={seat.avatar}
            seatIndex={discussion.seats.indexOf(seat)}
            size={22}
            state="idle"
            label={seat.personaName}
          />
        ) : null}
        <span className="min-w-0 flex-1 truncate font-bold">{title}</span>
        <div className="no-drag shrink-0">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="secondary"
                  size="icon-toolbar"
                  aria-label={t.discussions.diff.close}
                  onClick={onClose}
                />
              }
            >
              <XIcon className="size-3.75" />
            </TooltipTrigger>
            <TooltipPopup>{t.discussions.diff.close}</TooltipPopup>
          </Tooltip>
        </div>
        <span
          aria-hidden="true"
          className={
            isElectron
              ? "ml-1.5 w-35 shrink-0 self-stretch wco:w-(--workspace-native-controls-inset)"
              : "w-2"
          }
        />
      </div>
      <div className="mx-2.5 mb-2.5 flex min-h-0 flex-1 flex-col overflow-hidden rounded-card-row bg-code shadow-discussion-diff-well text-secondary-copy-large text-shadow-none">
        {view.kind === "loading" ? (
          <div className="flex flex-col gap-2.5 p-4 text-muted-foreground" role="status">
            <span>{view.label}</span>
            <div aria-hidden="true" className="discussion-diff-skeleton flex flex-col gap-2.5">
              <span />
              <span />
              <span />
            </div>
          </div>
        ) : view.kind === "error" ? (
          <div className="space-y-3 p-4">
            <p role="alert" className="break-words">
              {view.label}
            </p>
            <Button variant="secondary" size="compact-padded" onClick={query.refresh}>
              {t.discussions.diff.retry}
            </Button>
          </div>
        ) : view.kind === "empty" ? (
          <p
            role="status"
            className="flex flex-1 items-center justify-center p-4 text-center text-muted-foreground"
          >
            {view.label}
          </p>
        ) : view.kind === "raw" ? (
          <div className="min-h-0 flex-1 space-y-2.5 overflow-auto p-3.5">
            <p className="text-muted-foreground">{t.discussions.diff.raw}</p>
            <pre className="whitespace-pre-wrap break-words font-mono text-meta-large text-code-foreground">
              {view.text}
            </pre>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            {view.notice ? (
              <p
                role="status"
                className="shrink-0 break-words px-3.5 py-2.5 text-secondary-copy text-muted-foreground"
              >
                {view.notice}
              </p>
            ) : null}
            <div className="min-h-0 flex-1">
              <StyledDiffCodeView
                discussion
                className="discussion-diff-view @container h-full overflow-auto"
                viewerRef={setViewer}
                items={items}
                options={options}
                unsafeCSSExtra={DISCUSSION_DIFF_CSS}
                renderHeaderPrefix={(item) => (
                  <Button
                    size="icon-stepper-key"
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
                    {item.collapsed ? (
                      <ChevronRightIcon className="size-3.75" />
                    ) : (
                      <ChevronDownIcon className="size-3.75" />
                    )}
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
      </div>
    </aside>
  );
}
