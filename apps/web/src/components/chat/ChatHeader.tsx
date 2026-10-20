/** Publishes the chat breadcrumb and its route-owned action menu into the window titlebar. */
import { t } from "~/i18n";
import {
  AuthOrchestrationOperateScope,
  type ContextMenuItem,
  type EnvironmentId,
  type ThreadId,
} from "@t3tools/contracts";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentProject } from "@t3tools/client-runtime/state/shell";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import {
  ArchiveIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CircleCheckIcon,
  ClockIcon,
  CopyIcon,
  DownloadIcon,
  FolderIcon,
  GitBranchIcon,
  HashIcon,
  MailOpenIcon,
  MessageSquarePlusIcon,
  PencilIcon,
  PinIcon,
  PinOffIcon,
  PlusIcon,
  RefreshCwIcon,
  SettingsIcon,
  TimerIcon,
  TrashIcon,
} from "lucide-react";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  Fragment,
  type ReactNode,
  type RefObject,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { isTrailingDoubleClick } from "../Sidebar.logic";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { toastManager } from "../ui/toast";
import { useThreadActionMenu } from "~/hooks/useThreadActionMenu";
import { threadEnvironment } from "../../state/threads";
import { useOrchestrationCommand } from "../../state/use-orchestration-command";
import { readEnvironmentScope, useEnvironmentScope } from "../../state/session";
import { ProjectFavicon } from "../ProjectFavicon";
import {
  WorkspaceBreadcrumb,
  WorkspaceBreadcrumbItem,
  WorkspaceBreadcrumbSeparator,
  WorkspaceBreadcrumbText,
} from "../WorkspaceBreadcrumb";
import { observeResize } from "~/lib/observeResize";
import { useClientSettings } from "../../hooks/useSettings";
import { useTitlebarSlot } from "../frame/titlebarSlot";
import {
  Menu,
  MenuCreateHandle,
  MenuTrigger,
  MenuPopup,
  MenuItem,
  MenuCheckboxItem,
  MenuRadioGroup,
  MenuRadioItem,
  MenuRadioItemIndicator,
  MenuSeparator,
  MenuSub,
  MenuSubTrigger,
  MenuSubPopup,
} from "../ui/menu";
import type { ThreadActionMenuId } from "../threadActionMenu.logic";
import { buildTitlebarThreadMenuItems } from "./ChatHeader.logic";

/** Thread identity, navigation and existing controls owned by this chat route. */
interface ChatHeaderProps {
  activeThreadEnvironmentId: EnvironmentId;
  activeThreadId: ThreadId;
  activeThreadTitle: string;
  /** Draft titlebars show the project capsule and panel actions, without thread title chrome. */
  isServerThread: boolean;
  activeProject: EnvironmentProject | null;
  parentThreadLink: { threadId: ThreadId; title: string } | null;
  onOpenThread: (threadId: ThreadId) => void;
  actions: ReactNode;
  /** Full-width titlebar reference for details, including drafts without visible actions. */
  popoverAnchorRef: RefObject<HTMLElement | null>;
  onNewThreadInProject: () => void;
  onOpenProjectSettings?: (() => void) | undefined;
}

/**
 * Rename commit rule shared with the sidebar's inline rename: trim, reject
 * empty (the caller toasts), and skip the mutation when nothing changed.
 */
export function resolveRenameCommit(input: {
  readonly title: string;
  readonly originalTitle: string;
}): { action: "commit"; title: string } | { action: "reject-empty" } | { action: "noop" } {
  const trimmed = input.title.trim();
  if (trimmed.length === 0) return { action: "reject-empty" };
  if (trimmed === input.originalTitle) return { action: "noop" };
  return { action: "commit", title: trimmed };
}

const threadMenuIcons = {
  archive: ArchiveIcon,
  "circle-check": CircleCheckIcon,
  clock: ClockIcon,
  copy: CopyIcon,
  download: DownloadIcon,
  folder: FolderIcon,
  "git-branch": GitBranchIcon,
  hash: HashIcon,
  "mail-open": MailOpenIcon,
  "message-square-plus": MessageSquarePlusIcon,
  pencil: PencilIcon,
  pin: PinIcon,
  "pin-off": PinOffIcon,
  "refresh-cw": RefreshCwIcon,
  settings: SettingsIcon,
  timer: TimerIcon,
  trash: TrashIcon,
};

/** Renders H2 action rows; optional label and choice slots leave titlebar defaults intact. */
export function ThreadMenuItems({
  items,
  onSelect,
  renderLabel,
  radioChoices = false,
}: {
  items: readonly ContextMenuItem<ThreadActionMenuId>[];
  onSelect: (action: ThreadActionMenuId) => void;
  /** Sidebar supplies V2 labels; the titlebar keeps its existing icon labels. */
  renderLabel?: ((item: ContextMenuItem<ThreadActionMenuId>) => ReactNode) | undefined;
  /** V2 uses mutually exclusive choices with a trailing check. */
  radioChoices?: boolean;
}) {
  if (radioChoices && items.length > 0 && items.every((item) => item.checked !== undefined)) {
    return (
      <MenuRadioGroup value={items.find((item) => item.checked)?.id ?? ""}>
        {items.map((item) => (
          <MenuRadioItem
            key={item.id}
            value={item.id}
            disabled={item.disabled}
            onClick={() => onSelect(item.id)}
          >
            <span className="flex items-center gap-2.5">
              {renderLabel ? renderLabel(item) : item.label}
              {item.checked ? <MenuRadioItemIndicator /> : null}
            </span>
          </MenuRadioItem>
        ))}
      </MenuRadioGroup>
    );
  }
  return items.map((item) => {
    const Icon =
      item.icon && item.icon in threadMenuIcons
        ? threadMenuIcons[item.icon as keyof typeof threadMenuIcons]
        : null;
    const label = renderLabel ? (
      renderLabel(item)
    ) : (
      <>
        {Icon ? <Icon /> : null}
        <span>{item.label}</span>
      </>
    );
    return (
      <Fragment key={item.id}>
        {item.separatorBefore ? <MenuSeparator /> : null}
        {item.children ? (
          <MenuSub>
            <MenuSubTrigger disabled={item.disabled}>{label}</MenuSubTrigger>
            <MenuSubPopup>
              <ThreadMenuItems
                items={item.children}
                onSelect={onSelect}
                renderLabel={renderLabel}
                radioChoices={radioChoices}
              />
            </MenuSubPopup>
          </MenuSub>
        ) : item.checked !== undefined ? (
          <MenuCheckboxItem
            checked={item.checked}
            disabled={item.disabled}
            onCheckedChange={() => onSelect(item.id)}
          >
            {label}
          </MenuCheckboxItem>
        ) : (
          <MenuItem
            disabled={item.disabled}
            variant={item.destructive ? "destructive" : "default"}
            onClick={() => onSelect(item.id)}
          >
            {label}
          </MenuItem>
        )}
      </Fragment>
    );
  });
}

/** Keeps breadcrumb navigation, renaming and menu state in the route while portaling its chrome. */
export const ChatHeader = memo(function ChatHeader({
  activeThreadEnvironmentId,
  activeThreadId,
  activeThreadTitle,
  isServerThread,
  activeProject,
  parentThreadLink,
  onOpenThread,
  actions,
  popoverAnchorRef,
  onNewThreadInProject,
  onOpenProjectSettings,
}: ChatHeaderProps) {
  const activeProjectName = activeProject?.title;
  const activeProjectCwd = activeProject?.workspaceRoot ?? null;
  const interfaceFont = useClientSettings((settings) => settings.fontFamilySans);
  const [breadcrumbContainer, setBreadcrumbElement] = useState<HTMLDivElement | null>(null);
  // Keyboard-opened draft details have no action trigger. The persistent titlebar
  // supplies an anchor with usable width even while the actions slot is empty.
  const setBreadcrumbContainer = useCallback(
    (element: HTMLDivElement | null) => {
      setBreadcrumbElement(element);
      popoverAnchorRef.current = element?.closest<HTMLElement>("[data-window-titlebar]") ?? null;
    },
    [popoverAnchorRef],
  );
  const [collapseParentTitle, setCollapseParentTitle] = useState(false);
  const activeThreadRef = useMemo(
    () => scopeThreadRef(activeThreadEnvironmentId, activeThreadId),
    [activeThreadEnvironmentId, activeThreadId],
  );
  const canOperateThread = useEnvironmentScope(
    activeThreadEnvironmentId,
    AuthOrchestrationOperateScope,
  );
  const updateThreadMetadata = useOrchestrationCommand(threadEnvironment.updateMetadata, {
    reportFailure: false,
  });
  // Inline rename, keyed by thread: navigating away drops an in-progress
  // rename instead of committing stale text. Cleared on thread change (not
  // just hidden) so returning to the thread doesn't revive the old draft.
  const [renaming, setRenaming] = useState<{
    threadId: ThreadId;
    environmentId: EnvironmentId;
    title: string;
  } | null>(null);
  if (
    renaming !== null &&
    (renaming.threadId !== activeThreadId ||
      renaming.environmentId !== activeThreadEnvironmentId ||
      !canOperateThread)
  ) {
    setRenaming(null);
  }
  const renamingTitle =
    canOperateThread &&
    renaming?.threadId === activeThreadId &&
    renaming.environmentId === activeThreadEnvironmentId
      ? renaming.title
      : null;
  // Leaving rename swaps the input back for the title, which needs a fresh fit.
  const isRenamingTitle = renamingTitle !== null;
  useEffect(() => {
    const list = breadcrumbContainer?.querySelector("ol");
    if (!list || !parentThreadLink) return;
    // Measure the untruncated labels, including a collapsed parent's hidden
    // text, so expanding and collapsing never change the fit calculation.
    // Width-capped labels (the project) never grow, so their overflow is skipped.
    const measure = () => {
      const gap = Number.parseFloat(getComputedStyle(list).columnGap) || 0;
      const width = Array.from(list.children).reduce(
        (total, item) => {
          const label = item.querySelector('[data-slot="workspace-breadcrumb-text"]');
          const ellipsis = item.querySelector("[data-parent-breadcrumb-ellipsis]");
          return (
            total +
            (item.firstElementChild?.getBoundingClientRect().width ?? 0) +
            (label && getComputedStyle(label).maxWidth === "none"
              ? label.scrollWidth - label.clientWidth
              : 0) -
            (ellipsis?.getBoundingClientRect().width ?? 0)
          );
        },
        gap * (list.children.length - 1),
      );
      setCollapseParentTitle(width > list.clientWidth);
    };
    measure();
    const frame = requestAnimationFrame(measure);
    document.fonts.addEventListener("loadingdone", measure);
    const stopObserving = observeResize(list, measure);
    return () => {
      cancelAnimationFrame(frame);
      document.fonts.removeEventListener("loadingdone", measure);
      stopObserving();
    };
  }, [
    breadcrumbContainer,
    activeProjectName,
    activeThreadTitle,
    parentThreadLink,
    interfaceFont,
    isRenamingTitle,
  ]);
  const renameCommittedRef = useRef(false);
  const restoreTitleFocusRef = useRef(false);
  const startRename = useCallback(() => {
    if (
      !isServerThread ||
      !readEnvironmentScope(activeThreadEnvironmentId, AuthOrchestrationOperateScope)
    )
      return;
    renameCommittedRef.current = false;
    setRenaming({
      environmentId: activeThreadEnvironmentId,
      threadId: activeThreadId,
      title: activeThreadTitle,
    });
  }, [activeThreadEnvironmentId, activeThreadId, activeThreadTitle, isServerThread]);
  const commitRename = useCallback(
    (title: string) => {
      setRenaming(null);
      if (!readEnvironmentScope(activeThreadEnvironmentId, AuthOrchestrationOperateScope)) return;
      const resolution = resolveRenameCommit({ title, originalTitle: activeThreadTitle });
      if (resolution.action === "reject-empty") {
        toastManager.add({ type: "warning", title: t.chat.header.emptyTitleError });
        return;
      }
      if (resolution.action === "noop") return;
      void updateThreadMetadata({
        environmentId: activeThreadEnvironmentId,
        input: { threadId: activeThreadId, title: resolution.title },
      }).then((result) => {
        if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
          const error = squashAtomCommandFailure(result);
          toastManager.add({
            type: "error",
            title: t.chat.header.renameError,
            description: error instanceof Error ? error.message : t.chat.header.genericError,
          });
        }
      });
    },
    [activeThreadEnvironmentId, activeThreadId, activeThreadTitle, updateThreadMetadata],
  );
  const [menuHandle] = useState(MenuCreateHandle);
  const [menu, setMenu] = useState<{
    items: readonly ContextMenuItem<ThreadActionMenuId>[];
    position: { x: number; y: number };
  } | null>(null);
  const menuResolutionRef = useRef<((action: ThreadActionMenuId | null) => void) | null>(null);
  const finishMenu = useCallback((action: ThreadActionMenuId | null = null) => {
    const resolve = menuResolutionRef.current;
    menuResolutionRef.current = null;
    setMenu(null);
    resolve?.(action);
  }, []);
  const menuPresenter = useMemo(
    () => ({
      show: (
        items: readonly ContextMenuItem<ThreadActionMenuId>[],
        position: { x: number; y: number },
      ) => {
        finishMenu();
        return new Promise<ThreadActionMenuId | null>((resolve) => {
          menuResolutionRef.current = resolve;
          setMenu({
            items: buildTitlebarThreadMenuItems(items, {
              "copy-path": t.chat.header.copyPath,
              "copy-branch": t.chat.header.copyBranch,
              "copy-thread-id": t.chat.header.copyThreadId,
            }),
            position,
          });
        });
      },
      close: () => finishMenu(),
    }),
    [finishMenu],
  );
  // Resolve a pending selection on navigation so it cannot mutate the previous thread.
  useEffect(() => () => finishMenu(), [activeThreadEnvironmentId, activeThreadId, finishMenu]);
  const menuAnchor = useMemo(
    () => ({
      getBoundingClientRect: () =>
        DOMRect.fromRect({ x: menu?.position.x ?? 0, y: menu?.position.y ?? 0 }),
    }),
    [menu?.position.x, menu?.position.y],
  );
  const { openMenu, closeMenu } = useThreadActionMenu({
    threadRef: isServerThread ? activeThreadRef : null,
    projectCwd: activeProjectCwd,
    onStartRename: startRename,
    menuPresenter,
  });
  const titleButtonRef = useRef<HTMLButtonElement | null>(null);
  const openTitleMenuNow = useCallback(() => {
    const rect = titleButtonRef.current?.getBoundingClientRect();
    if (!rect) return;
    openMenu({ x: rect.left, y: rect.bottom });
  }, [openMenu]);
  const openMenuFromTitle = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      if (isTrailingDoubleClick(event.detail)) return;
      if (menu) closeMenu();
      else openTitleMenuNow();
    },
    [closeMenu, menu, openTitleMenuNow],
  );
  const handleTitleDoubleClick = useCallback(
    (event: ReactMouseEvent) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      // The chevron is the explicit menu affordance; only the title text renames.
      if ((event.target as HTMLElement).closest("[data-thread-title-chevron]") !== null) return;
      closeMenu();
      startRename();
    },
    [closeMenu, startRename],
  );
  const handleHeaderContextMenu = useCallback(
    (event: ReactMouseEvent | MouseEvent) => {
      if (renamingTitle !== null) return;
      if (!isServerThread && onOpenProjectSettings === undefined) return;
      event.preventDefault();
      if (!isServerThread) {
        void menuPresenter
          .show(
            [{ id: "project-settings", label: t.chat.header.projectSettings, icon: "settings" }],
            {
              x: event.clientX,
              y: event.clientY,
            },
          )
          .then((action) => {
            if (action === "project-settings") onOpenProjectSettings?.();
          });
        return;
      }
      openMenu({ x: event.clientX, y: event.clientY });
    },
    [isServerThread, menuPresenter, onOpenProjectSettings, openMenu, renamingTitle],
  );
  // Right-clicks from the title/project no-drag slots bubble to the titlebar.
  // Electron handles blank drag areas through the OS, as it did before the redesign.
  useEffect(() => {
    const titlebar = breadcrumbContainer?.closest<HTMLElement>("[data-window-titlebar]");
    if (!titlebar) return;
    titlebar.addEventListener("contextmenu", handleHeaderContextMenu);
    return () => titlebar.removeEventListener("contextmenu", handleHeaderContextMenu);
  }, [breadcrumbContainer, handleHeaderContextMenu]);
  const handleRenameKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLInputElement>) => {
      if (event.nativeEvent.isComposing || event.keyCode === 229) return;
      if (event.key === "Enter") {
        restoreTitleFocusRef.current = true;
        renameCommittedRef.current = true;
        commitRename(event.currentTarget.value);
      } else if (event.key === "Escape") {
        restoreTitleFocusRef.current = true;
        renameCommittedRef.current = true;
        setRenaming(null);
      }
    },
    [commitRename],
  );
  const breadcrumb = (
    <div
      ref={setBreadcrumbContainer}
      className="chat-titlebar-breadcrumb flex min-w-0 items-center"
    >
      <WorkspaceBreadcrumb ariaLabel={t.chat.header.breadcrumb} className="min-w-0 flex-1">
        {/* The project always leads the header: knowing which project a
            thread lives in is priority zero, and the thread title alone
            doesn't answer it. */}
        {activeProject ? (
          <>
            <WorkspaceBreadcrumbItem className="shrink-0">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      aria-label={t.chat.header.newThread(activeProjectName)}
                      onClick={onNewThreadInProject}
                      className="inline-flex h-8 min-w-0 max-w-full cursor-pointer items-center gap-2 rounded-full bg-popover pr-3 pl-1.5 text-control font-semibold text-chat-project-label shadow-raise-xs-control outline-none hover:bg-chat-title-hover focus-visible:inset-shadow-focus"
                    />
                  }
                >
                  <ProjectFavicon
                    project={activeProject}
                    className="size-5 rounded-project-mark shadow-chat-project-mark"
                  />
                  <WorkspaceBreadcrumbText className="max-w-40">
                    {activeProjectName}
                  </WorkspaceBreadcrumbText>
                  <span
                    aria-hidden
                    className="flex size-4.5 shrink-0 items-center justify-center rounded-full bg-secondary text-chat-project-label"
                  >
                    <PlusIcon className="size-3" strokeWidth={2.5} />
                  </span>
                </TooltipTrigger>
                <TooltipPopup side="top">{t.chat.header.newThread(activeProjectName)}</TooltipPopup>
              </Tooltip>
            </WorkspaceBreadcrumbItem>
            {isServerThread ? (
              <WorkspaceBreadcrumbSeparator className="text-chat-crumb-separator">
                <ChevronRightIcon className="size-4" />
              </WorkspaceBreadcrumbSeparator>
            ) : null}
          </>
        ) : null}
        {isServerThread && parentThreadLink ? (
          <>
            <WorkspaceBreadcrumbItem>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      aria-label={t.chat.header.openParentThread(parentThreadLink.title)}
                      onClick={() => onOpenThread(parentThreadLink.threadId)}
                      className="inline-flex h-8 min-w-0 max-w-full cursor-pointer items-center rounded-full px-3 font-serif text-chat-title font-bold text-secondary-label outline-none hover:bg-chat-title-hover focus-visible:inset-shadow-focus"
                    />
                  }
                >
                  <WorkspaceBreadcrumbText
                    aria-hidden
                    className={collapseParentTitle ? "w-0" : undefined}
                  >
                    {parentThreadLink.title}
                  </WorkspaceBreadcrumbText>
                  {collapseParentTitle ? (
                    <span aria-hidden data-parent-breadcrumb-ellipsis>
                      ...
                    </span>
                  ) : null}
                </TooltipTrigger>
                <TooltipPopup side="top">{parentThreadLink.title}</TooltipPopup>
              </Tooltip>
            </WorkspaceBreadcrumbItem>
            <WorkspaceBreadcrumbSeparator className="text-chat-crumb-separator">
              <ChevronRightIcon className="size-4" />
            </WorkspaceBreadcrumbSeparator>
          </>
        ) : null}
        {isServerThread ? (
          <WorkspaceBreadcrumbItem current className="min-w-10 flex-1">
            {renamingTitle !== null ? (
              <input
                autoFocus
                aria-label={t.chat.header.threadTitle}
                className="h-8 min-w-0 flex-1 rounded-full bg-input px-3 font-serif text-chat-title font-bold text-foreground shadow-well-control outline-none focus:inset-shadow-focus"
                defaultValue={renamingTitle}
                onBlur={(event) => {
                  if (renameCommittedRef.current) return;
                  // Focus landing on a navigation button means the rename was
                  // abandoned — discard it rather than persisting a half-draft.
                  if (
                    event.relatedTarget instanceof HTMLElement &&
                    event.relatedTarget.closest("button")
                  ) {
                    setRenaming(null);
                    return;
                  }
                  commitRename(event.currentTarget.value);
                }}
                onFocus={(event) => event.currentTarget.select()}
                onKeyDown={handleRenameKeyDown}
              />
            ) : (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <MenuTrigger
                      handle={menuHandle}
                      render={
                        <button className="group/thread-title inline-flex h-8 min-w-0 max-w-full cursor-pointer items-center gap-1.5 rounded-full px-3 text-left font-serif text-chat-title font-bold text-foreground outline-none hover:bg-chat-title-hover focus-visible:inset-shadow-focus" />
                      }
                      onMouseDown={(event) => event.preventBaseUIHandler()}
                      onClick={(event) => {
                        // The route presenter owns async action discovery and the open state.
                        event.preventBaseUIHandler();
                        openMenuFromTitle(event);
                      }}
                      ref={(button) => {
                        titleButtonRef.current = button;
                        if (button && restoreTitleFocusRef.current) {
                          restoreTitleFocusRef.current = false;
                          button.focus();
                        }
                      }}
                      type="button"
                      aria-label={t.chat.header.threadActions(activeThreadTitle)}
                      aria-haspopup="menu"
                      aria-expanded={menu !== null}
                      onDoubleClick={canOperateThread ? handleTitleDoubleClick : undefined}
                    />
                  }
                >
                  <span className="min-w-0">
                    <WorkspaceBreadcrumbText>{activeThreadTitle}</WorkspaceBreadcrumbText>
                  </span>
                  <span
                    aria-hidden
                    data-thread-title-chevron
                    className="shrink-0 text-secondary-label"
                  >
                    <ChevronDownIcon className="size-3.75" />
                  </span>
                </TooltipTrigger>
                <TooltipPopup side="top">{activeThreadTitle}</TooltipPopup>
              </Tooltip>
            )}
          </WorkspaceBreadcrumbItem>
        ) : null}
      </WorkspaceBreadcrumb>
    </div>
  );
  const slots = useTitlebarSlot({
    breadcrumb,
    // Drafts keep the panel well too, so files and the terminal open before the first send.
    actions: <div className="flex h-(--workspace-topbar-height) items-center">{actions}</div>,
  });
  return (
    <>
      {slots}
      {/* The detached title trigger registers the root node across the titlebar portal. */}
      <Menu
        handle={menuHandle}
        open={menu !== null}
        onOpenChange={(open) => {
          if (!open) finishMenu();
        }}
        modal={false}
      >
        {menu ? (
          <MenuPopup
            anchor={menuAnchor}
            align="start"
            sideOffset={4}
            finalFocus={() => titleButtonRef.current}
          >
            <ThreadMenuItems items={menu.items} onSelect={finishMenu} />
          </MenuPopup>
        ) : null}
      </Menu>
    </>
  );
});
