/** Thread terminal chrome and Ghostty surfaces; session ownership and layout persist outside the drawer. */
import { t } from "~/i18n";
import { useAtomValue } from "@effect/atom-react";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import {
  INITIAL_TERMINAL_OUTPUT_CURSOR,
  readTerminalOutputUpdate,
  type TerminalOutputCursor,
  type TerminalOutputUpdate,
  type TerminalSessionState,
} from "@t3tools/client-runtime/state/terminal";
import {
  ArrowDown,
  Plus,
  SquareSplitHorizontal,
  SquareSplitVertical,
  SquareTerminal,
  X,
} from "lucide-react";
import {
  AuthPreviewOperateScope,
  AuthOrchestrationOperateScope,
  AuthTerminalOperateScope,
  type ContextMenuItem,
  type ProviderInstanceId,
  type ResolvedKeybindingsConfig,
  type ScopedThreadRef,
  type ThreadId,
} from "@t3tools/contracts";
import { getTerminalLabel, resolveTerminalSessionLabel } from "@t3tools/shared/terminalLabels";
import * as Schema from "effect/Schema";
import {
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type SetStateAction,
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Popover, PopoverPopup, PopoverTrigger } from "~/components/ui/popover";
import { Button } from "~/components/ui/button";
import { stackedThreadToast, toastManager } from "~/components/ui/toast";
import { readTextFromClipboard, writeTextToClipboard } from "~/hooks/useCopyToClipboard";
import { cn } from "~/lib/utils";
import { type TerminalContextSelection } from "~/lib/terminalContext";
import {
  observeSelectionActions,
  resolveSelectionActionPosition,
  type SelectionActionPoint,
} from "~/lib/selectionActions";
import {
  GhosttyTerminalSurface,
  type GhosttyTerminalSurfaceOptions,
} from "~/terminal/ghostty/surface";
import { type GhosttyColor, type GhosttyTheme } from "~/terminal/ghostty/core";
import {
  useTerminalContextMenu,
  type TerminalContextMenuAction,
} from "~/terminal/TerminalContextMenu";
import { useOpenInPreferredEditor } from "../editorPreferences";
import { resolvePathLinkTarget } from "@t3tools/shared/fileLinks";
import { isTerminalUrl } from "../terminal-links";
import {
  isDiffToggleShortcut,
  isTerminalClearShortcut,
  isTerminalNewShortcut,
  isTerminalSplitShortcut,
  isTerminalSplitVerticalShortcut,
  isTerminalToggleShortcut,
  terminalDeleteShortcutData,
  terminalNavigationShortcutData,
} from "../keybindings";
import {
  DEFAULT_THREAD_TERMINAL_HEIGHT,
  MAX_TERMINALS_PER_GROUP,
  type ThreadTerminalGroup,
} from "../types";
import { readLocalApi } from "~/localApi";
import { confirmTerminalClose } from "~/lib/terminalCloseConfirm";
import { useClientSettings } from "../hooks/useSettings";
import { useResizeDrag } from "../hooks/useResizeDrag";
import { isPhysicsEnabled } from "../lib/motion/preference";
import { useTerminalUiStateStore } from "../terminalUiStateStore";
import { useLocalStorage } from "../hooks/useLocalStorage";
import { useAttachedTerminalSession, useKnownTerminalSessions } from "../state/terminalSessions";
import { serverEnvironment } from "../state/server";
import { previewEnvironment } from "../state/preview";
import { readEnvironmentScope } from "../state/session";
import { terminalEnvironment } from "../state/terminal";
import { useEnvironmentScope } from "../state/session";
import { openTerminalLinkInPreview } from "./preview/openTerminalLinkInPreview";
import { collapseThreadDetailsCard } from "./chat/ThreadDetailsCard";
import { useAtomCommand } from "../state/use-atom-command";
import { preventTerminalCloseShortcut } from "../lib/terminalCloseShortcut";
import {
  resolveTerminalFontPreference,
  resolveTerminalFontSizePreference,
  TYPOGRAPHY_ADVANCED_STORAGE_KEY,
} from "../appearanceFonts";

const MIN_DRAWER_HEIGHT = 180;
const MAX_DRAWER_HEIGHT_RATIO = 0.75;

function maxDrawerHeight(): number {
  if (typeof window === "undefined") return DEFAULT_THREAD_TERMINAL_HEIGHT;
  return Math.max(MIN_DRAWER_HEIGHT, Math.floor(window.innerHeight * MAX_DRAWER_HEIGHT_RATIO));
}

function clampDrawerHeight(height: number, maxHeight = maxDrawerHeight()): number {
  const safeHeight = Number.isFinite(height) ? height : DEFAULT_THREAD_TERMINAL_HEIGHT;
  return Math.min(Math.max(Math.round(safeHeight), MIN_DRAWER_HEIGHT), maxHeight);
}

function writeSystemMessage(terminal: GhosttyTerminalSurface, message: string): void {
  terminal.write(`\r\n[terminal] ${message}\r\n`);
}

export function writeTerminalOutputUpdate(
  terminal: Pick<GhosttyTerminalSurface, "resetAndWrite" | "write">,
  update: TerminalOutputUpdate,
): void {
  if (update.type === "reset") {
    terminal.resetAndWrite(update.data);
  } else if (update.type === "append") {
    terminal.write(update.data);
  }
}

export function synchronizeTerminalOutput(
  terminal: Pick<GhosttyTerminalSurface, "resetAndWrite" | "write" | "clearSelection">,
  session: Pick<TerminalSessionState, "output" | "version">,
  cursor: TerminalOutputCursor,
): TerminalOutputCursor {
  if (session.version === 0) return cursor;
  const update = readTerminalOutputUpdate(session.output, cursor);
  writeTerminalOutputUpdate(terminal, update);
  terminal.clearSelection();
  return update.cursor;
}

function parseTerminalColor(value: string, fallback: GhosttyColor): GhosttyColor {
  if (typeof document === "undefined") return fallback;

  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return fallback;

  context.clearRect(0, 0, 1, 1);
  context.fillStyle = value;
  context.fillRect(0, 0, 1, 1);
  const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
  if (alpha === 0) return fallback;

  return {
    r: red ?? fallback.r,
    g: green ?? fallback.g,
    b: blue ?? fallback.b,
  };
}

function hexToGhosttyColor(hex: string): GhosttyColor {
  const value = Number.parseInt(hex.slice(1), 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

// VS Code's default ANSI colors.
const TERMINAL_PALETTES = {
  light: [
    "#000000",
    "#cd3131",
    "#107c10",
    "#949800",
    "#0451a5",
    "#bc05bc",
    "#0598bc",
    "#555555",
    "#666666",
    "#cd3131",
    "#14ce14",
    "#b5ba00",
    "#0451a5",
    "#bc05bc",
    "#0598bc",
    "#a5a5a5",
  ].map(hexToGhosttyColor),
  dark: [
    "#000000",
    "#cd3131",
    "#0dbc79",
    "#e5e510",
    "#2472c8",
    "#bc3fbc",
    "#11a8cd",
    "#e5e5e5",
    "#666666",
    "#f14c4c",
    "#23d18b",
    "#f5f543",
    "#3b8eea",
    "#d670d6",
    "#29b8db",
    "#e5e5e5",
  ].map(hexToGhosttyColor),
};

function runtimeEnvSignature(runtimeEnv: Record<string, string> | undefined): string {
  if (!runtimeEnv) return "";
  return JSON.stringify(
    Object.entries(runtimeEnv)
      .filter(([key, value]) => key.length > 0 && typeof value === "string")
      .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey)),
  );
}

function normalizeComputedColor(value: string | null | undefined, fallback: string): string {
  const normalizedValue = value?.trim().toLowerCase();
  if (
    !normalizedValue ||
    normalizedValue === "transparent" ||
    normalizedValue === "rgba(0, 0, 0, 0)" ||
    normalizedValue === "rgba(0 0 0 / 0)"
  ) {
    return fallback;
  }
  return value ?? fallback;
}

function readThemeColor(styles: CSSStyleDeclaration, variable: string, fallback: string): string {
  return normalizeComputedColor(styles.getPropertyValue(variable), fallback);
}

/** The surface treats an omitted family or size as "use the built-in default". */
function terminalFontOptions(family: string, size: number): { family?: string; size: number } {
  const trimmed = family.trim();
  return trimmed.length > 0 ? { family: trimmed, size } : { size };
}

export function terminalThemeFromApp(mountElement?: HTMLElement | null): GhosttyTheme {
  const drawerSurface =
    mountElement?.closest("[data-thread-terminal-drawer]") ??
    document.querySelector("[data-thread-terminal-drawer]") ??
    document.body;
  const drawerStyles = getComputedStyle(drawerSurface);
  const themeStyles = mountElement ? getComputedStyle(mountElement) : drawerStyles;
  const colorScheme = themeStyles.colorScheme;
  const isDark =
    colorScheme === "dark"
      ? true
      : colorScheme === "light"
        ? false
        : document.documentElement.classList.contains("dark");
  const fallbackBackground = isDark ? "rgb(14, 18, 24)" : "rgb(255, 255, 255)";
  const fallbackForeground = isDark ? "rgb(237, 241, 247)" : "rgb(28, 33, 41)";
  const bodyStyles = getComputedStyle(document.body);
  const rootThemeStyles = getComputedStyle(document.documentElement);
  const background = normalizeComputedColor(
    drawerStyles.backgroundColor,
    normalizeComputedColor(bodyStyles.backgroundColor, fallbackBackground),
  );
  const foreground = normalizeComputedColor(
    drawerStyles.color,
    normalizeComputedColor(bodyStyles.color, fallbackForeground),
  );
  const terminalBackground = readThemeColor(
    themeStyles,
    "--terminal-background",
    readThemeColor(rootThemeStyles, "--terminal-background", background),
  );
  const terminalForeground = readThemeColor(
    themeStyles,
    "--terminal-foreground",
    readThemeColor(rootThemeStyles, "--terminal-foreground", foreground),
  );
  const terminalCursor = readThemeColor(
    themeStyles,
    "--terminal-cursor",
    isDark ? "rgb(180, 203, 255)" : "rgb(38, 56, 78)",
  );
  const terminalSelection = readThemeColor(
    themeStyles,
    "--terminal-selection-background",
    isDark ? "rgba(180, 203, 255, 0.25)" : "rgba(37, 63, 99, 0.2)",
  );
  return {
    background: parseTerminalColor(
      terminalBackground,
      isDark ? { r: 14, g: 18, b: 24 } : { r: 255, g: 255, b: 255 },
    ),
    foreground: parseTerminalColor(
      terminalForeground,
      isDark ? { r: 237, g: 241, b: 247 } : { r: 28, g: 33, b: 41 },
    ),
    cursor: parseTerminalColor(
      terminalCursor,
      isDark ? { r: 180, g: 203, b: 255 } : { r: 38, g: 56, b: 78 },
    ),
    palette: TERMINAL_PALETTES[isDark ? "dark" : "light"],
    selectionBackground: terminalSelection,
  };
}

export function terminalSelectionLineRange(position: {
  start: { y: number };
  end: { y: number };
}): { lineStart: number; lineEnd: number } {
  const lineStart = position.start.y + 1;
  return {
    lineStart,
    lineEnd: Math.max(lineStart, position.end.y + 1),
  };
}

/** K1 keeps Add to chat visible but disabled when this viewport has no chat target. */
export function terminalSelectionMenuItems(options?: {
  canAddToChat?: boolean;
}): ContextMenuItem<"add-to-chat" | "copy">[] {
  return [
    {
      id: "add-to-chat",
      label: t.tools.terminal.addToChat,
      ...(options?.canAddToChat === false ? { disabled: true } : {}),
    },
    { id: "copy", label: t.common.threadActions.copy },
  ];
}

/**
 * Right-click menu for selection, clipboard, and local scrollback actions.
 * Paste is always offered: the browser
 * (and Electron's default editing menu) can only paste into an editable
 * element, so a canvas terminal never gets a usable entry from them.
 */
export function terminalContextMenuItems(options: {
  hasSelection: boolean;
  canAddToChat?: boolean;
  readOnly?: boolean;
}): ContextMenuItem<TerminalContextMenuAction>[] {
  const { hasSelection, canAddToChat = true } = options;
  return [
    ...terminalSelectionMenuItems({ canAddToChat }).map((item) => ({
      ...item,
      disabled: item.disabled || !hasSelection,
    })),
    { id: "paste", label: t.tools.terminal.paste, ...(options.readOnly ? { disabled: true } : {}) },
    { id: "select-all", label: t.tools.terminal.selectAll },
    { id: "scroll-to-bottom", label: t.tools.terminal.jumpToLatest },
  ];
}

/**
 * An empty selection change may only cancel a selection-action flow that is
 * still current: a pending popup timer, or an open popup whose request id has
 * not been superseded. A popup already superseded by a right-click keeps its
 * menu promise unsettled for a moment; treating it as active would cancel the
 * newer context-menu flow instead.
 */
export function shouldClearTerminalSelectionAction(options: {
  actionPending: boolean;
  openMenuRequestId: number | null;
  currentRequestId: number;
}): boolean {
  return options.actionPending || options.openMenuRequestId === options.currentRequestId;
}

export function shouldHandleTerminalExit(
  current: TerminalSessionState["status"],
  synchronized: TerminalSessionState["status"],
  alreadyHandled: boolean,
  version: number,
): boolean {
  return (
    version > 0 &&
    (current === "closed" || current === "exited") &&
    current !== synchronized &&
    !alreadyHandled
  );
}

interface TerminalViewportProps {
  advancedTypography: boolean;
  threadRef: ScopedThreadRef;
  threadId: ThreadId;
  terminalId: string;
  cwd: string;
  worktreePath?: string | null;
  runtimeEnv?: Record<string, string>;
  providerInstanceId?: ProviderInstanceId;
  onSessionExited: () => void;
  onAddTerminalContext?: (selection: TerminalContextSelection) => void;
  focusRequestId: number;
  autoFocus: boolean;
  visible: boolean;
  resizeEpoch: number;
  drawerHeight: number;
  keybindings: ResolvedKeybindingsConfig;
}

interface TerminalLaunchLocation {
  readonly cwd: string;
  readonly worktreePath?: string | null;
  readonly runtimeEnv?: Record<string, string>;
}

/** Mounts the terminal identified by the environment/thread/terminal props; forwards selection and lifecycle callbacks, enforces readOnly, and disposes its view and subscriptions on unmount. */
export function TerminalViewport({
  advancedTypography,
  threadRef,
  threadId,
  terminalId,
  cwd,
  worktreePath,
  runtimeEnv,
  providerInstanceId,
  onSessionExited,
  onAddTerminalContext,
  focusRequestId,
  autoFocus,
  visible,
  resizeEpoch,
  drawerHeight,
  keybindings,
}: TerminalViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<GhosttyTerminalSurface | null>(null);
  const visibleRef = useRef(visible);
  const [atBottom, setAtBottom] = useState(true);
  const getMenuFocusTarget = useCallback(
    () => (visibleRef.current ? (terminalRef.current?.input ?? null) : null),
    [],
  );
  const {
    present: presentTerminalMenu,
    dismiss: dismissTerminalMenu,
    actionElementRef,
    menu,
  } = useTerminalContextMenu(getMenuFocusTarget);
  const jumpToLatest = useCallback(() => {
    terminalRef.current?.scrollToBottom();
  }, []);
  const environmentId = threadRef.environmentId;
  const canOperateTerminal = useEnvironmentScope(environmentId, AuthTerminalOperateScope);
  const hasTerminalWriteAccess = useEffectEvent(() =>
    readEnvironmentScope(environmentId, AuthTerminalOperateScope),
  );
  const canOpenHostEditor = useEnvironmentScope(environmentId, AuthOrchestrationOperateScope);
  const canActivateTerminalLink = useEffectEvent(
    (text: string) =>
      isTerminalUrl(text) || readEnvironmentScope(environmentId, AuthOrchestrationOperateScope),
  );
  const serverConfig = useAtomValue(serverEnvironment.configValueAtom(environmentId));
  const openInPreferredEditor = useOpenInPreferredEditor(
    environmentId,
    serverConfig?.availableEditors ?? [],
  );
  const openTerminalPath = useEffectEvent((target: string) => openInPreferredEditor(target));
  const openPreview = useAtomCommand(previewEnvironment.open, {
    reportFailure: false,
  });
  const runTerminalWrite = useAtomCommand(terminalEnvironment.write, {
    reportFailure: false,
  });
  const runTerminalResize = useAtomCommand(terminalEnvironment.resize, {
    reportFailure: false,
  });
  const hasHandledExitRef = useRef(false);
  const selectionActionRequestIdRef = useRef(0);
  // Holds the request id of the selection popup currently on screen, so a
  // popup that was superseded (but whose menu promise has not settled yet)
  // cannot be mistaken for the active flow.
  const openSelectionMenuRequestIdRef = useRef<number | null>(null);
  const keybindingsRef = useRef(keybindings);
  const runtimeEnvKey = useMemo(() => runtimeEnvSignature(runtimeEnv), [runtimeEnv]);
  const handleSessionExited = useEffectEvent(() => {
    if (hasTerminalWriteAccess()) onSessionExited();
  });
  const handleAddTerminalContext = useEffectEvent((selection: TerminalContextSelection) => {
    onAddTerminalContext?.(selection);
  });
  const canAddSelectionToChat = useEffectEvent(() => onAddTerminalContext !== undefined);
  const terminalFontFamily = useClientSettings((settings) =>
    resolveTerminalFontPreference({
      advanced: advancedTypography,
      code: settings.fontFamilyCode,
      terminal: settings.fontFamilyTerminal,
    }),
  );
  const terminalFontSize = useClientSettings((settings) =>
    resolveTerminalFontSizePreference({
      advanced: advancedTypography,
      code: settings.fontSizeCode,
      terminal: settings.fontSizeTerminal,
    }),
  );
  const terminalFontRef = useRef({ family: terminalFontFamily, size: terminalFontSize });
  const terminalSession = useAttachedTerminalSession({
    environmentId,
    terminal: {
      threadId,
      terminalId,
      cwd,
      ...(worktreePath !== undefined ? { worktreePath } : {}),
      ...(runtimeEnv ? { env: runtimeEnv } : {}),
      ...(providerInstanceId ? { providerInstanceId } : {}),
    },
  });
  const canResizeTerminal =
    canOperateTerminal && terminalSession.version > 0 && terminalSession.status === "running";
  const resizeSessionGeneration = canResizeTerminal ? terminalSession.output.generation : null;
  const writeTerminal = useEffectEvent((data: string) =>
    runTerminalWrite({
      environmentId,
      input: { threadId, terminalId, data },
    }),
  );
  const resizeTerminal = useEffectEvent((cols: number, rows: number) => {
    if (!canResizeTerminal || !hasTerminalWriteAccess()) return;
    return runTerminalResize({
      environmentId,
      input: { threadId, terminalId, cols, rows },
    });
  });
  // Agent context keeps the server/default label; translated labels are only for the drawer UI.
  const readTerminalLabel = useEffectEvent(() =>
    resolveTerminalSessionLabel(terminalId, terminalSession.summary),
  );
  const terminalOutput = terminalSession.output;
  const terminalError = terminalSession.error;
  const terminalStatus = terminalSession.status;
  const outputCursorRef = useRef<TerminalOutputCursor>(INITIAL_TERMINAL_OUTPUT_CURSOR);
  const synchronizedStatusRef = useRef<TerminalSessionState["status"]>("closed");
  const synchronizeTerminalStatus = useEffectEvent(
    (terminal: GhosttyTerminalSurface, status: TerminalSessionState["status"], version: number) => {
      const synchronized = synchronizedStatusRef.current;
      if (version > 0 && status === "running") {
        hasHandledExitRef.current = false;
      } else if (
        shouldHandleTerminalExit(status, synchronized, hasHandledExitRef.current, version)
      ) {
        hasHandledExitRef.current = true;
        writeSystemMessage(
          terminal,
          status === "closed" ? t.tools.terminal.closed : t.tools.terminal.exited,
        );
        window.setTimeout(() => {
          if (hasHandledExitRef.current) {
            handleSessionExited();
          }
        }, 0);
      }
      if (version > 0) synchronizedStatusRef.current = status;
    },
  );
  const terminalVersion = terminalSession.version;
  const previousSessionRef = useRef({
    output: terminalOutput,
    error: terminalError,
    status: terminalStatus,
    version: terminalVersion,
  });
  const latestSessionRef = useRef(previousSessionRef.current);
  latestSessionRef.current = {
    output: terminalOutput,
    error: terminalError,
    status: terminalStatus,
    version: terminalVersion,
  };

  useEffect(() => {
    keybindingsRef.current = keybindings;
  }, [keybindings]);

  useLayoutEffect(() => {
    if (terminalRef.current) terminalRef.current.input.readOnly = !canOperateTerminal;
  }, [canOperateTerminal]);

  // A grant can change while the pointer remains over a link.
  useEffect(() => {
    terminalRef.current?.refreshLinkActivation();
  }, [canOpenHostEditor]);

  useEffect(() => {
    if (resizeSessionGeneration === null) return;
    // The first fit can finish before authorization or the attach snapshot.
    // Replay its grid once this writable session exists, including reconnects.
    terminalRef.current?.resendSize();
  }, [resizeSessionGeneration]);

  useLayoutEffect(() => {
    visibleRef.current = visible;
    terminalRef.current?.setVisible(visible);
    if (!visible) dismissTerminalMenu();
  }, [visible, dismissTerminalMenu]);

  useEffect(() => {
    const current = terminalFontRef.current;
    if (current.family === terminalFontFamily && current.size === terminalFontSize) return;
    terminalFontRef.current = { family: terminalFontFamily, size: terminalFontSize };
    void terminalRef.current?.setFont(terminalFontOptions(terminalFontFamily, terminalFontSize));
  }, [terminalFontFamily, terminalFontSize]);

  useEffect(() => {
    const mount = containerRef.current;
    if (!mount) return;

    const localApi = readLocalApi();
    let cancelled = false;
    let teardown: (() => void) | null = null;
    let setupTerminal: GhosttyTerminalSurface | null = null;
    let setupCleanups: Array<() => void> = [];
    let selectionActions: ReturnType<typeof observeSelectionActions> | null = null;

    const setup = async (): Promise<(() => void) | null> => {
      const setupFont = terminalFontRef.current;
      const terminalOptions: GhosttyTerminalSurfaceOptions = {
        theme: terminalThemeFromApp(mount),
        font: terminalFontOptions(setupFont.family, setupFont.size),
        get visible() {
          return visibleRef.current;
        },
        onData: (data) => handleData(data),
        onResize: (cols, rows) => void resizeTerminal(cols, rows),
        onSelectionChange: () => handleSelectionChange(),
        onScrollStateChange: setAtBottom,
        beforeKey: (event) => handleBeforeKey(event),
        onLinkActivate: (text, event) => handleLinkActivate(text, event),
        canActivateLink: (text) => canActivateTerminalLink(text),
        // The surface listens from construction, so a right-click can land
        // while `create` is still awaiting WASM — before the handler below it
        // exists. The ref is only assigned once that setup has run.
        onContextMenu: (event) => {
          if (terminalRef.current) void showTerminalContextMenu(event);
        },
      };
      const terminal = await GhosttyTerminalSurface.create(mount, terminalOptions);
      if (cancelled) {
        terminal.dispose();
        return null;
      }
      terminal.setVisible(visibleRef.current);
      // The theme observer is not installed yet, so re-read the theme in case
      // the app toggled light/dark while the WASM surface was loading.
      terminal.setTheme(terminalThemeFromApp(mount));
      setupTerminal = terminal;
      terminalRef.current = terminal;
      terminal.input.readOnly = !hasTerminalWriteAccess();
      // Client settings hydrate asynchronously; a font preference that landed
      // while the surface was loading found terminalRef null, so its setFont
      // was dropped. Re-apply whatever is current once the terminal exists.
      const currentFont = terminalFontRef.current;
      if (currentFont.family !== setupFont.family || currentFont.size !== setupFont.size) {
        void terminal.setFont(terminalFontOptions(currentFont.family, currentFont.size));
      }
      const latestSession = latestSessionRef.current;
      previousSessionRef.current = latestSession;
      const initialOutput = readTerminalOutputUpdate(
        latestSession.output,
        INITIAL_TERMINAL_OUTPUT_CURSOR,
      );
      if (initialOutput.type === "reset" && initialOutput.data.length > 0) {
        writeTerminalOutputUpdate(terminal, initialOutput);
      }
      outputCursorRef.current = initialOutput.cursor;
      if (latestSession.error !== null) writeSystemMessage(terminal, latestSession.error);
      // Attaching to a session that already exited must still run exit handling
      // once, so mount synchronization starts from the empty "closed" state.
      // (A session that is "closed" at mount is indistinguishable from one that
      // never started, so only "exited" triggers the message — as with xterm.)
      synchronizedStatusRef.current = "closed";
      synchronizeTerminalStatus(terminal, latestSession.status, latestSession.version);
      // Startup may finish after the user has returned to the composer.
      if (
        hasTerminalWriteAccess() &&
        visibleRef.current &&
        mount.contains(document.activeElement)
      ) {
        terminal.focus();
      }

      const dismissSelectionAction = (supersede = false) => {
        const ownsMenu =
          openSelectionMenuRequestIdRef.current === selectionActionRequestIdRef.current;
        // Passive cancellation must not invalidate a newer right-click flow.
        if (supersede || ownsMenu) selectionActionRequestIdRef.current += 1;
        if (ownsMenu) dismissTerminalMenu();
      };
      const clearSelectionAction = () => {
        selectionActions?.cancel();
        dismissSelectionAction(true);
      };
      setupCleanups.push(() => {
        clearSelectionAction();
        dismissTerminalMenu();
      });

      const readSelectionAction = (
        pointer: SelectionActionPoint | null = null,
      ): {
        position: { x: number; y: number };
        clipboardText: string;
        selection: TerminalContextSelection;
      } | null => {
        const activeTerminal = terminalRef.current;
        const mountElement = containerRef.current;
        if (!activeTerminal || !mountElement || !activeTerminal.hasSelection()) {
          return null;
        }
        const selectionText = activeTerminal.getSelection();
        const selectionPosition = activeTerminal.getSelectionPosition();
        const normalizedText = selectionText.replace(/\r\n/g, "\n").replace(/^\n+|\n+$/g, "");
        if (!selectionPosition || normalizedText.length === 0) {
          return null;
        }
        const { lineStart, lineEnd } = terminalSelectionLineRange(selectionPosition);
        const bounds = mountElement.getBoundingClientRect();
        const position = resolveSelectionActionPosition({
          bounds,
          selectionRect: activeTerminal.getSelectionEndClientRect(),
          pointer,
          viewport: { width: window.innerWidth, height: window.innerHeight },
        });
        return {
          position,
          clipboardText: selectionText,
          selection: {
            terminalId,
            terminalLabel: readTerminalLabel(),
            lineStart,
            lineEnd,
            text: normalizedText,
          },
        };
      };

      const addSelectionToChat = (selection: TerminalContextSelection) => {
        handleAddTerminalContext(selection);
        terminalRef.current?.clearSelection();
        terminalRef.current?.focus();
      };

      // A selection-action flow that was superseded while its async work ran
      // must go silent: no error message, no focus steal.
      const reportIfCurrent = (requestId: number, error: unknown, fallback: string) => {
        if (requestId !== selectionActionRequestIdRef.current) return;
        const activeTerminal = terminalRef.current;
        if (activeTerminal) {
          writeSystemMessage(activeTerminal, error instanceof Error ? error.message : fallback);
        }
      };

      const focusIfCurrent = (requestId: number) => {
        if (requestId === selectionActionRequestIdRef.current) {
          terminalRef.current?.focus();
        }
      };

      const copySelection = async (text: string, requestId: number) => {
        try {
          await writeTextToClipboard(text, t.chat.media.terminalSelection);
        } catch (error) {
          reportIfCurrent(requestId, error, t.tools.terminal.copyFailed);
        }
        focusIfCurrent(requestId);
      };

      const pasteFromClipboard = async (requestId: number) => {
        if (!hasTerminalWriteAccess()) return;
        const activeTerminal = terminalRef.current;
        if (!activeTerminal) return;
        try {
          // The surface owns the read so it can claim the paste race before it
          // starts: a paste shortcut fired while the menu read is in flight
          // supersedes this paste instead of landing alongside it.
          await activeTerminal.pasteFromClipboard(
            () => readTextFromClipboard(t.chat.media.terminalInput),
            () => requestId === selectionActionRequestIdRef.current,
          );
        } catch (error) {
          reportIfCurrent(requestId, error, t.tools.terminal.clipboardFailed);
          return;
        }
        focusIfCurrent(requestId);
      };

      const showTerminalContextMenu = async (event: MouseEvent) => {
        if (!terminalRef.current) return;
        // Own the gesture before anything async: leaving the default alive lets
        // the browser (or Electron's editing menu) answer with a Paste entry
        // that is permanently disabled over the terminal canvas.
        event.preventDefault();
        // A right-click supersedes a selection popup that is pending or open.
        clearSelectionAction();
        const selectionAction = readSelectionAction();
        const requestId = selectionActionRequestIdRef.current;
        const clicked = await presentTerminalMenu(
          terminalContextMenuItems({
            hasSelection: selectionAction !== null,
            canAddToChat: canAddSelectionToChat(),
            readOnly: !hasTerminalWriteAccess(),
          }),
          { x: event.clientX, y: event.clientY },
        );
        if (requestId !== selectionActionRequestIdRef.current || clicked === null) {
          return;
        }
        switch (clicked) {
          case "add-to-chat":
            if (selectionAction && canAddSelectionToChat()) {
              addSelectionToChat(selectionAction.selection);
            }
            return;
          case "copy":
            if (selectionAction) await copySelection(selectionAction.clipboardText, requestId);
            return;
          case "paste":
            await pasteFromClipboard(requestId);
            return;
          case "select-all":
            terminalRef.current?.selectAll();
            focusIfCurrent(requestId);
            return;
          case "scroll-to-bottom":
            jumpToLatest();
            focusIfCurrent(requestId);
            return;
        }
      };

      const showSelectionAction = async (pointer: SelectionActionPoint | null) => {
        if (openSelectionMenuRequestIdRef.current === selectionActionRequestIdRef.current) {
          return;
        }
        const nextAction = readSelectionAction(pointer);
        if (!nextAction) {
          clearSelectionAction();
          return;
        }
        const requestId = ++selectionActionRequestIdRef.current;
        openSelectionMenuRequestIdRef.current = requestId;
        const clicked = await presentTerminalMenu(
          terminalSelectionMenuItems({ canAddToChat: canAddSelectionToChat() }),
          nextAction.position,
        ).finally(() => {
          if (openSelectionMenuRequestIdRef.current === requestId) {
            openSelectionMenuRequestIdRef.current = null;
          }
        });
        if (requestId !== selectionActionRequestIdRef.current || clicked === null) {
          return;
        }
        switch (clicked) {
          case "add-to-chat":
            if (canAddSelectionToChat()) addSelectionToChat(nextAction.selection);
            return;
          case "copy":
            await copySelection(nextAction.clipboardText, requestId);
            return;
        }
      };

      const sendTerminalInput = async (data: string, fallbackError: string) => {
        if (!hasTerminalWriteAccess()) return;
        const activeTerminal = terminalRef.current;
        if (!activeTerminal) return;
        const result = await writeTerminal(data);
        if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
          const error = squashAtomCommandFailure(result);
          writeSystemMessage(
            activeTerminal,
            error instanceof Error ? error.message : fallbackError,
          );
        }
      };

      function handleBeforeKey(event: KeyboardEvent): boolean {
        const currentKeybindings = keybindingsRef.current;
        const options = { context: { terminalFocus: true, terminalOpen: true } };
        if (preventTerminalCloseShortcut(event, currentKeybindings)) {
          return false;
        }
        if (
          isTerminalToggleShortcut(event, currentKeybindings, options) ||
          isTerminalSplitShortcut(event, currentKeybindings, options) ||
          isTerminalSplitVerticalShortcut(event, currentKeybindings, options) ||
          isTerminalNewShortcut(event, currentKeybindings, options) ||
          isDiffToggleShortcut(event, currentKeybindings, options)
        ) {
          return false;
        }

        const navigationData = terminalNavigationShortcutData(event);
        if (navigationData !== null) {
          event.preventDefault();
          event.stopPropagation();
          void sendTerminalInput(navigationData, t.tools.terminal.moveCursorFailed);
          return false;
        }

        const deleteData = terminalDeleteShortcutData(event);
        if (deleteData !== null) {
          event.preventDefault();
          event.stopPropagation();
          void sendTerminalInput(deleteData, t.tools.terminal.deleteInputFailed);
          return false;
        }

        if (!isTerminalClearShortcut(event)) return true;
        event.preventDefault();
        event.stopPropagation();
        void sendTerminalInput("\u000c", t.tools.terminal.clearFailed);
        return false;
      }

      function handleLinkActivate(text: string, event: MouseEvent): void {
        if (!canActivateTerminalLink(text)) return;
        const latestTerminal = terminalRef.current;
        if (!latestTerminal) return;
        if (isTerminalUrl(text)) {
          if (!localApi) {
            writeSystemMessage(latestTerminal, t.tools.terminal.linksUnavailable);
            return;
          }
          const fallbackToBrowser = () => {
            void localApi.shell.openExternal(text).catch((error: unknown) => {
              writeSystemMessage(
                latestTerminal,
                error instanceof Error ? error.message : t.tools.terminal.linkFailed,
              );
            });
          };
          if (!readEnvironmentScope(environmentId, AuthPreviewOperateScope)) {
            fallbackToBrowser();
            return;
          }
          void openTerminalLinkInPreview({
            url: text,
            threadRef,
            openPreview,
            fallbackToBrowser,
            forceBrowser: event.metaKey || event.ctrlKey,
          }).catch((error: unknown) => {
            toastManager.add(
              stackedThreadToast({
                type: "error",
                title: t.tools.terminal.linkFailed,
                description: error instanceof Error ? error.message : t.tools.terminal.error,
              }),
            );
          });
          return;
        }
        const target = resolvePathLinkTarget(text, cwd);
        void (async () => {
          const result = await openTerminalPath(target);
          if (result._tag === "Success" || isAtomCommandInterrupted(result)) {
            return;
          }
          const error = squashAtomCommandFailure(result);
          writeSystemMessage(
            latestTerminal,
            error instanceof Error ? error.message : t.tools.terminal.pathFailed,
          );
        })();
      }

      function handleData(data: string): void {
        if (!hasTerminalWriteAccess()) return;
        void (async () => {
          const result = await writeTerminal(data);
          if (result._tag === "Success" || isAtomCommandInterrupted(result)) return;
          const error = squashAtomCommandFailure(result);
          writeSystemMessage(
            terminal,
            error instanceof Error ? error.message : t.tools.terminal.writeFailed,
          );
        })();
      }

      function handleSelectionChange(): void {
        if (terminalRef.current?.hasSelection()) {
          return;
        }
        const shouldClear = shouldClearTerminalSelectionAction({
          actionPending: selectionActions?.pending ?? false,
          openMenuRequestId: openSelectionMenuRequestIdRef.current,
          currentRequestId: selectionActionRequestIdRef.current,
        });
        if (!shouldClear) return;
        clearSelectionAction();
      }

      selectionActions = observeSelectionActions({
        element: mount,
        getActionElement: () => actionElementRef.current,
        onSelection: (pointer) => {
          void showSelectionAction(pointer);
        },
        onDismiss: (reason) => dismissSelectionAction(reason === "interaction"),
      });
      setupCleanups.push(() => selectionActions?.dispose());

      const themeObserver = new MutationObserver(() => {
        const activeTerminal = terminalRef.current;
        if (!activeTerminal) return;
        activeTerminal.setTheme(terminalThemeFromApp(containerRef.current));
      });
      themeObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class", "style"],
      });
      setupCleanups.push(() => themeObserver.disconnect());

      const fitTimer = window.setTimeout(() => {
        const activeTerminal = terminalRef.current;
        if (!activeTerminal) return;
        const wasAtBottom = activeTerminal.isAtBottom();
        activeTerminal.fit();
        if (wasAtBottom) {
          activeTerminal.scrollToBottom();
        }
      }, 30);
      setupCleanups.push(() => window.clearTimeout(fitTimer));

      const cleanups = setupCleanups;
      setupCleanups = [];
      setupTerminal = null;
      return () => {
        for (const cleanup of cleanups.toReversed()) cleanup();
        if (terminalRef.current === terminal) terminalRef.current = null;
        terminal.dispose();
      };
    };

    void setup()
      .then((nextTeardown) => {
        if (cancelled) {
          nextTeardown?.();
          return;
        }
        teardown = nextTeardown;
      })
      .catch((error: unknown) => {
        for (const cleanup of setupCleanups.toReversed()) cleanup();
        setupCleanups = [];
        if (terminalRef.current === setupTerminal) terminalRef.current = null;
        setupTerminal?.dispose();
        setupTerminal = null;
        if (cancelled) return;
        const message = error instanceof Error ? error.message : t.tools.terminal.initFailed;
        mount.textContent = t.tools.terminal.retryHint(message);
      });

    return () => {
      cancelled = true;
      const hadFocus = mount.contains(document.activeElement);
      teardown?.();
      if (hasTerminalWriteAccess() && hadFocus && mount.isConnected) {
        mount.focus({ preventScroll: true });
      }
    };
  }, [
    cwd,
    environmentId,
    runtimeEnvKey,
    terminalId,
    threadId,
    worktreePath,
    presentTerminalMenu,
    dismissTerminalMenu,
    jumpToLatest,
    actionElementRef,
  ]);

  useEffect(() => {
    const terminal = terminalRef.current;
    const current = {
      output: terminalOutput,
      error: terminalError,
      status: terminalStatus,
      version: terminalVersion,
    };
    if (!terminal) {
      previousSessionRef.current = current;
      return;
    }

    const previous = previousSessionRef.current;
    synchronizeTerminalStatus(terminal, current.status, current.version);
    if (current.version === previous.version && current.output === previous.output) {
      return;
    }

    outputCursorRef.current = synchronizeTerminalOutput(terminal, current, outputCursorRef.current);

    if (current.error !== null && current.error !== previous.error) {
      writeSystemMessage(terminal, current.error);
    }

    previousSessionRef.current = current;
  }, [terminalOutput, terminalError, terminalStatus, terminalVersion]);

  useEffect(() => {
    if (!autoFocus || !canOperateTerminal || !visible) return;
    // Claim focus when requested, then hand it to the terminal once ready only
    // if the user has not focused something else in the meantime.
    (terminalRef.current ?? containerRef.current)?.focus();
  }, [autoFocus, canOperateTerminal, focusRequestId, visible]);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal || !visibleRef.current) return;
    const wasAtBottom = terminal.isAtBottom();
    // The surface reports grid changes through onResize, which is the single
    // channel for PTY resize RPCs; fitting here only refreshes the layout.
    const frame = window.requestAnimationFrame(() => {
      if (!visibleRef.current) return;
      terminal.fit();
      if (wasAtBottom) {
        terminal.scrollToBottom();
      }
    });
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [drawerHeight, environmentId, resizeEpoch, terminalId, threadId]);
  return (
    <div className="relative h-full w-full">
      <div
        ref={containerRef}
        tabIndex={-1}
        className="relative h-full w-full overflow-hidden bg-(--terminal-background) font-mono text-terminal-copy text-fg-terminal"
      />
      {!atBottom ? (
        <button
          type="button"
          className="absolute bottom-0 left-1/2 flex h-7 -translate-x-1/2 cursor-pointer items-center gap-1.25 rounded-full bg-secondary pr-3 pl-2.5 text-secondary-copy font-semibold whitespace-nowrap text-foreground shadow-terminal-jump outline-none hover:bg-accent focus-visible:inset-shadow-focus"
          onClick={() => {
            jumpToLatest();
            terminalRef.current?.focus();
          }}
        >
          <ArrowDown className="size-3.25" />
          {t.tools.terminal.jumpToLatest}
        </button>
      ) : null}
      {menu}
    </div>
  );
}

interface ThreadTerminalDrawerProps {
  mode?: "drawer" | "panel";
  threadRef: ScopedThreadRef;
  threadId: ThreadId;
  cwd: string;
  worktreePath?: string | null;
  runtimeEnv?: Record<string, string>;
  visible?: boolean;
  height: number;
  terminalIds: string[];
  activeTerminalId: string;
  terminalGroups: ThreadTerminalGroup[];
  activeTerminalGroupId: string;
  focusRequestId: number;
  onSplitTerminal: () => void;
  onSplitTerminalVertical: () => void;
  onNewTerminal: () => void;
  splitShortcutLabel?: string | undefined;
  splitVerticalShortcutLabel?: string | undefined;
  newShortcutLabel?: string | undefined;
  closeShortcutLabel?: string | undefined;
  onActiveTerminalChange: (terminalId: string) => void;
  onCloseTerminal: (terminalId: string) => void;
  onHeightChange: (height: number) => void;
  onAddTerminalContext: (selection: TerminalContextSelection) => void;
  keybindings: ResolvedKeybindingsConfig;
  /** Prefer server-provided tab titles when present (e.g. active subprocess name). */
  terminalLabelsById?: ReadonlyMap<string, string>;
  /** Prefer per-session launch locations when the server already knows a terminal. */
  terminalLaunchLocationsById?: ReadonlyMap<string, TerminalLaunchLocation>;
}

/** Local terminal tool input; labels include the caller's configured shortcut and split limit. */
interface TerminalActionButtonProps {
  label: string;
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
}

/** Terminal8a's compact tools keep permission-disabled actions discoverable through their hover labels. */
function TerminalActionButton({ label, onClick, children, disabled }: TerminalActionButtonProps) {
  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        render={
          <button
            type="button"
            className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-terminal-tool text-secondary-label outline-none hover:bg-secondary hover:text-foreground focus-visible:inset-shadow-focus aria-disabled:cursor-not-allowed aria-disabled:text-fg-control-disabled aria-disabled:hover:bg-transparent"
            onClick={disabled ? undefined : onClick}
            aria-label={label}
            aria-disabled={disabled}
          />
        }
      >
        {children}
      </PopoverTrigger>
      <PopoverPopup
        tooltipStyle
        side="bottom"
        sideOffset={6}
        align="center"
        className="pointer-events-none select-none"
      >
        {label}
      </PopoverPopup>
    </Popover>
  );
}

/** Renders the supplied thread's terminal groups and split controls; callbacks persist layout/selection while permissions gate mutations and close confirmation protects running sessions. */
export default function ThreadTerminalDrawer({
  mode = "drawer",
  threadRef,
  threadId,
  cwd,
  worktreePath,
  runtimeEnv,
  visible = true,
  height,
  terminalIds,
  activeTerminalId,
  terminalGroups,
  activeTerminalGroupId,
  focusRequestId,
  onSplitTerminal,
  onSplitTerminalVertical,
  onNewTerminal,
  splitShortcutLabel,
  splitVerticalShortcutLabel,
  newShortcutLabel,
  closeShortcutLabel,
  onActiveTerminalChange,
  onCloseTerminal,
  onHeightChange,
  onAddTerminalContext,
  keybindings,
  terminalLabelsById,
  terminalLaunchLocationsById,
}: ThreadTerminalDrawerProps) {
  useLayoutEffect(() => {
    if (!visible || mode !== "drawer") return;
    // Release on close, thread switch and unmount. Manual expansion is temporary:
    // the final owner restores the opening snapshot, as the details-card API specifies.
    // Depend on scoped identity so fresh ref objects do not collapse a manually reopened card.
    return collapseThreadDetailsCard({
      environmentId: threadRef.environmentId,
      threadId: threadRef.threadId,
    });
  }, [visible, mode, threadRef.environmentId, threadRef.threadId]);
  const canOperateTerminal = useEnvironmentScope(threadRef.environmentId, AuthTerminalOperateScope);
  // Metadata provides process state without attaching another output stream for each tab.
  const knownTerminalSessions = useKnownTerminalSessions({
    environmentId: threadRef.environmentId,
    threadId,
  });
  const isPanel = mode === "panel";
  const [advancedTypography] = useLocalStorage(
    TYPOGRAPHY_ADVANCED_STORAGE_KEY,
    false,
    Schema.Boolean,
  );
  // The stored height is the user's preference; the window only clamps what renders.
  const controlledDrawerHeight = height;
  const [windowMaxDrawerHeight, setWindowMaxDrawerHeight] = useState(maxDrawerHeight);
  const [drawerHeightState, setDrawerHeightState] = useState(() => ({
    threadId,
    height: controlledDrawerHeight,
  }));
  const preferredDrawerHeight =
    drawerHeightState.threadId === threadId ? drawerHeightState.height : controlledDrawerHeight;
  const drawerHeight = clampDrawerHeight(preferredDrawerHeight, windowMaxDrawerHeight);
  const setDrawerHeight = useCallback(
    (update: SetStateAction<number>) => {
      setDrawerHeightState((current) => {
        const currentHeight =
          current.threadId === threadId ? current.height : controlledDrawerHeight;
        const nextHeight = typeof update === "function" ? update(currentHeight) : update;
        return nextHeight === currentHeight && current.threadId === threadId
          ? current
          : { threadId, height: nextHeight };
      });
    },
    [controlledDrawerHeight, threadId],
  );
  const [resizeEpoch, setResizeEpoch] = useState(0);
  const drawerHeightRef = useRef(drawerHeight);
  const preferredDrawerHeightRef = useRef(preferredDrawerHeight);
  const lastSyncedHeightRef = useRef(controlledDrawerHeight);
  const onHeightChangeRef = useRef(onHeightChange);
  const resizeStateRef = useRef<{
    pointerId: number;
    startY: number;
    startHeight: number;
    drawer: HTMLElement | null;
  } | null>(null);
  const didResizeDuringDragRef = useRef(false);

  const normalizedTerminalIds = useMemo(() => {
    const normalizedIds: string[] = [];
    const seen = new Set<string>();
    for (const id of terminalIds) {
      const trimmedId = id.trim();
      if (trimmedId.length === 0 || seen.has(trimmedId)) continue;
      seen.add(trimmedId);
      normalizedIds.push(trimmedId);
    }
    return normalizedIds;
  }, [terminalIds]);

  const resolvedActiveTerminalId =
    normalizedTerminalIds.length === 0
      ? ""
      : normalizedTerminalIds.includes(activeTerminalId)
        ? activeTerminalId
        : (normalizedTerminalIds[0] ?? "");

  const resolvedTerminalGroups = useMemo(() => {
    if (normalizedTerminalIds.length === 0) {
      return [];
    }
    const validTerminalIdSet = new Set(normalizedTerminalIds);
    const assignedTerminalIds = new Set<string>();
    const usedGroupIds = new Set<string>();
    const nextGroups: ThreadTerminalGroup[] = [];

    const assignUniqueGroupId = (groupId: string): string => {
      if (!usedGroupIds.has(groupId)) {
        usedGroupIds.add(groupId);
        return groupId;
      }
      let suffix = 2;
      while (usedGroupIds.has(`${groupId}-${suffix}`)) {
        suffix += 1;
      }
      const uniqueGroupId = `${groupId}-${suffix}`;
      usedGroupIds.add(uniqueGroupId);
      return uniqueGroupId;
    };

    for (const terminalGroup of terminalGroups) {
      const nextTerminalIds: string[] = [];
      const seenGroupTerminalIds = new Set<string>();
      for (const id of terminalGroup.terminalIds) {
        const terminalId = id.trim();
        if (terminalId.length === 0) continue;
        if (seenGroupTerminalIds.has(terminalId)) continue;
        seenGroupTerminalIds.add(terminalId);
        if (!validTerminalIdSet.has(terminalId)) continue;
        if (assignedTerminalIds.has(terminalId)) continue;
        nextTerminalIds.push(terminalId);
      }
      if (nextTerminalIds.length === 0) continue;

      for (const terminalId of nextTerminalIds) {
        assignedTerminalIds.add(terminalId);
      }

      const baseGroupId =
        terminalGroup.id.trim().length > 0
          ? terminalGroup.id.trim()
          : `group-${nextTerminalIds[0] ?? normalizedTerminalIds[0] ?? ""}`;
      nextGroups.push({
        id: assignUniqueGroupId(baseGroupId),
        terminalIds: nextTerminalIds,
        ...(terminalGroup.splitDirection === "vertical"
          ? { splitDirection: "vertical" as const }
          : {}),
      });
    }

    for (const terminalId of normalizedTerminalIds) {
      if (assignedTerminalIds.has(terminalId)) continue;
      nextGroups.push({
        id: assignUniqueGroupId(`group-${terminalId}`),
        terminalIds: [terminalId],
      });
    }

    const terminalOrderIndex = new Map(
      normalizedTerminalIds.map((id, index) => [id, index] as const),
    );
    nextGroups.sort((left, right) => {
      const rank = (ids: readonly string[]) =>
        Math.min(...ids.map((id) => terminalOrderIndex.get(id) ?? Number.POSITIVE_INFINITY));
      return rank(left.terminalIds) - rank(right.terminalIds);
    });

    return nextGroups;
  }, [normalizedTerminalIds, terminalGroups]);

  const resolvedActiveGroupIndex = useMemo(() => {
    const indexById = resolvedTerminalGroups.findIndex(
      (terminalGroup) => terminalGroup.id === activeTerminalGroupId,
    );
    if (indexById >= 0) return indexById;
    const indexByTerminal = resolvedTerminalGroups.findIndex((terminalGroup) =>
      terminalGroup.terminalIds.includes(resolvedActiveTerminalId),
    );
    return indexByTerminal >= 0 ? indexByTerminal : 0;
  }, [activeTerminalGroupId, resolvedActiveTerminalId, resolvedTerminalGroups]);

  const visibleTerminalIds =
    resolvedTerminalGroups[resolvedActiveGroupIndex]?.terminalIds ??
    (normalizedTerminalIds.length > 0 ? [resolvedActiveTerminalId] : []);
  const splitDirection =
    resolvedTerminalGroups[resolvedActiveGroupIndex]?.splitDirection ?? "horizontal";
  const isSplitView = visibleTerminalIds.length > 1;
  const hasReachedSplitLimit = visibleTerminalIds.length >= MAX_TERMINALS_PER_GROUP;
  const terminalMessages = t.chat.workLog.shared.terminal;
  const terminalLabelById = useMemo(() => {
    const next = new Map<string, string>();
    for (const terminalId of normalizedTerminalIds) {
      next.set(
        terminalId,
        terminalLabelsById?.get(terminalId) ?? getTerminalLabel(terminalId, terminalMessages),
      );
    }
    return next;
  }, [normalizedTerminalIds, terminalLabelsById, terminalMessages]);
  const resolveTerminalLaunchLocation = useCallback(
    (terminalId: string): TerminalLaunchLocation => {
      return (
        terminalLaunchLocationsById?.get(terminalId) ?? {
          cwd,
          ...(worktreePath !== undefined ? { worktreePath } : {}),
          ...(runtimeEnv ? { runtimeEnv } : {}),
        }
      );
    },
    [cwd, runtimeEnv, terminalLaunchLocationsById, worktreePath],
  );
  const splitTerminalActionLabel = hasReachedSplitLimit
    ? t.tools.terminal.splitHorizontalLimit(MAX_TERMINALS_PER_GROUP)
    : splitShortcutLabel
      ? t.tools.terminal.splitHorizontalShortcut(splitShortcutLabel)
      : t.tools.terminal.splitHorizontal;
  const splitTerminalVerticalActionLabel = hasReachedSplitLimit
    ? t.tools.terminal.splitVerticalLimit(MAX_TERMINALS_PER_GROUP)
    : splitVerticalShortcutLabel
      ? t.tools.terminal.splitVerticalShortcut(splitVerticalShortcutLabel)
      : t.tools.terminal.splitVertical;
  const newTerminalActionLabel = newShortcutLabel
    ? t.tools.terminal.newShortcut(newShortcutLabel)
    : t.tools.terminal.newTerminal;
  const closeTerminalActionLabel = closeShortcutLabel
    ? t.tools.terminal.closeShortcut(closeShortcutLabel)
    : t.tools.terminal.closeTerminal;
  const onSplitTerminalAction = useCallback(() => {
    if (!canOperateTerminal || hasReachedSplitLimit) return;
    onSplitTerminal();
  }, [canOperateTerminal, hasReachedSplitLimit, onSplitTerminal]);
  const onSplitTerminalVerticalAction = useCallback(() => {
    if (!canOperateTerminal || hasReachedSplitLimit) return;
    onSplitTerminalVertical();
  }, [canOperateTerminal, hasReachedSplitLimit, onSplitTerminalVertical]);
  const onNewTerminalAction = useCallback(() => {
    if (!canOperateTerminal) return;
    onNewTerminal();
  }, [canOperateTerminal, onNewTerminal]);
  const confirmCloseTerminal = useCallback(
    (terminalId: string) => {
      if (!canOperateTerminal) return;
      const label =
        terminalLabelById.get(terminalId) ?? getTerminalLabel(terminalId, terminalMessages);
      void confirmTerminalClose([label]).then((confirmed) => {
        if (confirmed && readEnvironmentScope(threadRef.environmentId, AuthTerminalOperateScope)) {
          onCloseTerminal(terminalId);
        }
      });
    },
    [
      canOperateTerminal,
      onCloseTerminal,
      terminalLabelById,
      terminalMessages,
      threadRef.environmentId,
    ],
  );

  useEffect(() => {
    onHeightChangeRef.current = onHeightChange;
  }, [onHeightChange]);

  useLayoutEffect(() => {
    // A render mid-drag (the window cap moved) must not replace the live height.
    const resizeState = resizeStateRef.current;
    if (resizeState) {
      resizeState.drawer?.style.setProperty("height", `${drawerHeightRef.current}px`);
      return;
    }
    drawerHeightRef.current = drawerHeight;
  }, [drawerHeight]);

  useEffect(() => {
    preferredDrawerHeightRef.current = preferredDrawerHeight;
  }, [preferredDrawerHeight]);

  const syncHeight = useCallback((nextHeight: number) => {
    if (lastSyncedHeightRef.current === nextHeight) return;
    lastSyncedHeightRef.current = nextHeight;
    onHeightChangeRef.current(nextHeight);
  }, []);

  useEffect(() => {
    lastSyncedHeightRef.current = controlledDrawerHeight;
  }, [controlledDrawerHeight, threadId]);

  // Reuse the panel gesture owner for physical height; the legacy handlers below keep their timing.
  const physicalResize = useResizeDrag<HTMLDivElement>((event) => {
    if (!isPhysicsEnabled() || isPanel || !visible) return null;
    const drawer = event.currentTarget.parentElement;
    const startHeight = drawerHeightRef.current;
    return {
      width: startHeight,
      edge: "top",
      physics: {
        min: MIN_DRAWER_HEIGHT,
        get max() {
          return maxDrawerHeight();
        },
        onFling() {
          // This is the visibility toggle's close action, never the terminal-session close action.
          useTerminalUiStateStore.getState().setTerminalOpen(threadRef, false);
        },
      },
      resize(value) {
        const bounded = clampDrawerHeight(value);
        drawerHeightRef.current = bounded;
        return bounded;
      },
      paint(value) {
        drawer?.style.setProperty("height", `${value}px`);
      },
      finish(finalHeight, moved) {
        if (!moved || finalHeight === startHeight) return;
        setDrawerHeight(finalHeight);
        syncHeight(finalHeight);
        setResizeEpoch((value) => value + 1);
      },
      cleanup(committed) {
        if (committed) return;
        const restored = clampDrawerHeight(preferredDrawerHeightRef.current);
        drawerHeightRef.current = restored;
        drawer?.style.setProperty("height", `${restored}px`);
      },
    };
  }, `${threadRef.environmentId}:${threadRef.threadId}:${visible}:${mode}`);
  const {
    refresh: refreshPhysicalResize,
    onPointerDown: physicalPointerDown,
    onPointerMove: physicalPointerMove,
    onPointerUp: physicalPointerUp,
    onPointerCancel: physicalPointerCancel,
    onLostPointerCapture: physicalLostPointerCapture,
  } = physicalResize;
  useLayoutEffect(refreshPhysicalResize, [refreshPhysicalResize, windowMaxDrawerHeight]);

  const handleResizePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (isPhysicsEnabled()) {
        physicalPointerDown(event);
        return;
      }
      if (event.button !== 0) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      didResizeDuringDragRef.current = false;
      resizeStateRef.current = {
        pointerId: event.pointerId,
        startY: event.clientY,
        startHeight: drawerHeightRef.current,
        drawer: event.currentTarget.parentElement,
      };
    },
    [physicalPointerDown],
  );

  // Writes the height straight to the drawer while dragging so the edge lands in
  // the pointer's frame; React state commits once on release.
  const handleResizePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const resizeState = resizeStateRef.current;
      if (!resizeState) {
        physicalPointerMove(event);
        return;
      }
      if (resizeState.pointerId !== event.pointerId) return;
      event.preventDefault();
      const clampedHeight = clampDrawerHeight(
        resizeState.startHeight + (resizeState.startY - event.clientY),
      );
      if (clampedHeight === drawerHeightRef.current) {
        return;
      }
      didResizeDuringDragRef.current = true;
      drawerHeightRef.current = clampedHeight;
      resizeState.drawer?.style.setProperty("height", `${clampedHeight}px`);
    },
    [physicalPointerMove],
  );

  const handleResizePointerEnd = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const resizeState = resizeStateRef.current;
      if (!resizeState) {
        if (event.type === "pointerup") physicalPointerUp(event);
        else if (event.type === "pointercancel") physicalPointerCancel(event);
        else physicalLostPointerCapture(event);
        return;
      }
      if (resizeState.pointerId !== event.pointerId) return;
      resizeStateRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      // A drag that ends where it started keeps the stored preference, which may
      // be taller than the window-capped height the drag started from.
      if (!didResizeDuringDragRef.current || drawerHeightRef.current === resizeState.startHeight) {
        // React skips the write when the rendered height did not change, so put
        // back the preference as the current window caps it.
        const renderedHeight = clampDrawerHeight(preferredDrawerHeightRef.current);
        drawerHeightRef.current = renderedHeight;
        resizeState.drawer?.style.setProperty("height", `${renderedHeight}px`);
        return;
      }
      setDrawerHeight(drawerHeightRef.current);
      syncHeight(drawerHeightRef.current);
      setResizeEpoch((value) => value + 1);
    },
    [
      setDrawerHeight,
      syncHeight,
      physicalPointerUp,
      physicalPointerCancel,
      physicalLostPointerCapture,
    ],
  );

  useEffect(() => {
    if (!visible) {
      return;
    }

    const onWindowResize = () => {
      // React only renders the stored preference, so clamp a live drag height here.
      const resizeState = resizeStateRef.current;
      const liveHeight = clampDrawerHeight(drawerHeightRef.current);
      if (resizeState && liveHeight !== drawerHeightRef.current) {
        drawerHeightRef.current = liveHeight;
        resizeState.drawer?.style.setProperty("height", `${liveHeight}px`);
      }
      setWindowMaxDrawerHeight(maxDrawerHeight());
      setResizeEpoch((value) => value + 1);
    };
    window.addEventListener("resize", onWindowResize);
    return () => {
      window.removeEventListener("resize", onWindowResize);
    };
  }, [visible]);

  useEffect(() => {
    if (!visible) {
      return;
    }
    setWindowMaxDrawerHeight(maxDrawerHeight());
    setResizeEpoch((value) => value + 1);
  }, [visible]);

  useEffect(() => {
    return () => {
      syncHeight(preferredDrawerHeightRef.current);
    };
  }, [syncHeight]);

  if (normalizedTerminalIds.length === 0) {
    return (
      <aside
        data-thread-terminal-drawer
        data-terminal-owner={isPanel ? "right-panel" : "drawer"}
        className={cn(
          "relative flex min-w-0 flex-col overflow-hidden bg-background",
          isPanel ? "h-full flex-1" : "shrink-0 border-t border-border/80",
        )}
        style={isPanel ? undefined : { height: `${drawerHeight}px` }}
      >
        {!isPanel ? (
          <div
            className="absolute inset-x-0 top-0 z-20 h-1.5 cursor-row-resize"
            onPointerDown={handleResizePointerDown}
            onPointerMove={handleResizePointerMove}
            onPointerUp={handleResizePointerEnd}
            onPointerCancel={handleResizePointerEnd}
            onLostPointerCapture={handleResizePointerEnd}
          />
        ) : null}
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-4 py-6 text-center text-secondary-copy-large text-secondary-label">
          <span className="flex size-10 items-center justify-center rounded-compact-row shadow-pn6-empty-icon">
            <SquareTerminal className="size-4.5" />
          </span>
          <p>{t.tools.terminal.noSessions}</p>
          <Button
            size="toolbar"
            variant="secondary"
            onClick={onNewTerminalAction}
            disabled={!canOperateTerminal}
            aria-label={newTerminalActionLabel}
          >
            <Plus />
            {t.tools.terminal.newTerminal}
          </Button>
        </div>
      </aside>
    );
  }

  const activeTerminalLaunchLocation = resolveTerminalLaunchLocation(resolvedActiveTerminalId);
  const activeLayoutLabel = !isSplitView
    ? t.tools.terminal.single
    : splitDirection === "vertical"
      ? t.tools.terminal.stacked
      : t.tools.terminal.sideBySide;

  return (
    <aside
      data-thread-terminal-drawer
      data-terminal-owner={isPanel ? "right-panel" : "drawer"}
      className={cn(
        "relative flex min-w-0 flex-col bg-background",
        isPanel ? "h-full flex-1" : "shrink-0 px-3 pb-3",
      )}
      style={isPanel ? undefined : { height: `${drawerHeight}px` }}
    >
      {!isPanel ? (
        <div
          className="absolute inset-x-3 top-0 z-20 flex h-1.5 cursor-row-resize items-center justify-center rounded-full outline-none focus-visible:inset-shadow-focus"
          onPointerDown={handleResizePointerDown}
          onPointerMove={handleResizePointerMove}
          onPointerUp={handleResizePointerEnd}
          onPointerCancel={handleResizePointerEnd}
          onLostPointerCapture={handleResizePointerEnd}
        >
          <span className="pointer-events-none h-0.5 w-8 rounded-full bg-fg-control-disabled" />
        </div>
      ) : null}
      <div className="thread-terminal-well @container flex min-h-0 flex-1 flex-col overflow-hidden rounded-card-row bg-well-terminal text-fg-terminal shadow-terminal-well">
        <div className="flex h-10.5 shrink-0 items-center gap-1 pr-2 pl-2.5">
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto py-1">
            {resolvedTerminalGroups.map((terminalGroup) => (
              <div key={terminalGroup.id} className="flex shrink-0 items-center gap-1">
                {terminalGroup.terminalIds.map((terminalId) => {
                  const isActive = terminalId === resolvedActiveTerminalId;
                  const terminalLabel =
                    terminalLabelById.get(terminalId) ?? t.tools.terminal.terminal;
                  const session = knownTerminalSessions?.find(
                    (entry) => entry.target.terminalId === terminalId,
                  );
                  const isRunning = session?.state.status === "running";
                  const closeTerminalLabel = t.tools.terminal.closeNamed(
                    terminalLabel,
                    isActive && closeShortcutLabel ? ` (${closeShortcutLabel})` : "",
                  );
                  return (
                    <div key={terminalId} className="group/tab relative shrink-0">
                      <button
                        type="button"
                        className={cn(
                          "flex h-7.5 max-w-52 cursor-pointer items-center gap-1.75 rounded-toolbar-icon px-2.5 text-secondary-copy-medium outline-none focus-visible:inset-shadow-focus",
                          isActive
                            ? "bg-secondary font-semibold text-foreground shadow-raise-xs"
                            : "text-secondary-label hover:bg-secondary hover:text-foreground",
                        )}
                        aria-pressed={isActive}
                        onClick={() => onActiveTerminalChange(terminalId)}
                      >
                        <span
                          className={cn(
                            "size-1.75 shrink-0 rounded-full",
                            isRunning ? "bg-success" : "bg-fg-control-disabled",
                            canOperateTerminal &&
                              "group-hover/tab:opacity-0 group-focus-within/tab:opacity-0",
                          )}
                          aria-hidden="true"
                        />
                        <span className="truncate">{terminalLabel}</span>
                        {session?.state.status === "exited" ? (
                          <span className="shrink-0">· {t.tools.terminal.tabExited}</span>
                        ) : null}
                      </button>
                      {canOperateTerminal ? (
                        <button
                          type="button"
                          className="pointer-events-none absolute top-0.75 left-0.5 flex size-6 cursor-pointer items-center justify-center rounded-tag text-secondary-label opacity-0 outline-none group-hover/tab:pointer-events-auto group-hover/tab:opacity-100 group-focus-within/tab:pointer-events-auto group-focus-within/tab:opacity-100 hover:bg-accent hover:text-foreground focus-visible:inset-shadow-focus"
                          aria-label={closeTerminalLabel}
                          onClick={() => confirmCloseTerminal(terminalId)}
                        >
                          <X className="size-3" />
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          {/* This is a layout indicator: rearranging an existing group has no command yet. */}
          <div
            className="mr-1.5 hidden h-7.5 shrink-0 items-center rounded-full bg-terminal-layout p-0.75 text-secondary-copy shadow-well-pressed @2xl:flex"
            role="img"
            aria-label={activeLayoutLabel}
          >
            {[t.tools.terminal.single, t.tools.terminal.stacked, t.tools.terminal.sideBySide].map(
              (label) => (
                <span
                  key={label}
                  className={cn(
                    "flex h-6 items-center rounded-compact-row px-2.25",
                    label === activeLayoutLabel
                      ? "bg-well-terminal-selection font-bold text-foreground shadow-raise-tab"
                      : "text-secondary-label",
                  )}
                >
                  {label}
                </span>
              ),
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <TerminalActionButton
              disabled={!canOperateTerminal}
              onClick={onNewTerminalAction}
              label={newTerminalActionLabel}
            >
              <Plus className="size-3.75" />
            </TerminalActionButton>
            <TerminalActionButton
              disabled={!canOperateTerminal || hasReachedSplitLimit}
              onClick={onSplitTerminalAction}
              label={splitTerminalActionLabel}
            >
              <SquareSplitHorizontal className="size-3.5" />
            </TerminalActionButton>
            <TerminalActionButton
              disabled={!canOperateTerminal || hasReachedSplitLimit}
              onClick={onSplitTerminalVerticalAction}
              label={splitTerminalVerticalActionLabel}
            >
              <SquareSplitVertical className="size-3.5" />
            </TerminalActionButton>
            <TerminalActionButton
              disabled={!canOperateTerminal}
              onClick={() => confirmCloseTerminal(resolvedActiveTerminalId)}
              label={closeTerminalActionLabel}
            >
              <X className="size-3.75" />
            </TerminalActionButton>
          </div>
        </div>
        <div className="min-h-0 w-full flex-1">
          <div className="flex h-full min-h-0">
            <div className="min-w-0 flex-1">
              {isSplitView ? (
                <div
                  className="grid h-full w-full min-w-0 gap-0 overflow-hidden"
                  style={
                    splitDirection === "vertical"
                      ? {
                          gridTemplateRows: `repeat(${visibleTerminalIds.length}, minmax(0, 1fr))`,
                        }
                      : {
                          gridTemplateColumns: `repeat(${visibleTerminalIds.length}, minmax(0, 1fr))`,
                        }
                  }
                >
                  {visibleTerminalIds.map((terminalId) => {
                    const terminalLaunchLocation = resolveTerminalLaunchLocation(terminalId);
                    return (
                      <div
                        key={terminalId}
                        className={cn(
                          "min-h-0 min-w-0 px-3 pt-0 pb-2",
                          splitDirection === "vertical"
                            ? "not-first:shadow-terminal-divider-row"
                            : "not-first:shadow-terminal-divider-column",
                        )}
                        onPointerDown={() => {
                          if (terminalId !== resolvedActiveTerminalId) {
                            onActiveTerminalChange(terminalId);
                          }
                        }}
                      >
                        <div className="h-full">
                          <TerminalViewport
                            advancedTypography={advancedTypography}
                            threadRef={threadRef}
                            threadId={threadId}
                            terminalId={terminalId}
                            cwd={terminalLaunchLocation.cwd}
                            {...(terminalLaunchLocation.worktreePath !== undefined
                              ? { worktreePath: terminalLaunchLocation.worktreePath }
                              : {})}
                            {...(terminalLaunchLocation.runtimeEnv
                              ? { runtimeEnv: terminalLaunchLocation.runtimeEnv }
                              : {})}
                            onSessionExited={() => onCloseTerminal(terminalId)}
                            onAddTerminalContext={onAddTerminalContext}
                            focusRequestId={focusRequestId}
                            autoFocus={terminalId === resolvedActiveTerminalId}
                            visible={visible}
                            resizeEpoch={resizeEpoch}
                            drawerHeight={drawerHeight}
                            keybindings={keybindings}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="h-full px-3 pt-0 pb-2">
                  <TerminalViewport
                    advancedTypography={advancedTypography}
                    key={resolvedActiveTerminalId}
                    threadRef={threadRef}
                    threadId={threadId}
                    terminalId={resolvedActiveTerminalId}
                    cwd={activeTerminalLaunchLocation.cwd}
                    {...(activeTerminalLaunchLocation.worktreePath !== undefined
                      ? { worktreePath: activeTerminalLaunchLocation.worktreePath }
                      : {})}
                    {...(activeTerminalLaunchLocation.runtimeEnv
                      ? { runtimeEnv: activeTerminalLaunchLocation.runtimeEnv }
                      : {})}
                    onSessionExited={() => onCloseTerminal(resolvedActiveTerminalId)}
                    onAddTerminalContext={onAddTerminalContext}
                    focusRequestId={focusRequestId}
                    autoFocus
                    visible={visible}
                    resizeEpoch={resizeEpoch}
                    drawerHeight={drawerHeight}
                    keybindings={keybindings}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
