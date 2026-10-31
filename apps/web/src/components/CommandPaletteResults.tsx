/** Localized palette UI and interactions; preserves user data, commands, and protocol values. */
import { t } from "~/i18n";
import { type ResolvedKeybindingsConfig } from "@t3tools/contracts";
import { LegendList, type LegendListRef } from "@legendapp/list/react";
import { ChevronRightIcon, SearchXIcon } from "lucide-react";
import { type ReactNode, type RefObject, useState } from "react";
import { cn } from "~/lib/utils";
import { textDirection } from "~/textDirection";
import { shortcutLabelForCommand } from "../keybindings";
import {
  type CommandPaletteActionItem,
  type CommandPaletteGroup,
  type CommandPaletteRow,
  type CommandPaletteSubmenuItem,
} from "./CommandPalette.logic";
import {
  CommandCollection,
  CommandGroup,
  CommandGroupLabel,
  CommandItem,
  CommandList,
  CommandListHeading,
  CommandListVirtualized,
  CommandShortcut,
} from "./ui/command";
import { getVirtualizedScrollFadeClassName } from "./ui/scroll-area";
import { ProjectPinButton } from "./ProjectPinButton";
import { SearchMatchHintLine, ThreadSearchMatchExcerpt } from "./ThreadSearchMatch";

interface CommandPaletteResultsProps {
  emptyStateMessage?: string;
  groups: ReadonlyArray<CommandPaletteGroup>;
  highlightedItemValue?: string | null;
  isActionsOnly: boolean;
  keybindings: ResolvedKeybindingsConfig;
  onExecuteItem: (item: CommandPaletteActionItem | CommandPaletteSubmenuItem) => void;
}

/**
 * Renders the explicit empty message or the localized fallback for the current action filter.
 * @param props Component properties and callbacks defined by the parameter type.
 * @returns Rendered UI for the supplied props.
 */
function CommandPaletteEmptyState(props: { emptyStateMessage?: string; isActionsOnly: boolean }) {
  return (
    <div className="pn5-empty py-10 text-center text-sm text-muted-foreground">
      <span aria-hidden="true" className="pn5-empty-icon hidden">
        <SearchXIcon className="size-4.5" />
      </span>
      <span>
        {props.emptyStateMessage ??
          (props.isActionsOnly ? t.tools.palette.noActions : t.tools.palette.noCommands)}
      </span>
    </div>
  );
}

export function CommandPaletteResults(props: CommandPaletteResultsProps) {
  if (props.groups.length === 0) {
    return <CommandPaletteEmptyState {...props} />;
  }

  return (
    <CommandList>
      {props.groups.map((group) => (
        <CommandGroup items={group.items} key={group.value}>
          {group.label ? <CommandGroupLabel>{group.label}</CommandGroupLabel> : null}
          <CommandCollection>
            {(item) =>
              item.disabled ? (
                <DisabledCommandPaletteResultRow item={item} key={item.value} />
              ) : (
                <CommandPaletteResultRow
                  item={item}
                  key={item.value}
                  keybindings={props.keybindings}
                  isActive={props.highlightedItemValue === item.value}
                  onExecuteItem={props.onExecuteItem}
                />
              )
            }
          </CommandCollection>
        </CommandGroup>
      ))}
    </CommandList>
  );
}

export function scrollCommandPaletteRowIntoView(list: LegendListRef | null, rowIndex: number) {
  const element = list?.getState?.().elementAtIndex(rowIndex);
  if (element instanceof HTMLElement) {
    element.scrollIntoView({ block: "nearest" });
    return;
  }
  void list?.scrollIndexIntoView?.({ index: rowIndex, animated: false });
}

interface CommandPaletteVirtualizedResultsProps extends Omit<CommandPaletteResultsProps, "groups"> {
  rows: ReadonlyArray<CommandPaletteRow>;
  listRef: RefObject<LegendListRef | null>;
}

/** Pass flat items with virtualized to Command, scroll highlights via listRef, and handle Enter for
 * unmounted rows. */
export function CommandPaletteVirtualizedResults(props: CommandPaletteVirtualizedResultsProps) {
  const { listRef } = props;
  const [scrollFade, setScrollFade] = useState({ top: false, bottom: false });
  const updateScrollFade = () => {
    const scrollElement = listRef.current?.getScrollableNode?.();
    if (!(scrollElement instanceof HTMLElement)) return;
    const top = scrollElement.scrollTop > 1;
    const bottom =
      scrollElement.scrollHeight - scrollElement.clientHeight - scrollElement.scrollTop > 1;
    setScrollFade((current) =>
      current.top === top && current.bottom === bottom ? current : { top, bottom },
    );
  };

  if (props.rows.length === 0) {
    return <CommandPaletteEmptyState {...props} />;
  }

  return (
    <CommandListVirtualized>
      <LegendList<CommandPaletteRow>
        ref={listRef}
        data={props.rows}
        keyExtractor={(row) => row.key}
        getItemType={(row) => row.kind}
        extraData={props.highlightedItemValue}
        renderItem={({ item: row }) =>
          row.kind === "label" ? (
            <div className={row.first ? undefined : "pn5-group-gap pt-1.5"}>
              <CommandListHeading>{row.label}</CommandListHeading>
            </div>
          ) : row.itemIndex === null ? (
            <DisabledCommandPaletteResultRow item={row.item} />
          ) : (
            <CommandPaletteResultRow
              index={row.itemIndex}
              item={row.item}
              keybindings={props.keybindings}
              isActive={props.highlightedItemValue === row.item.value}
              onExecuteItem={props.onExecuteItem}
            />
          )
        }
        estimatedItemSize={46}
        drawDistance={400}
        onLayout={updateScrollFade}
        onScroll={updateScrollFade}
        contentContainerClassName="px-2"
        className={cn(
          "pn5-virtual-list min-h-0 scroll-py-6 overflow-x-hidden overscroll-y-contain py-2 [&::-webkit-scrollbar-track]:my-2",
          getVirtualizedScrollFadeClassName(scrollFade),
        )}
      />
    </CommandListVirtualized>
  );
}

/** Aligns icons to the first title line when a result also has a description or a content-match excerpt. */
export function CommandPaletteTitleIcon(props: { children: ReactNode }) {
  return <span className="flex h-5 shrink-0 items-center self-start pt-0.5">{props.children}</span>;
}

/** Preserves text direction and truncation for user-supplied titles. */
function CommandPaletteTitle({
  item,
}: {
  item: Pick<CommandPaletteActionItem | CommandPaletteSubmenuItem, "title">;
}) {
  const { title } = item;
  return (
    <span className="truncate" dir={typeof title === "string" ? textDirection(title) : undefined}>
      {title}
    </span>
  );
}

/**
 * Project and environment for a thread row whose second line shows a message
 * snippet or match hint instead, so similar rows can still be told apart.
 */
function ThreadRowContext({
  item,
}: {
  item: CommandPaletteActionItem | CommandPaletteSubmenuItem;
}) {
  if (!item.threadSearch || !(item.threadContentMatch || item.matchHint)) return null;
  // A "Project: …" hint already names the project.
  const context = [item.threadSearch.projectTitle, item.threadSearch.environmentLabel]
    .filter((part) => part && part !== item.matchHint?.text)
    .join(" · ");
  return context ? (
    <span className="max-w-[45%] shrink-0 truncate text-muted-foreground/70 text-xs">
      {context}
    </span>
  ) : null;
}

/** Shows unavailable entries without registering a selectable command or execution handler. */
function DisabledCommandPaletteResultRow(props: {
  item: CommandPaletteActionItem | CommandPaletteSubmenuItem;
}) {
  return (
    <div
      data-pn5-details={Boolean(props.item.description || props.item.threadContentMatch)}
      className="pn5-result flex min-h-8 select-none items-center gap-2 rounded-sm px-2 py-1.5 text-base opacity-64 sm:min-h-7 sm:text-sm"
    >
      <CommandPaletteTitleIcon>{props.item.icon}</CommandPaletteTitleIcon>
      {props.item.description || props.item.threadContentMatch ? (
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex min-w-0 items-center gap-1.5 text-sm text-foreground">
            {props.item.titleLeadingContent}
            <CommandPaletteTitle item={props.item} />
            <ThreadRowContext item={props.item} />
          </span>
          {props.item.threadContentMatch ? (
            <ThreadSearchMatchExcerpt match={props.item.threadContentMatch} />
          ) : props.item.matchHint ? (
            <SearchMatchHintLine hint={props.item.matchHint} />
          ) : props.item.description ? (
            <span className="min-w-0 text-muted-foreground/70 text-xs">
              {props.item.description}
            </span>
          ) : null}
        </span>
      ) : (
        <span className="flex min-w-0 flex-1 items-center gap-1.5 text-sm text-foreground">
          {props.item.titleLeadingContent}
          <CommandPaletteTitle item={props.item} />
        </span>
      )}
      {props.item.titleTrailingContent}
    </div>
  );
}

/**
 * Displays an available result while leaving command execution and submenu navigation to its owner.
 * @param props.index Optional item index supplied by the virtualized list for keyboard navigation.
 * @param props.item Action or submenu data to display and pass unchanged to the execution callback.
 * @param props.isActive Whether the owner currently highlights this result.
 * @param props.keybindings Resolved bindings used to display the item's shortcut, when configured.
 * @param props.onExecuteItem Called with the item on click; the owner handles execution and errors.
 * @returns A selectable row that preserves input focus on mouse down; keyboard execution stays with the parent.
 */
function CommandPaletteResultRow(props: {
  index?: number;
  item: CommandPaletteActionItem | CommandPaletteSubmenuItem;
  isActive: boolean;
  keybindings: ResolvedKeybindingsConfig;
  onExecuteItem: (item: CommandPaletteActionItem | CommandPaletteSubmenuItem) => void;
}) {
  const shortcutLabel = props.item.shortcutCommand
    ? shortcutLabelForCommand(props.keybindings, props.item.shortcutCommand)
    : null;

  return (
    <CommandItem
      data-pn5-details={Boolean(props.item.description || props.item.threadContentMatch)}
      data-pn5-project={props.item.value.startsWith("project:")}
      {...(props.index === undefined ? {} : { index: props.index })}
      value={props.item.value}
      active={props.isActive}
      onMouseDown={(event) => {
        event.preventDefault();
      }}
      onClick={() => {
        props.onExecuteItem(props.item);
      }}
    >
      <CommandPaletteTitleIcon>{props.item.icon}</CommandPaletteTitleIcon>
      {props.item.description || props.item.threadContentMatch ? (
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex min-w-0 items-center gap-1.5 text-sm text-foreground">
            {props.item.titleLeadingContent}
            <CommandPaletteTitle item={props.item} />
            <ThreadRowContext item={props.item} />
          </span>
          {props.item.threadContentMatch ? (
            <ThreadSearchMatchExcerpt match={props.item.threadContentMatch} />
          ) : props.item.matchHint ? (
            <SearchMatchHintLine hint={props.item.matchHint} />
          ) : props.item.description ? (
            <span className="min-w-0 text-muted-foreground/70 text-xs">
              {props.item.description}
            </span>
          ) : null}
        </span>
      ) : (
        <span className="flex min-w-0 flex-1 items-center gap-1.5 text-sm text-foreground">
          {props.item.titleLeadingContent}
          <CommandPaletteTitle item={props.item} />
        </span>
      )}
      {props.item.titleTrailingContent}
      {props.item.kind === "action" && props.item.pin ? (
        <ProjectPinButton
          name={props.item.pin.name}
          pinned={props.item.pin.pinned}
          onToggle={props.item.pin.toggle}
          shortcutLabel={shortcutLabelForCommand(props.keybindings, "thread.pin")}
        />
      ) : null}
      {props.item.timestamp ? (
        <span className="min-w-12 shrink-0 text-right text-xs tabular-nums text-muted-foreground/70">
          {props.item.timestamp}
        </span>
      ) : null}
      {shortcutLabel ? <CommandShortcut>{shortcutLabel}</CommandShortcut> : null}
      {props.item.kind === "submenu" ? (
        <ChevronRightIcon className="-me-0.5 ms-auto size-4 shrink-0 text-muted-foreground/70" />
      ) : null}
    </CommandItem>
  );
}
