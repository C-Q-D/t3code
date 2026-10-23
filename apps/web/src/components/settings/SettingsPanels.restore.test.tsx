/** Verifies changed-setting labels and restore writes through the settings restore hook. */
import { DEFAULT_UNIFIED_SETTINGS, type UnifiedSettings } from "@t3tools/contracts";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { reactHookHarness as hooks } from "../../test/reactHookHarness";

const snoozeUi = vi.hoisted(() => ({ enabled: true }));
vi.mock("~/snoozeUi", () => ({
  get SNOOZE_UI_ENABLED() {
    return snoozeUi.enabled;
  },
}));

const state = vi.hoisted(() => ({
  settings: null as UnifiedSettings | null,
  update: vi.fn(),
  confirm: vi.fn(),
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  const { reactHookHarness } = await import("../../test/reactHookHarness");
  return {
    ...actual,
    useCallback: reactHookHarness.useCallback,
    useMemo: reactHookHarness.useMemo,
  };
});

vi.mock("react/compiler-runtime", async () => {
  const { reactHookHarness } = await import("../../test/reactHookHarness");
  return { c: reactHookHarness.useMemoCache };
});

vi.mock("../../hooks/useTheme", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../hooks/useTheme")>()),
  useTheme: () => ({
    theme: "system",
    followSystem: true,
    themeHalves: null,
    setTheme: vi.fn(),
    setFollowSystem: vi.fn(),
    setThemeHalf: vi.fn(),
    clearThemeHalves: vi.fn(),
  }),
  readThemePreference: () => "system",
  readThemeHalves: () => null,
  readAppearanceModePreference: () => "system",
}));

vi.mock("./useScopedSettings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./useScopedSettings")>()),
  useScopedSettings: () => state.settings,
  useUpdateScopedSettings: () => state.update,
}));

vi.mock("../../localApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../localApi")>()),
  readLocalApi: () => ({ dialogs: { confirm: state.confirm } }),
}));

import { useSettingsRestore } from "./SettingsPanels";

beforeEach(() => {
  snoozeUi.enabled = true;
  hooks.reset();
  vi.clearAllMocks();
  state.settings = { ...DEFAULT_UNIFIED_SETTINGS };
  state.confirm.mockResolvedValue(true);
});

describe("restoring V2 settings", () => {
  it("restores thread title instructions when they are the only changed setting", async () => {
    state.settings = { ...DEFAULT_UNIFIED_SETTINGS, threadTitleInstructions: "Use short titles" };
    hooks.beginRender();
    const restore = useSettingsRestore();

    expect(restore.changedSettingLabels).toEqual(["Thread title instructions"]);
    await restore.restoreDefaults();

    expect(state.confirm.mock.calls[0]?.[0]).toContain("Thread title instructions");
    expect(state.update.mock.calls[0]?.[0]).toHaveProperty("threadTitleInstructions", "");
  });

  it("resets thread title instructions together with other settings", async () => {
    state.settings = {
      ...DEFAULT_UNIFIED_SETTINGS,
      threadTitleInstructions: "Use short titles",
      autoResumeLimitedThreads: true,
    };
    hooks.beginRender();

    await useSettingsRestore().restoreDefaults();

    expect(state.update.mock.calls[0]?.[0]).toMatchObject({
      threadTitleInstructions: "",
      autoResumeLimitedThreads: false,
    });
  });

  it.each([
    { idleCompaction: "off" },
    { idleCompaction: "beforeCacheExpires" },
    { compactIdleThreads: true },
    { compactIdleThreads: "off" },
  ] as const)("restores idle compaction from %j", async (compaction) => {
    state.settings = { ...DEFAULT_UNIFIED_SETTINGS, ...compaction };
    hooks.beginRender();
    const restore = useSettingsRestore();

    expect(restore.changedSettingLabels).toEqual(["Compact idle Claude threads (beta)"]);
    await restore.restoreDefaults();

    expect(state.update.mock.calls[0]?.[0]).toHaveProperty("idleCompaction", "onReturn");
  });

  it("does not mark an explicit default compaction mode as changed", () => {
    state.settings = { ...DEFAULT_UNIFIED_SETTINGS, idleCompaction: "onReturn" };
    hooks.beginRender();

    expect(useSettingsRestore().changedSettingLabels).toEqual([]);
  });

  it.each(["system", "off"] as const)(
    "lists physics motion set to %s and restores it to on",
    async (physicsMotion) => {
      state.settings = { ...DEFAULT_UNIFIED_SETTINGS, physicsMotion };
      hooks.beginRender();
      const restore = useSettingsRestore();

      expect(restore.changedSettingLabels).toEqual(["Physics motion"]);
      await restore.restoreDefaults();

      expect(state.update.mock.calls[0]?.[0]).toHaveProperty("physicsMotion", "on");
    },
  );

  it("keeps the hidden snooze preference out of restore labels and updates", async () => {
    snoozeUi.enabled = false;
    state.settings = {
      ...DEFAULT_UNIFIED_SETTINGS,
      snoozeLimitedThreads: true,
      autoResumeLimitedThreads: true,
    };
    hooks.beginRender();
    const restore = useSettingsRestore();
    expect(restore.changedSettingLabels).toEqual(["Auto-resume limited threads"]);
    await restore.restoreDefaults();
    expect(state.update.mock.calls[0]?.[0]).not.toHaveProperty("snoozeLimitedThreads");
    expect(state.update.mock.calls[0]?.[0].autoResumeLimitedThreads).toBe(false);
  });
  it.each([
    ["persistComposerContextStrip", "Composer context"],
    ["autoResumeLimitedThreads", "Auto-resume limited threads"],
    ["snoozeLimitedThreads", "Snooze limited threads"],
  ] as const)("restores %s when it is the only changed setting", async (key, label) => {
    state.settings = { ...DEFAULT_UNIFIED_SETTINGS, [key]: true };
    hooks.beginRender();
    const restore = useSettingsRestore();

    expect(restore.changedSettingLabels).toEqual([label]);
    await restore.restoreDefaults();

    expect(state.confirm.mock.calls[0]?.[0]).toContain(label);
    expect(state.update).toHaveBeenCalledOnce();
    expect(state.update.mock.calls[0]?.[0][key]).toBe(DEFAULT_UNIFIED_SETTINGS[key]);
  });

  it("does not reset settings after cancellation", async () => {
    state.settings = { ...DEFAULT_UNIFIED_SETTINGS, autoResumeLimitedThreads: true };
    state.confirm.mockResolvedValue(false);
    hooks.beginRender();

    await useSettingsRestore().restoreDefaults();

    expect(state.confirm).toHaveBeenCalledOnce();
    expect(state.update).not.toHaveBeenCalled();
  });
});
