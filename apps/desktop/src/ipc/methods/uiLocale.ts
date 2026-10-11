/** Synchronizes the renderer's device language with persisted native menus and dialogs. */
import { UiLocalePreferenceSchema } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as DesktopUiLocale from "../../i18n/DesktopUiLocale.ts";
import * as DesktopApplicationMenu from "../../window/DesktopApplicationMenu.ts";
import * as DesktopIpc from "../DesktopIpc.ts";
import * as IpcChannels from "../channels.ts";

export const setUiLocalePreference = DesktopIpc.makeIpcMethod({
  channel: IpcChannels.SET_UI_LOCALE_PREFERENCE_CHANNEL,
  payload: UiLocalePreferenceSchema,
  result: Schema.Void,
  handler: Effect.fn("desktop.ipc.uiLocale.setPreference")(function* (preference) {
    const locale = yield* DesktopUiLocale.DesktopUiLocale;
    if (!(yield* locale.setPreference(preference))) return;
    const menu = yield* DesktopApplicationMenu.DesktopApplicationMenu;
    yield* menu.configure;
  }),
});
