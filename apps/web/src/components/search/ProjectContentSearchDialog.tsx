/** Localized search presentation and existing interaction behavior. */
import { t } from "~/i18n";
import { Spinner } from "~/components/ui/spinner";
import { AuthFilesystemReadScope, type ProjectContentMatch } from "@t3tools/contracts";

import { useState, type ReactNode } from "react";
import { CaseSensitive, ChevronDown, Regex, WholeWord } from "lucide-react";

import { useActiveProjectTarget, type ActiveProjectTarget } from "~/hooks/useActiveProjectTarget";
import { useRenderedAppearance } from "~/hooks/useTheme";
import { cn } from "~/lib/utils";
import { useRightPanelStore } from "~/rightPanelStore";
import { useProjectContentSearch } from "~/state/queries";
import { readEnvironmentScope } from "~/state/session";

import { ProjectContentSearchShell } from "./ProjectContentSearchShell";
import { ScrollArea } from "../ui/scroll-area";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { HighlightedSearchLine } from "./HighlightedSearchLine";

/** Dialog dismissal belongs to the shared palette owner. */
interface ProjectContentSearchDialogProps {
  readonly onOpenChange: (open: boolean) => void;
}

/** Syntax-highlighting all 500 result rows at once stalls the UI. */
const VISIBLE_MATCH_WINDOW = 100;

/** File group retaining original result indices for keyboard navigation across windows. */
interface MatchGroup {
  readonly path: string;
  readonly matches: ReadonlyArray<ProjectContentMatch & { readonly resultIndex: number }>;
}

/** Splits the server's slash-separated relative path for filename and directory labels. */
function splitPath(path: string): { readonly name: string; readonly directory: string } {
  const separator = path.lastIndexOf("/");
  return separator === -1
    ? { name: path, directory: "" }
    : { name: path.slice(separator + 1), directory: path.slice(0, separator) };
}

/** Groups visible matches in first-seen file order while preserving their search-result indices. */
function groupMatches(matches: ReadonlyArray<ProjectContentMatch>): MatchGroup[] {
  const groups = new Map<string, Array<ProjectContentMatch & { readonly resultIndex: number }>>();
  matches.forEach((match, resultIndex) => {
    const group = groups.get(match.path);
    const indexedMatch = { ...match, resultIndex };
    if (group) {
      group.push(indexedMatch);
    } else {
      groups.set(match.path, [indexedMatch]);
    }
  });
  return [...groups].map(([path, groupedMatches]) => ({ path, matches: groupedMatches }));
}

/** K6 compact toggle; native button semantics preserve Space/Enter and permission disabling. */
function SearchOptionButton(props: {
  readonly active: boolean;
  readonly disabled: boolean;
  readonly label: string;
  readonly onClick: () => void;
  readonly children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={props.label}
            disabled={props.disabled}
            aria-pressed={props.active}
            className="pn6-search-option flex size-6.5 shrink-0 items-center justify-center rounded-pn6-search-option text-muted-foreground outline-none hover:bg-secondary focus-visible:inset-shadow-focus disabled:pointer-events-none disabled:text-fg-control-disabled"
            onClick={props.onClick}
          />
        }
      >
        {props.children}
      </TooltipTrigger>
      <TooltipPopup side="top">{props.label}</TooltipPopup>
    </Tooltip>
  );
}

/** Renders the project-search shell with guidance to open a project before searching. */
function EmptyContentSearchDialog() {
  return (
    <ProjectContentSearchShell
      aria-label={t.tools.search.projectContents}
      inputProps={{ disabled: true, placeholder: t.tools.search.placeholder }}
      value=""
    >
      <p className="m-auto px-6 text-center text-muted-foreground text-sm">
        {t.tools.search.openProjectHint}
      </p>
    </ProjectContentSearchShell>
  );
}

/** Searches props' project with the current query/options and opens the selected result; shows permission, regex and empty-result states. */
const scrollSelectedRowIntoView = (row: HTMLElement | null) => {
  row?.scrollIntoView({ block: "nearest" });
};

/** Owns search and keyboard selection only while the dialog is open. */
function OpenContentSearchDialog(props: {
  readonly onOpenChange: (open: boolean) => void;
  readonly target: ActiveProjectTarget;
}) {
  const { target } = props;
  const renderedAppearance = useRenderedAppearance();
  const [query, setQuery] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const [visibleCount, setVisibleCount] = useState(VISIBLE_MATCH_WINDOW);

  const search = useProjectContentSearch({
    environmentId: target.environmentId,
    cwd: target.cwd,
    query,
    caseSensitive,
    wholeWord,
    useRegex,
  });
  const canOpenMatches = search.canReadFiles && !search.isPending && search.error === null;
  const matches = search.matches;
  const [resultsFor, setResultsFor] = useState(matches);
  if (resultsFor !== matches) {
    setResultsFor(matches);
    setSelectedIndex(0);
    setVisibleCount(VISIBLE_MATCH_WINDOW);
  }
  if (selectedIndex >= visibleCount) {
    setVisibleCount(selectedIndex + VISIBLE_MATCH_WINDOW);
  }
  const visibleMatches = matches.slice(0, visibleCount);
  const groups = groupMatches(visibleMatches);

  const observeLoadMoreSentinel = (sentinel: HTMLElement | null) => {
    if (!sentinel) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisibleCount((current) => current + VISIBLE_MATCH_WINDOW);
      }
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  };

  const openMatch = (match: ProjectContentMatch) => {
    if (!canOpenMatches || !readEnvironmentScope(target.environmentId, AuthFilesystemReadScope)) {
      return;
    }
    props.onOpenChange(false);
    useRightPanelStore.getState().openFile(target.threadRef, match.path, match.lineNumber);
  };
  const fileCount = new Set(matches.map((match) => match.path)).size;
  const showSearchStatus =
    search.canReadFiles &&
    (search.hasQuery || search.isPending || search.error !== null || search.invalidRegex);

  return (
    <ProjectContentSearchShell
      aria-label={t.tools.search.fileContents(target.projectName)}
      inputAccessory={
        <div className="flex shrink-0 items-center gap-1">
          <SearchOptionButton
            active={caseSensitive}
            disabled={!search.canReadFiles}
            label={t.tools.search.matchCase}
            onClick={() => setCaseSensitive((current) => !current)}
          >
            <CaseSensitive className="size-3.75" />
          </SearchOptionButton>
          <SearchOptionButton
            active={wholeWord}
            disabled={!search.canReadFiles}
            label={t.tools.search.wholeWord}
            onClick={() => setWholeWord((current) => !current)}
          >
            <WholeWord className="size-3.75" />
          </SearchOptionButton>
          <SearchOptionButton
            active={useRegex}
            disabled={!search.canReadFiles}
            label={t.tools.search.regularExpression}
            onClick={() => setUseRegex((current) => !current)}
          >
            <Regex className="size-3.75" />
          </SearchOptionButton>
        </div>
      }
      inputProps={{
        disabled: !search.canReadFiles,
        placeholder: t.tools.search.placeholder,
        onKeyDown: (event) => {
          if (event.key === "ArrowDown" && matches.length > 0) {
            event.preventDefault();
            setSelectedIndex((current) => (current + 1) % matches.length);
          } else if (event.key === "ArrowUp" && matches.length > 0) {
            event.preventDefault();
            setSelectedIndex((current) => (current - 1 + matches.length) % matches.length);
          } else if (event.key === "Enter") {
            if (!canOpenMatches) {
              event.preventDefault();
              return;
            }
            const match = matches[selectedIndex];
            if (match) {
              event.preventDefault();
              openMatch(match);
            }
          }
        },
      }}
      onValueChange={setQuery}
      value={query}
    >
      {showSearchStatus ? (
        <div
          role="status"
          className="flex shrink-0 items-center px-1.5 text-secondary-copy text-muted-foreground"
        >
          {search.isPending ? (
            <span className="flex items-center gap-2">
              <Spinner size="sm" />
              {t.tools.search.searching}
            </span>
          ) : search.error ? (
            <span className="text-destructive">{search.error}</span>
          ) : search.invalidRegex ? (
            <span className="text-destructive">{t.tools.search.invalidRegex}</span>
          ) : (
            t.tools.search.resultCount(
              matches.length.toLocaleString(),
              search.truncated,
              fileCount.toLocaleString(),
            )
          )}
        </div>
      ) : null}

      {matches.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-muted-foreground">
          {search.isCheckingAccess
            ? t.tools.search.checkingAccess
            : !search.canReadFiles
              ? search.error
              : search.hasQuery && !search.isPending && !search.error
                ? t.tools.search.noResults
                : t.tools.search.typeHint}
        </div>
      ) : (
        <ScrollArea className="min-h-0 flex-1" scrollFade>
          <div className="flex flex-col gap-0.5">
            {groups.map((group) => {
              const path = splitPath(group.path);
              return (
                <section className="flex flex-col gap-0.5" key={group.path}>
                  <div className="flex h-7 items-center gap-1.5 px-2 font-mono text-secondary-copy">
                    <ChevronDown className="size-3 shrink-0" />
                    {path.directory ? <span className="sr-only">{path.directory}/</span> : null}
                    <span className="truncate text-foreground">{path.name}</span>
                    <span className="ml-auto text-muted-foreground">{group.matches.length}</span>
                  </div>
                  {group.matches.map((match) => (
                    <button
                      type="button"
                      key={`${match.path}:${match.lineNumber}:${match.resultIndex}`}
                      ref={
                        match.resultIndex === selectedIndex ? scrollSelectedRowIntoView : undefined
                      }
                      className={cn(
                        "flex h-6.5 w-full min-w-0 items-center rounded-keycap pr-2 pl-6.5 text-left font-mono text-secondary-copy text-secondary-label outline-none hover:bg-secondary focus-visible:inset-shadow-focus disabled:pointer-events-none",
                        match.resultIndex === selectedIndex && "bg-secondary text-code-foreground",
                      )}
                      disabled={!canOpenMatches}
                      onMouseEnter={() => setSelectedIndex(match.resultIndex)}
                      onClick={() => openMatch(match)}
                    >
                      <span className="sr-only">{match.lineNumber}</span>
                      <span className="min-w-0 flex-1 truncate whitespace-pre">
                        <HighlightedSearchLine
                          match={match}
                          path={group.path}
                          theme={renderedAppearance}
                        />
                      </span>
                    </button>
                  ))}
                </section>
              );
            })}
            {matches.length > visibleCount ? (
              <div ref={observeLoadMoreSentinel} className="h-8" aria-hidden="true" />
            ) : null}
          </div>
        </ScrollArea>
      )}
    </ProjectContentSearchShell>
  );
}

/** Resolves the active workspace and resets search state when its environment or directory changes. */
export function ProjectContentSearchDialog(props: ProjectContentSearchDialogProps) {
  const target = useActiveProjectTarget();

  return target ? (
    <OpenContentSearchDialog
      key={`${target.environmentId}:${target.cwd}`}
      onOpenChange={props.onOpenChange}
      target={target}
    />
  ) : (
    <EmptyContentSearchDialog />
  );
}
