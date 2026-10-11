/** Exercises preference reports through IPC decoding and the real settings/locale services. */
import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";
import * as DesktopUiLocale from "../../i18n/DesktopUiLocale.ts";
import * as ElectronApp from "../../electron/ElectronApp.ts";
import * as DesktopAppSettings from "../../settings/DesktopAppSettings.ts";
import * as DesktopApplicationMenu from "../../window/DesktopApplicationMenu.ts";
import { setUiLocalePreference } from "./uiLocale.ts";

it.effect("applies changed reports once, restores English, and rejects unsupported languages", () =>
  Effect.gen(function* () {
    const renders = yield* Ref.make<Array<string>>([]);
    const locale = yield* DesktopUiLocale.DesktopUiLocale;
    const menu = Layer.succeed(DesktopApplicationMenu.DesktopApplicationMenu, {
      configure: locale.messages.pipe(
        Effect.flatMap((messages) =>
          Ref.update(renders, (labels) => [...labels, messages.menu.file]),
        ),
      ),
    });
    yield* Effect.gen(function* () {
      yield* setUiLocalePreference.handler("zh-CN");
      yield* setUiLocalePreference.handler("zh-CN");
      assert.strictEqual(yield* locale.current, "zh-CN");
      yield* setUiLocalePreference.handler("en");
      const invalid = yield* Effect.exit(setUiLocalePreference.handler("fr"));
      assert.isTrue(Exit.isFailure(invalid));
      assert.strictEqual(yield* locale.current, "en");
      assert.deepEqual(yield* Ref.get(renders), ["文件", "File"]);
    }).pipe(Effect.provide(menu));
  }).pipe(
    Effect.provide(
      DesktopUiLocale.layer.pipe(
        Layer.provide([
          DesktopAppSettings.layerTest(),
          Layer.mock(ElectronApp.ElectronApp)({ systemLocale: Effect.succeed("en-US") }),
        ]),
      ),
    ),
  ),
);
