/** Builds native menus and update dialogs using the current device language. */
import * as DesktopUiLocale from "../i18n/DesktopUiLocale.ts";
import { localizedRole } from "../i18n/desktopMessages.ts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import type * as Electron from "electron";

import { makeComponentLogger } from "../app/DesktopObservability.ts";
import * as ElectronDialog from "../electron/ElectronDialog.ts";
import * as ElectronMenu from "../electron/ElectronMenu.ts";
import * as DesktopEnvironment from "../app/DesktopEnvironment.ts";
import * as DesktopUpdates from "../updates/DesktopUpdates.ts";
import * as DesktopWindow from "./DesktopWindow.ts";

export class DesktopApplicationMenuActionError extends Schema.TaggedError<DesktopApplicationMenuActionError>()(
  "DesktopApplicationMenuActionError",
  {
    action: Schema.String,
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Desktop menu action "${this.action}" failed.`;
  }
}

export class DesktopApplicationMenu extends Context.Service<
  DesktopApplicationMenu,
  {
    readonly configure: Effect.Effect<void>;
  }
>()("@t3tools/desktop/window/DesktopApplicationMenu") {}

type DesktopApplicationMenuRuntimeServices =
  | DesktopUpdates.DesktopUpdates
  | DesktopWindow.DesktopWindow
  | ElectronDialog.ElectronDialog
  | DesktopUiLocale.DesktopUiLocale;

const { logInfo: logUpdaterInfo } = makeComponentLogger("desktop-updater");

const { logError: logMenuError } = makeComponentLogger("desktop-menu");

const dispatchMenuAction = Effect.fn("desktop.menu.dispatchMenuAction")(function* (
  action: string,
): Effect.fn.Return<void, DesktopWindow.DesktopWindowError, DesktopWindow.DesktopWindow> {
  const desktopWindow = yield* DesktopWindow.DesktopWindow;
  yield* desktopWindow.dispatchMenuAction(action, {
    reveal: action !== "paste-as-text",
  });
});

const zoomMainWindow = Effect.fn("desktop.menu.zoomMainWindow")(function* (
  direction: DesktopWindow.MainWindowZoomDirection,
): Effect.fn.Return<void, never, DesktopWindow.DesktopWindow> {
  const desktopWindow = yield* DesktopWindow.DesktopWindow;
  yield* desktopWindow.zoomMain(direction);
});

const runMainContentsCommand = Effect.fn("desktop.menu.runMainContentsCommand")(function* (
  command: DesktopWindow.MainWindowContentsCommand,
): Effect.fn.Return<void, never, DesktopWindow.DesktopWindow> {
  const desktopWindow = yield* DesktopWindow.DesktopWindow;
  yield* desktopWindow.runMainContentsCommand(command);
});

const checkForUpdatesFromMenu = Effect.gen(function* () {
  const updates = yield* DesktopUpdates.DesktopUpdates;
  const electronDialog = yield* ElectronDialog.ElectronDialog;
  const result = yield* updates.check("menu");
  const updateState = result.state;
  const m = yield* (yield* DesktopUiLocale.DesktopUiLocale).messages;

  if (updateState.status === "up-to-date") {
    yield* electronDialog.showMessageBox({
      type: "info",
      title: m.updates.upToDateTitle,
      message: m.updates.upToDateMessage(updateState.currentVersion),
      buttons: [m.updates.ok],
    });
  } else if (updateState.status === "error") {
    yield* electronDialog.showMessageBox({
      type: "warning",
      title: m.updates.failedTitle,
      message: m.updates.failedMessage,
      detail: updateState.message ?? m.updates.unknownError,
      buttons: [m.updates.ok],
    });
  }
}).pipe(Effect.withSpan("desktop.menu.checkForUpdates"));

const handleCheckForUpdatesMenuClick = Effect.gen(function* () {
  const updates = yield* DesktopUpdates.DesktopUpdates;
  const electronDialog = yield* ElectronDialog.ElectronDialog;
  const disabledReason = yield* updates.disabledReason;
  if (Option.isSome(disabledReason)) {
    const m = yield* (yield* DesktopUiLocale.DesktopUiLocale).messages;
    yield* logUpdaterInfo("manual update check requested, but updates are disabled", {
      disabledReason: disabledReason.value,
    });
    yield* electronDialog.showMessageBox({
      type: "info",
      title: m.updates.unavailableTitle,
      message: m.updates.unavailableMessage,
      detail: disabledReason.value,
      buttons: [m.updates.ok],
    });
    return;
  }

  // Opening a window before backend confirmation can strand it on failed auth bootstrap.
  const desktopWindow = yield* DesktopWindow.DesktopWindow;
  yield* desktopWindow.activate;
  yield* checkForUpdatesFromMenu;
}).pipe(Effect.withSpan("desktop.menu.handleCheckForUpdatesClick"));

/** @public */
export const make = Effect.gen(function* () {
  const electronMenu = yield* ElectronMenu.ElectronMenu;
  const environment = yield* DesktopEnvironment.DesktopEnvironment;
  const context = yield* Effect.context<DesktopApplicationMenuRuntimeServices>();
  const runPromise = Effect.runPromiseWith(context);

  const runMenuEffect = <E>(
    action: string,
    effect: Effect.Effect<void, E, DesktopApplicationMenuRuntimeServices>,
  ) => {
    void runPromise(
      effect.pipe(
        Effect.annotateLogs({ action }),
        Effect.withSpan("desktop.menu.action"),
        Effect.catchCause((cause) => {
          const error = new DesktopApplicationMenuActionError({ action, cause });
          return logMenuError(error.message, { error });
        }),
      ),
    );
  };

  const uiLocale = yield* DesktopUiLocale.DesktopUiLocale;
  const configure = Effect.gen(function* () {
    const m = yield* uiLocale.messages;
    const labels = m.menu.roleLabels(environment.displayName, environment.platform);
    const roleItem = (role: NonNullable<Electron.MenuItemConstructorOptions["role"]>) =>
      localizedRole(role, labels);
    const checkForUpdatesClick = () => {
      runMenuEffect("check-for-updates", handleCheckForUpdatesMenuClick);
    };
    const settingsClick = () => {
      runMenuEffect("open-settings", dispatchMenuAction("open-settings"));
    };
    // Chromium and the renderer already handle this chord; injecting another paste duplicates text.
    const pasteAsTextClick = (
      _item: Electron.MenuItem,
      _window: Electron.BaseWindow | undefined,
      event: Electron.KeyboardEvent,
    ) => {
      if (event.triggeredByAccelerator === true) return;
      runMenuEffect("paste-as-text", dispatchMenuAction("paste-as-text"));
    };
    const zoomClick = (direction: DesktopWindow.MainWindowZoomDirection) => () => {
      runMenuEffect(`zoom-${direction}`, zoomMainWindow(direction));
    };
    const mainContentsClick = (command: DesktopWindow.MainWindowContentsCommand) => () => {
      runMenuEffect(command, runMainContentsCommand(command));
    };
    const template: Electron.MenuItemConstructorOptions[] = [];

    if (environment.platform === "darwin") {
      template.push({
        label: environment.displayName,
        submenu: [
          roleItem("about"),
          {
            label: m.menu.checkForUpdates,
            click: checkForUpdatesClick,
          },
          { type: "separator" },
          {
            label: m.menu.settings,
            accelerator: "CmdOrCtrl+,",
            click: settingsClick,
          },
          { type: "separator" },
          roleItem("services"),
          { type: "separator" },
          roleItem("hide"),
          roleItem("hideOthers"),
          roleItem("unhide"),
          { type: "separator" },
          roleItem("quit"),
        ],
      });
    }

    template.push(
      {
        label: m.menu.file,
        submenu: [
          ...(environment.platform === "darwin"
            ? []
            : [
                {
                  label: m.menu.settings,
                  accelerator: "CmdOrCtrl+,",
                  click: settingsClick,
                },
                { type: "separator" as const },
              ]),
          // Cmd/Ctrl+W belongs to the renderer's tab close; it must never close the window.
          environment.platform === "darwin"
            ? { label: labels.close ?? "Close Window", click: (_item, window) => window?.close() }
            : roleItem("quit"),
        ],
      },
      {
        label: m.menu.edit,
        submenu: [
          roleItem("undo"),
          roleItem("redo"),
          { type: "separator" },
          roleItem("cut"),
          roleItem("copy"),
          roleItem("paste"),
          {
            label: m.menu.pasteAsText,
            accelerator: "CmdOrCtrl+Shift+V",
            click: pasteAsTextClick,
          },
          roleItem("delete"),
          { type: "separator" },
          roleItem("selectAll"),
          ...(environment.platform === "darwin"
            ? [
                { type: "separator" as const },
                {
                  label: m.menu.speech,
                  submenu: [roleItem("startSpeaking"), roleItem("stopSpeaking")],
                },
              ]
            : []),
        ],
      },
      {
        label: m.menu.view,
        submenu: [
          /* Native reload/DevTools/zoom roles target focused guests; these commands must target the app. */
          { label: m.menu.reload, accelerator: "CmdOrCtrl+R", click: mainContentsClick("reload") },
          {
            label: m.menu.forceReload,
            accelerator: "Shift+CmdOrCtrl+R",
            click: mainContentsClick("forceReload"),
          },
          {
            label: m.menu.toggleDevTools,
            accelerator: environment.platform === "darwin" ? "Alt+Command+I" : "Ctrl+Shift+I",
            click: mainContentsClick("toggleDevTools"),
          },
          { type: "separator" },
          { label: m.menu.actualSize, accelerator: "CmdOrCtrl+0", click: zoomClick("reset") },
          { label: m.menu.zoomIn, accelerator: "CmdOrCtrl+=", click: zoomClick("in") },
          {
            label: m.menu.zoomIn,
            accelerator: "CmdOrCtrl+Plus",
            visible: false,
            click: zoomClick("in"),
          },
          ...(environment.platform === "darwin"
            ? [
                {
                  label: m.menu.zoomIn,
                  accelerator: "CmdOrCtrl+Shift+=",
                  visible: false,
                  click: zoomClick("in"),
                },
              ]
            : []),
          { label: m.menu.zoomOut, accelerator: "CmdOrCtrl+-", click: zoomClick("out") },
          // Keypad codes do not match number-row accelerators.
          {
            label: m.menu.actualSize,
            accelerator: "CmdOrCtrl+num0",
            visible: false,
            click: zoomClick("reset"),
          },
          {
            label: m.menu.zoomIn,
            accelerator: "CmdOrCtrl+numadd",
            visible: false,
            click: zoomClick("in"),
          },
          {
            label: m.menu.zoomOut,
            accelerator: "CmdOrCtrl+numsub",
            visible: false,
            click: zoomClick("out"),
          },
          { type: "separator" },
          roleItem("togglefullscreen"),
        ],
      },
      {
        // Electron's default Window submenu adds a Ctrl+W close role off macOS.
        ...roleItem("windowMenu"),
        submenu: [
          roleItem("minimize"),
          roleItem("zoom"),
          ...(environment.platform === "darwin"
            ? [{ type: "separator" as const }, roleItem("front")]
            : []),
        ],
      },
      {
        ...roleItem("help"),
        submenu: [
          {
            label: m.menu.checkForUpdates,
            click: checkForUpdatesClick,
          },
        ],
      },
    );

    yield* electronMenu.setApplicationMenu(template);
  }).pipe(Effect.withSpan("desktop.menu.configure"));

  return DesktopApplicationMenu.of({
    configure,
  });
});

export const layer = Layer.effect(DesktopApplicationMenu, make);
