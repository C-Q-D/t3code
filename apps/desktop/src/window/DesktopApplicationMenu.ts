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
import * as ElectronApp from "../electron/ElectronApp.ts";
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

  const desktopWindow = yield* DesktopWindow.DesktopWindow;
  yield* desktopWindow.ensureMain;
  yield* checkForUpdatesFromMenu;
}).pipe(Effect.withSpan("desktop.menu.handleCheckForUpdatesClick"));

/** @public Service construction is part of the canonical Effect module API. */
export const make = Effect.gen(function* () {
  const electronApp = yield* ElectronApp.ElectronApp;
  const electronMenu = yield* ElectronMenu.ElectronMenu;
  const environment = yield* DesktopEnvironment.DesktopEnvironment;
  const appName = yield* electronApp.name;
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
    const locale = yield* uiLocale.current;
    const labels = m.menu.roleLabels(appName, environment.platform);
    const roleItem = (role: NonNullable<Electron.MenuItemConstructorOptions["role"]>) =>
      localizedRole(role, labels);
    const checkForUpdatesClick = () => {
      runMenuEffect("check-for-updates", handleCheckForUpdatesMenuClick);
    };
    const settingsClick = () => {
      runMenuEffect("open-settings", dispatchMenuAction("open-settings"));
    };
    // Chromium already pastes as plain text for this chord, so the accelerator
    // needs nothing from the menu: the composer and the terminal each arm
    // themselves from the same keydown. Routing it through the renderer anyway
    // lands a second, injected paste and doubles the text. Only a menu click,
    // which produces no keystroke for them to see, needs that round trip.
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
    const template: Electron.MenuItemConstructorOptions[] = [];

    if (environment.platform === "darwin") {
      template.push({
        label: appName,
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
          roleItem(environment.platform === "darwin" ? "close" : "quit"),
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
          roleItem("reload"),
          roleItem("forceReload"),
          roleItem("toggleDevTools"),
          { type: "separator" },
          /*
            Not the zoom roles: those act on the focused webContents, so with
            an embedded preview WebContentsView focused they zoom the guest
            page and the app UI appears stuck. These always zoom the main
            window (see DesktopWindow.zoomMain).
          */
          { label: m.menu.actualSize, accelerator: "CmdOrCtrl+0", click: zoomClick("reset") },
          { label: m.menu.zoomIn, accelerator: "CmdOrCtrl+=", click: zoomClick("in") },
          {
            label: m.menu.zoomIn,
            accelerator: "CmdOrCtrl+Plus",
            visible: false,
            click: zoomClick("in"),
          },
          { label: m.menu.zoomOut, accelerator: "CmdOrCtrl+-", click: zoomClick("out") },
          { type: "separator" },
          roleItem("togglefullscreen"),
        ],
      },
      locale === "en"
        ? { role: "windowMenu" }
        : {
            ...roleItem("windowMenu"),
            submenu:
              environment.platform === "darwin"
                ? [roleItem("minimize"), roleItem("zoom"), { type: "separator" }, roleItem("front")]
                : [roleItem("minimize"), roleItem("zoom"), roleItem("close")],
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
