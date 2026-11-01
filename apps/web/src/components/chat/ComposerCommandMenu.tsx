/** Presents provider-driven composer suggestions; the composer owns filtering and keyboard selection. */
import { t } from "~/i18n";
import { formatProviderSkillDisplayName } from "@t3tools/shared/inlineSkills";
import type { ComposerPathSearchTarget } from "@t3tools/client-runtime/state/threads";
import {
  resolveProviderSkillSourceKind,
  type ProviderSkillSourceKind,
} from "@t3tools/client-runtime/providerSkills";
import {
  type ProjectEntry,
  type ProviderDriverKind,
  type PullRequestContextMetadata,
  type ScopedThreadRef,
  type ServerProviderSkill,
  type ServerProviderSlashCommand,
} from "@t3tools/contracts";
import {
  BlocksIcon,
  FolderIcon,
  MessagesSquareIcon,
  PackageIcon,
  SettingsIcon,
  UserRoundIcon,
  type LucideIcon,
} from "lucide-react";
import { Fragment, memo, useLayoutEffect, useRef } from "react";

import { type ComposerSlashCommand, type ComposerTriggerKind } from "../../composer-logic";
import { cn } from "~/lib/utils";
import { Badge } from "../ui/badge";
import { Command, CommandGroup, CommandItem, CommandList } from "../ui/command";
import { PierreEntryIcon } from "./PierreEntryIcon";
import { resolvePullRequestState } from "../pullRequest/pullRequestPresentation";

/** A selectable suggestion with the payload needed by the composer's existing insertion path. */
export type ComposerCommandItem =
  | {
      id: string;
      type: "path";
      path: string;
      pathKind: ProjectEntry["kind"];
      searchTarget: ComposerPathSearchTarget;
      label: string;
      description: string;
    }
  | {
      id: string;
      type: "slash-command";
      command: ComposerSlashCommand;
      label: string;
      description: string;
    }
  | {
      id: string;
      type: "provider-slash-command";
      provider: ProviderDriverKind;
      command: ServerProviderSlashCommand;
      label: string;
      description: string;
    }
  | {
      id: string;
      type: "skill";
      provider: ProviderDriverKind;
      skill: ServerProviderSkill;
      label: string;
      description: string;
    }
  | {
      id: string;
      type: "pull-request";
      pullRequest: PullRequestContextMetadata;
      label: string;
      description: string;
    }
  | {
      id: string;
      type: "thread";
      thread: ScopedThreadRef;
      label: string;
      description: string;
    };

/** Displays suggestions in their supplied order without taking focus from the editor. */
export const ComposerCommandMenu = memo(function ComposerCommandMenu(props: {
  listId: string;
  items: ComposerCommandItem[];
  resolvedTheme: "light" | "dark";
  isLoading: boolean;
  triggerKind: ComposerTriggerKind | null;
  emptyStateText?: string;
  activeItemId: string | null;
  onHighlightedItemChange: (itemId: string | null) => void;
  onSelect: (item: ComposerCommandItem) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- scrolls the highlighted menu item's DOM node into view
  useLayoutEffect(() => {
    if (!props.activeItemId || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(
      `[data-composer-item-id="${CSS.escape(props.activeItemId)}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [props.activeItemId]);

  return (
    <Command
      autoHighlight={false}
      mode="none"
      onItemHighlighted={(highlightedValue) => {
        props.onHighlightedItemChange(
          typeof highlightedValue === "string" ? highlightedValue : null,
        );
      }}
    >
      <div
        ref={listRef}
        className="composer-command-menu dropdown-glass relative flex min-h-0 w-80 max-w-full flex-col rounded-overlay"
        data-composer-command-drawer="true"
      >
        {props.items.length > 0 ? (
          <CommandList
            id={props.listId}
            aria-label={props.triggerKind ? LISTBOX_LABEL_BY_TRIGGER[props.triggerKind] : undefined}
            className="max-h-72 min-h-0"
          >
            <CommandGroup>
              <div className="flex flex-col gap-px">
                {props.items.map((item, index) => (
                  <Fragment key={item.id}>
                    {index === 0 ||
                    suggestionGroup(item) !== suggestionGroup(props.items[index - 1]!) ? (
                      <div className="composer-command-heading">{suggestionGroup(item)}</div>
                    ) : null}
                    <ComposerCommandMenuItem
                      optionId={composerSuggestionOptionId(props.listId, item.id)}
                      item={item}
                      triggerKind={props.triggerKind}
                      resolvedTheme={props.resolvedTheme}
                      isActive={props.activeItemId === item.id}
                      onHighlight={props.onHighlightedItemChange}
                      onSelect={props.onSelect}
                    />
                  </Fragment>
                ))}
              </div>
            </CommandGroup>
          </CommandList>
        ) : (
          <div className="px-4 py-3" role="status">
            <p className="text-secondary-label text-secondary-copy">
              {props.isLoading
                ? props.triggerKind === "skill"
                  ? t.composer.commandMenu.searchingSkills
                  : props.triggerKind === "pull-request"
                    ? t.composer.commandMenu.findingPullRequest
                    : t.composer.commandMenu.searchingPaths
                : (props.emptyStateText ??
                  (props.triggerKind === "skill"
                    ? t.composer.commandMenu.skillsEmpty
                    : props.triggerKind === "path"
                      ? t.composer.commandMenu.pathsEmpty
                      : t.composer.commandMenu.commandsEmpty))}
            </p>
          </div>
        )}
      </div>
    </Command>
  );
});

/** Renders one suggestion, retaining its payload, accessible option ID, and pointer behavior. */
const ComposerCommandMenuItem = memo(function ComposerCommandMenuItem(props: {
  optionId: string;
  item: ComposerCommandItem;
  triggerKind: ComposerTriggerKind | null;
  resolvedTheme: "light" | "dark";
  isActive: boolean;
  onHighlight: (itemId: string | null) => void;
  onSelect: (item: ComposerCommandItem) => void;
}) {
  const skillSourceKind =
    props.item.type === "skill" ? resolveProviderSkillSourceKind(props.item.skill) : null;
  const isSlashSkill =
    props.triggerKind === "slash-command" && props.item.type === "skill" ? props.item.skill : null;
  const pullRequestPresentation =
    props.item.type === "pull-request" ? resolvePullRequestState(props.item.pullRequest) : null;

  return (
    <CommandItem
      render={<div id={props.optionId} />}
      aria-selected={props.isActive}
      value={props.item.id}
      data-composer-item-id={props.item.id}
      active={props.isActive}
      onMouseMove={() => {
        if (!props.isActive) props.onHighlight(props.item.id);
      }}
      onMouseDown={(event) => {
        event.preventDefault();
      }}
      onClick={() => {
        props.onSelect(props.item);
      }}
    >
      {props.item.type === "path" ? (
        <PierreEntryIcon
          pathValue={props.item.path}
          kind={props.item.pathKind}
          theme={props.resolvedTheme}
        />
      ) : null}
      {props.item.type === "thread" ? (
        <MessagesSquareIcon aria-hidden="true" className="size-3.5 shrink-0" />
      ) : null}
      {pullRequestPresentation ? (
        <pullRequestPresentation.Icon
          role="img"
          aria-label={pullRequestPresentation.label}
          className="size-3.5 shrink-0"
        />
      ) : null}
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <span
          className={cn(
            "min-w-0 max-w-40 shrink truncate",
            props.item.type !== "thread" && props.item.type !== "pull-request" && "font-mono",
          )}
        >
          {isSlashSkill ? (
            <>
              <span className="text-secondary-label">/skill:</span>
              {formatProviderSkillDisplayName(isSlashSkill)}
            </>
          ) : (
            props.item.label
          )}
        </span>
        <span className="min-w-0 flex-1 truncate text-left text-secondary-label text-secondary-copy">
          {props.item.description}
        </span>
        {skillSourceKind ? (
          <SkillSourceBadge
            kind={skillSourceKind}
            showSkillSuffix={props.triggerKind === "skill"}
          />
        ) : null}
        {props.item.type === "slash-command" || props.item.type === "provider-slash-command" ? (
          <Badge variant="neutral" size="sm">
            {props.item.type === "slash-command"
              ? t.composer.commandMenu.appSource
              : t.composer.commandMenu.providerSource}
          </Badge>
        ) : null}
      </span>
    </CommandItem>
  );
});

/** Encodes arbitrary provider IDs into distinct editor/listbox option IDs, including lone surrogates. */
export function composerSuggestionOptionId(listId: string, itemId: string): string {
  // JSON escapes lone UTF-16 surrogates before URI encoding without losing identity.
  return `${listId}-${encodeURIComponent(JSON.stringify(itemId))}`;
}

const LISTBOX_LABEL_BY_TRIGGER: Record<ComposerTriggerKind, string> = {
  path: t.composer.commandMenu.pathsLabel,
  "pull-request": t.composer.commandMenu.pullRequestsLabel,
  "slash-command": t.composer.commandMenu.commandsLabel,
  skill: t.composer.commandMenu.skillsLabel,
};

const SKILL_SOURCE_ICON_BY_KIND: Record<ProviderSkillSourceKind, LucideIcon> = {
  app: BlocksIcon,
  repo: FolderIcon,
  project: FolderIcon,
  personal: UserRoundIcon,
  system: SettingsIcon,
  other: PackageIcon,
};

const SKILL_SOURCE_LABEL_BY_KIND: Record<ProviderSkillSourceKind, string> = {
  app: t.composer.commandMenu.appSource,
  repo: t.composer.commandMenu.repoSource,
  project: t.composer.commandMenu.projectSource,
  personal: t.composer.commandMenu.personalSource,
  system: t.composer.commandMenu.systemSource,
  other: t.composer.commandMenu.providerSource,
};

/** Chooses a heading without regrouping results, so editor keyboard order stays authoritative. */
function suggestionGroup(item: ComposerCommandItem): string {
  if (item.type === "skill") return t.composer.commandMenu.skillsLabel;
  if (item.type === "path" || item.type === "pull-request")
    return t.composer.commandMenu.filesAndPullRequests;
  if (item.type === "thread") return t.composer.commandMenu.threadsLabel;
  return t.composer.commandMenu.commandsLabel;
}

/** Shows the provider-reported skill source; unknown kinds retain the Provider label. */
function SkillSourceBadge(props: { kind: ProviderSkillSourceKind; showSkillSuffix: boolean }) {
  const Icon = SKILL_SOURCE_ICON_BY_KIND[props.kind];
  return (
    <Badge className="ms-auto" variant="neutral" size="sm">
      <Icon aria-hidden="true" />
      {SKILL_SOURCE_LABEL_BY_KIND[props.kind]}
      {props.showSkillSuffix ? t.composer.commandMenu.skillSuffix : null}
    </Badge>
  );
}
