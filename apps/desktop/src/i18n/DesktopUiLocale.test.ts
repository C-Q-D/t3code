/** Verifies native language resolution and persisted reports through the real locale service. */
import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as ElectronApp from "../electron/ElectronApp.ts";
import * as DesktopAppSettings from "../settings/DesktopAppSettings.ts";
import * as DesktopUiLocale from "./DesktopUiLocale.ts";

describe("DesktopUiLocale", () => {
  it.each([
    ["system", "zh-TW", "zh-CN"],
    ["system", "zh_CN", "zh-CN"],
    ["system", "en-GB", "en"],
    ["en", "zh-CN", "en"],
    ["zh-CN", "en", "zh-CN"],
  ] as const)("resolves %s against %s to %s", (preference, system, expected) => {
    assert.strictEqual(DesktopUiLocale.resolveUiLocale(preference, system), expected);
  });
  it.effect("falls back before ready but never overrides an explicit saved choice", () =>
    Effect.gen(function* () {
      const locale = yield* DesktopUiLocale.DesktopUiLocale;
      assert.strictEqual(yield* locale.current, "en");
      assert.strictEqual(yield* locale.setPreference("zh-CN"), true);
      assert.strictEqual(yield* locale.current, "zh-CN");
      assert.strictEqual((yield* locale.messages).menu.file, "文件");
      assert.strictEqual(yield* locale.setPreference("zh-CN"), false);
      yield* locale.setPreference("en");
      assert.strictEqual((yield* locale.messages).menu.file, "File");
    }).pipe(
      Effect.provide(
        DesktopUiLocale.layer.pipe(
          Layer.provide([
            DesktopAppSettings.layerTest(),
            Layer.mock(ElectronApp.ElectronApp)({ systemLocale: Effect.die("not ready") }),
          ]),
        ),
      ),
    ),
  );
});
