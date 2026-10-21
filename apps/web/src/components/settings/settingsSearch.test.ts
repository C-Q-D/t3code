/** Verifies settings search results, availability, localization and navigation destinations. */
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { DEFAULT_SERVER_SETTINGS, EnvironmentId } from "@t3tools/contracts";
import { en } from "~/i18n/locales/en";
import { messages } from "~/i18n/locales/zh-CN";

import {
  filterAvailableSettingsSearchItems,
  getEasSearchEnvironmentId,
  hasEasSearchSupport,
  getSettingsSearchTargetScope,
  getThreadAutoSettlementSearchAvailability,
  isSettingsSearchScopeAvailable,
  searchSettings,
  searchableSetting,
  SETTINGS_SEARCH_ITEMS,
  type SettingsSearchItem,
} from "./settingsSearch";

const ITEMS: ReadonlyArray<SettingsSearchItem> = [
  {
    id: "word-wrap",
    title: "Word wrap",
    to: "/settings/general",
    searchTerms: ["long lines in code previews"],
  },
  {
    id: "network-access",
    title: "Network access",
    to: "/settings/connections",
    searchTerms: ["remote pairing backend"],
  },
  {
    id: "providers",
    title: "Providers",
    to: "/settings/providers",
    searchTerms: ["claude codex agents"],
  },
  {
    id: "provider-updates",
    title: "Update checks",
    to: "/settings/general",
  },
  {
    id: "automatic-updates",
    title: "Automatic updates",
    to: "/settings/general",
  },
];

afterEach(async () => {
  const { installMessages } = await import("~/i18n");
  installMessages("en", en);
  vi.resetModules();
});

describe("translated settings catalog", () => {
  it("finds translated titles and English aliases in General settings", async () => {
    vi.resetModules();
    const { installMessages: install } = await import("~/i18n");
    install("zh-CN", messages);
    const { searchSettings: search } = await import("./settingsSearch");

    expect(search("项目分组")[0]).toMatchObject({
      id: "project-grouping",
      title: "项目分组",
      to: "/settings/general",
    });
    expect(search("combine matching repositories").map((item) => item.id)).toContain(
      "project-grouping",
    );
  });

  it.each([
    ["general", "project-grouping", "/settings/general"],
    ["storage", "storage-worktrees-location", "/settings/storage"],
  ])("finds English page name %s with Chinese messages installed", async (query, id, to) => {
    vi.resetModules();
    const { installMessages: install } = await import("~/i18n");
    install("zh-CN", messages);
    const { searchSettings: search } = await import("./settingsSearch");

    expect(search(query)).toEqual(expect.arrayContaining([expect.objectContaining({ id, to })]));
  });

  it("finds Chinese titles and English aliases when installed before module evaluation", async () => {
    vi.resetModules();
    const { installMessages: install } = await import("~/i18n");
    install("zh-CN", messages);
    const { searchSettings: search } = await import("./settingsSearch");
    expect(search("语言")).toEqual([
      expect.objectContaining({
        id: "language",
        title: "语言",
        to: "/settings/general",
      }),
    ]);
    expect(search("english").map((item) => item.id)).toContain("language");
    expect(search("chinese").map((item) => item.id)).toContain("language");
    expect(search("时间格式")[0]).toMatchObject({ id: "time-format", title: "时间格式" });
  });
});

describe("searchSettings", () => {
  it.each([
    ["EAS", "eas-device-hosts", "/settings/integrations"],
    ["Expo", "eas-device-hosts", "/settings/integrations"],
    ["webhook", "scheduled-tasks", "/settings/scheduled-tasks"],
    ["replay key", "scheduled-tasks", "/settings/scheduled-tasks"],
    ["coalesce", "scheduled-tasks", "/settings/scheduled-tasks"],
    ["scheduled task", "scheduled-tasks", "/settings/scheduled-tasks"],
  ])("finds the stable settings destination for %s", (query, id, to) => {
    expect(searchSettings(query)).toContainEqual(expect.objectContaining({ id, to, targetId: id }));
  });

  it("does not offer the hidden snooze setting in search or the catalog", () => {
    expect(SETTINGS_SEARCH_ITEMS.map((item) => item.id)).not.toContain("snooze-limited-threads");
    expect(searchSettings("usage quota").map((item) => item.id)).not.toContain(
      "snooze-limited-threads",
    );
    expect(searchSettings("usage quota").map((item) => item.id)).toContain(
      "auto-resume-limited-threads",
    );
  });
  it.each(["t3-connect", "hold-webhooks-while-offline", "publish-agent-activity"] as const)(
    "targets the independent T3 Connect row for %s",
    (id) => {
      const item: SettingsSearchItem | undefined = SETTINGS_SEARCH_ITEMS.find(
        (entry) => entry.id === id,
      );

      expect(item).toMatchObject({ id, to: "/settings/connections", targetId: id });
      expect(item?.targetId ?? item?.id).toBe(id);
      expect(searchableSetting(id).id).toBe(id);
    },
  );

  it.each(["OTel", "OTLP", "telemetry export", "Grafana"])(
    "finds environment telemetry settings for %s",
    (query) => {
      expect(searchSettings(query)).toContainEqual(
        expect.objectContaining({
          id: "telemetry-export",
          to: "/settings/diagnostics",
          targetId: "telemetry-export",
          scope: "environment",
        }),
      );
    },
  );
  it.each(["send shortcut", "multiline", "new line"])("finds Send shortcut for %s", (query) => {
    expect(searchSettings(query).map((item) => item.id)).toContain("send-shortcut");
  });

  it("matches titles, sections, and remembered setting details", () => {
    expect(searchSettings("word", ITEMS).map((item) => item.id)).toEqual(["word-wrap"]);
    expect(searchSettings("network", ITEMS).map((item) => item.id)).toEqual(["network-access"]);
    expect(searchSettings("connections", ITEMS).map((item) => item.id)).toEqual(["network-access"]);
    expect(searchSettings("claude", ITEMS).map((item) => item.id)).toEqual(["providers"]);
    expect(searchSettings("long lines", ITEMS).map((item) => item.id)).toEqual(["word-wrap"]);
  });

  it("matches normalized title substrings", () => {
    expect(searchSettings("  WORD   WRAP  ", ITEMS).map((item) => item.id)).toEqual(["word-wrap"]);
    expect(searchSettings("glass").map((item) => item.id)).toEqual(["setting-glass-opacity"]);
    expect(searchSettings("panel animations").map((item) => item.id)).toEqual(["panel-animations"]);
    expect(searchSettings("thè\u{1ab0}mes")[0]?.id).toBe("theme");
    const localeLowerCase = vi.spyOn(String.prototype, "toLocaleLowerCase").mockReturnValue("gıt");
    try {
      expect(searchSettings("GIT")[0]?.id).toBe("git-fetch-interval");
      expect(localeLowerCase).not.toHaveBeenCalled();
    } finally {
      localeLowerCase.mockRestore();
    }
    expect(searchSettings("xyzzy")).toEqual([]);
  });

  it("matches query words across fields and ranks the strongest result first", () => {
    expect(searchSettings("pairing remote", ITEMS).map((item) => item.id)).toEqual([
      "network-access",
    ]);
    expect(
      searchSettings("remote pairing")
        .slice(0, 2)
        .map((item) => item.id),
    ).toEqual(["network-access", "connections-environment"]);
  });

  it("hides desktop-only settings from browser search", () => {
    expect(SETTINGS_SEARCH_ITEMS.some((item) => item.id === "quit-confirmation")).toBe(true);
    expect(searchSettings("hold to quit")).toEqual([]);
    expect(searchSettings("wsl")).toEqual([]);
    expect(searchSettings("update track")).toEqual([]);
  });

  it("hides settings whose controls are unavailable", () => {
    const available = filterAvailableSettingsSearchItems({
      hasCloudPublicConfig: false,
      hasEnvironment: false,
      hasProviderSettingsEnvironment: false,
      hasMacProviderSettingsEnvironment: false,
      canManageLocalBackend: false,
      isWslSettingsRowVisible: false,
      hasThreadAutoSettlement: false,
    });

    const gatedIds = new Set<string>([
      "follow-change-request-templates",
      "git-fetch-interval",
      "network-access",
      "publish-agent-activity",
      "provider-health-check-interval",
      "cursor-keychain-usage",
      "source-control-writer-model",
      "review-guide-model",
      "review-guide-instructions",
      "source-control-writing-style",
      "t3-connect",
      "hold-webhooks-while-offline",
      "tailscale-https",
      "wsl-backend",
      "auto-settle-inactive-threads",
      "auto-settle-merged-threads",
      "days-before-auto-settle",
    ]);
    expect(available.map((item) => item.id).filter((id) => gatedIds.has(id))).toEqual([]);
  });

  it("offers Cursor Keychain settings only when a macOS provider environment is available", () => {
    const availability = {
      hasCloudPublicConfig: false,
      hasEnvironment: true,
      hasProviderSettingsEnvironment: true,
      hasMacProviderSettingsEnvironment: false,
      canManageLocalBackend: false,
      isWslSettingsRowVisible: false,
      hasThreadAutoSettlement: false,
    };
    const itemIds = (macAvailable: boolean) =>
      filterAvailableSettingsSearchItems({
        ...availability,
        hasMacProviderSettingsEnvironment: macAvailable,
      }).map((item) => item.id);
    expect(itemIds(false)).not.toContain("cursor-keychain-usage");
    expect(itemIds(true)).toContain("cursor-keychain-usage");
  });

  it("keeps the local toggle searchable without offering hidden host publishing controls", () => {
    const availability = {
      canReadRelay: true,
      hasCloudPublicConfig: true,
      hasEnvironment: true,
      hasProviderSettingsEnvironment: true,
      hasMacProviderSettingsEnvironment: false,
      canManageLocalBackend: false,
      isWslSettingsRowVisible: false,
      hasThreadAutoSettlement: false,
    };
    const remoteOnly = filterAvailableSettingsSearchItems({
      ...availability,
      localEnvironmentDisabled: true,
    }).map((item) => item.id);
    expect(remoteOnly).toContain("local-environment");
    expect(remoteOnly).not.toContain("t3-connect");
    expect(remoteOnly).not.toContain("publish-agent-activity");
    expect(remoteOnly).not.toContain("wsl-backend");
    // Browsers without access:write still render CloudLinkRow for their host.
    const browser = filterAvailableSettingsSearchItems(availability).map((item) => item.id);
    expect(browser).toContain("publish-agent-activity");
  });

  it.each([
    [false, false],
    [false, true],
    [true, false],
    [true, true],
  ])(
    "matches relay row visibility with read=%s and tunnel=%s",
    (canReadRelay, managedTunnelActive) => {
      const availability = {
        hasCloudPublicConfig: true,
        hasEnvironment: true,
        hasProviderSettingsEnvironment: true,
        hasMacProviderSettingsEnvironment: false,
        canManageLocalBackend: true,
        isWslSettingsRowVisible: false,
        hasThreadAutoSettlement: false,
        canReadRelay,
        managedTunnelActive,
      };
      const ids = filterAvailableSettingsSearchItems(availability).map((item) => item.id);

      expect(ids).toContain("t3-connect");
      expect.soft(ids.includes("publish-agent-activity")).toBe(canReadRelay);
      expect
        .soft(ids.includes("hold-webhooks-while-offline"))
        .toBe(canReadRelay && managedTunnelActive);
    },
  );

  it("offers webhook holding only while the managed tunnel is on, like its row", () => {
    const availability = {
      canReadRelay: true,
      hasCloudPublicConfig: true,
      hasEnvironment: true,
      hasProviderSettingsEnvironment: true,
      hasMacProviderSettingsEnvironment: false,
      canManageLocalBackend: true,
      isWslSettingsRowVisible: false,
      hasThreadAutoSettlement: false,
    };
    const itemIds = (managedTunnelActive: boolean) =>
      filterAvailableSettingsSearchItems({ ...availability, managedTunnelActive }).map(
        (item) => item.id,
      );
    expect(itemIds(false)).not.toContain("hold-webhooks-while-offline");
    expect(itemIds(true)).toContain("hold-webhooks-while-offline");
  });

  it("shows automatic settlement settings when the server supports them", () => {
    const available = filterAvailableSettingsSearchItems({
      hasCloudPublicConfig: false,
      hasEnvironment: false,
      hasProviderSettingsEnvironment: false,
      hasMacProviderSettingsEnvironment: false,
      canManageLocalBackend: false,
      isWslSettingsRowVisible: false,
      hasThreadAutoSettlement: true,
    });

    expect(searchSettings("auto-settle", available).map((item) => item.id)).toEqual([
      "auto-settle-inactive-threads",
      "auto-settle-merged-threads",
      "days-before-auto-settle",
    ]);
  });

  it("finds keybinding commands by label, command id, and default key", () => {
    expect(searchSettings("toggle sidebar")[0]?.id).toBe("keybinding-sidebar.toggle");
    expect(searchSettings("sidebar.toggle")[0]?.id).toBe("keybinding-sidebar.toggle");
    expect(searchSettings("mod+b")[0]?.id).toBe("keybinding-sidebar.toggle");
    expect(searchSettings("copy link")[0]).toMatchObject({
      id: "keybinding-thread.copyReference",
      to: "/settings/keybindings",
    });
  });

  it("sends commands without a default binding to the section", () => {
    expect(searchSettings("thread.stop")[0]).toMatchObject({
      id: "keybinding-thread.stop",
      targetId: "keybindings",
    });
    expect(searchSettings("sidebar.toggle")[0]?.targetId).toBeUndefined();
  });

  it("keeps catalog result ids unique", () => {
    const ids = SETTINGS_SEARCH_ITEMS.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("serves anchor props to panels from the catalog", () => {
    expect(searchableSetting("word-wrap")).toEqual({ id: "word-wrap", title: "Word wrap" });
    expect(searchableSetting("archive")).toEqual({ id: "archive", title: "Archived threads" });
  });

  it("routes appearance settings to their current section", () => {
    expect(searchSettings("theme")[0]).toMatchObject({
      id: "theme",
      to: "/settings/appearance",
    });
    expect(searchSettings("word wrap")[0]).toMatchObject({
      id: "word-wrap",
      to: "/settings/appearance",
    });
    expect(searchSettings("composer context")[0]).toMatchObject({
      id: "composer-context",
      to: "/settings/appearance",
    });
    expect(searchSettings("environment identification")[0]).toMatchObject({
      id: "environment-identification",
      to: "/settings/appearance",
      targetId: "appearance-interface",
    });
  });

  it("routes conditional window capture settings to the stable toggle row", () => {
    const targets = [
      "capture accessibility data",
      "capture shortcut",
      "capture sound",
      "capture flash",
      "capture animations",
    ].map((query) => {
      const match = searchSettings(query)[0];
      return [match?.id, match?.targetId];
    });

    expect(targets).toEqual([
      ["snap-shot-accessibility", "snap-shot-enabled"],
      ["snap-shot-shortcut", "snap-shot-enabled"],
      ["snap-shot-sound", "snap-shot-enabled"],
      ["snap-shot-flash", "snap-shot-enabled"],
      ["snap-shot-animations", "snap-shot-enabled"],
    ]);
  });

  it("routes browser recording quality to integrations", () => {
    const result = searchSettings("recording frame rate")[0];
    expect(result).toMatchObject({
      id: "browser-recording-frame-rate",
      to: "/settings/integrations",
    });
    expect(result).not.toHaveProperty("targetId");
  });

  it("routes where links open to integrations", () => {
    expect(searchSettings("open links in")[0]).toMatchObject({
      id: "browser-link-target",
      to: "/settings/integrations",
    });
    expect(searchSettings("external links")[0]).toMatchObject({ id: "browser-link-target" });
  });

  it("finds the independent default browser profile row", () => {
    expect(searchSettings("default profile")[0]).toMatchObject({
      id: "browser-default-profile",
      to: "/settings/integrations",
      targetId: "browser-default-profile",
    });
  });

  it.each([
    ["default model", "default-model", "/settings/general"],
    ["new threads", "new-threads", "/settings/general"],
    ["agent browser access", "agent-browser-access", "/settings/integrations"],
    ["automatically pull", "automatic-pull", "/settings/source-control"],
    ["actions", "project-actions", "/settings/projects"],
    ["project overview", "project-overview", "/settings/projects"],
  ])("routes %s to its owning category", (query, id, to) => {
    expect(searchSettings(query)[0]).toMatchObject({ id, to });
  });

  it("keeps environment settings discoverable without a primary environment", () => {
    const available = filterAvailableSettingsSearchItems({
      hasCloudPublicConfig: false,
      hasEnvironment: true,
      hasProviderSettingsEnvironment: true,
      hasMacProviderSettingsEnvironment: false,
      canManageLocalBackend: false,
      isWslSettingsRowVisible: false,
      hasThreadAutoSettlement: true,
    });
    expect(searchSettings("writing style", available)[0]?.id).toBe("source-control-writing-style");
    expect(searchSettings("auto-settle", available)).toHaveLength(3);
  });
});

describe("settings search targets", () => {
  it("requires an environment for the resolved telemetry export destination", () => {
    const result = searchSettings("OpenTelemetry export").find(
      (item) => item.id === "telemetry-export",
    )!;
    const target = getSettingsSearchTargetScope(result.targetId ?? result.id)!;
    expect(isSettingsSearchScopeAvailable(target.scope, "all")).toBe(false);
    expect(isSettingsSearchScopeAvailable(target.scope, "project")).toBe(false);
    expect(isSettingsSearchScopeAvailable(target.scope, "environment")).toBe(true);
  });

  it("keeps environment-wide settings out of project scopes", () => {
    const updates = getSettingsSearchTargetScope("provider-update-checks")!;
    expect(updates.scope).toBe("environment-defaults");
    expect(isSettingsSearchScopeAvailable(updates.scope, "environment")).toBe(true);
    expect(isSettingsSearchScopeAvailable(updates.scope, "all")).toBe(true);
    expect(isSettingsSearchScopeAvailable(updates.scope, "project")).toBe(false);
    const streaming = getSettingsSearchTargetScope("response-streaming")!;
    expect(streaming.scope).toBe("project-defaults");
    expect(isSettingsSearchScopeAvailable(streaming.scope, "project")).toBe(true);
    for (const id of ["legacy-plan-mode", "legacy-context-window-indicator", "legacy-sidebar"]) {
      expect(getSettingsSearchTargetScope(id)!.scope).toBeNull();
    }
  });
});

describe("auto-settlement search availability", () => {
  function environment(id: string, { connected = true, loaded = true, supported = true } = {}) {
    return {
      environmentId: EnvironmentId.make(id),
      connection: { phase: connected ? ("connected" as const) : ("offline" as const) },
      serverConfig: loaded
        ? { environment: { capabilities: { threadAutoSettlement: supported } } }
        : null,
    };
  }

  const capable = environment("capable");
  const unsupported = environment("unsupported", { supported: false });
  const offline = environment("offline", { connected: false });
  const loading = environment("loading", { loaded: false });
  const environments = [capable, unsupported, offline, loading];

  it("keeps results discoverable when one connected environment supports them", () => {
    const availability = getThreadAutoSettlementSearchAvailability(environments);
    expect(availability.eligibleEnvironmentIds).toEqual([capable.environmentId]);
    const items = filterAvailableSettingsSearchItems({
      hasCloudPublicConfig: false,
      hasEnvironment: true,
      hasProviderSettingsEnvironment: true,
      hasMacProviderSettingsEnvironment: false,
      canManageLocalBackend: false,
      isWslSettingsRowVisible: false,
      hasThreadAutoSettlement: availability.eligibleEnvironmentIds.length > 0,
    });
    expect(searchSettings("auto-settle", items).map((item) => item.id)).toEqual([
      "auto-settle-inactive-threads",
      "auto-settle-merged-threads",
      "days-before-auto-settle",
    ]);
  });

  it("offers only capable environments when an aggregate has mixed capabilities", () => {
    expect(
      getThreadAutoSettlementSearchAvailability(environments, {
        kind: "all",
        environmentIds: environments.map((entry) => entry.environmentId),
      }),
    ).toEqual({ eligibleEnvironmentIds: [capable.environmentId], isTargetAvailable: false });
  });

  it.each([unsupported, offline, loading])(
    "does not render the target on $environmentId or silently fall back",
    (selected) => {
      expect(
        getThreadAutoSettlementSearchAvailability(environments, {
          kind: "environment",
          environmentIds: [selected.environmentId],
        }),
      ).toEqual({ eligibleEnvironmentIds: [capable.environmentId], isTargetAvailable: false });
    },
  );

  it("ignores offline and unloaded targets when all connected targets support the setting", () => {
    const selected = [capable, offline, loading];
    expect(
      getThreadAutoSettlementSearchAvailability(selected, {
        kind: "all",
        environmentIds: selected.map((entry) => entry.environmentId),
      }).isTargetAvailable,
    ).toBe(true);
  });
});

it.each([false, true])(
  "only offers EAS search when the selected device state supports it: %s",
  (hasEasHosts) => {
    const items = filterAvailableSettingsSearchItems({
      hasCloudPublicConfig: false,
      hasEnvironment: true,
      hasProviderSettingsEnvironment: true,
      hasMacProviderSettingsEnvironment: false,
      canManageLocalBackend: false,
      isWslSettingsRowVisible: false,
      hasThreadAutoSettlement: false,
      hasEasHosts,
    });
    expect(searchSettings("Expo", items).some((item) => item.id === "eas-device-hosts")).toBe(
      hasEasHosts,
    );
  },
);

describe("EAS representative device availability", () => {
  const a = EnvironmentId.make("a");
  const b = EnvironmentId.make("b");
  const connected = [a, b].map((environmentId) => ({
    environmentId,
    label: environmentId,
    connection: { phase: "connected" as const },
    serverConfig: { settings: DEFAULT_SERVER_SETTINGS },
  }));

  it.each([
    ["unsupported", { supportsEasHosts: false }, false],
    ["unknown state", undefined, false],
    ["unknown capability", {}, false],
    ["supported", { supportsEasHosts: true }, true],
  ] as const)("hides or shows the representative with %s", (_label, state, expected) => {
    expect(getEasSearchEnvironmentId({}, [], connected, a)).toBe(a);
    const items = filterAvailableSettingsSearchItems({
      hasCloudPublicConfig: false,
      hasEnvironment: true,
      hasProviderSettingsEnvironment: true,
      hasMacProviderSettingsEnvironment: false,
      canManageLocalBackend: false,
      isWslSettingsRowVisible: false,
      hasThreadAutoSettlement: false,
      hasEasHosts: hasEasSearchSupport(state),
    });
    expect(searchSettings("Expo", items).some((item) => item.id === "eas-device-hosts")).toBe(
      expected,
    );
  });

  it("has no device subscription or EAS support when no connected target exists", () => {
    const offline = connected.map((entry) => ({
      ...entry,
      connection: { phase: "offline" as const },
    }));
    expect(getEasSearchEnvironmentId({}, [], offline, a)).toBeNull();
    expect(getEasSearchEnvironmentId({}, [], [], a)).toBeNull();
    expect(hasEasSearchSupport(undefined)).toBe(false);
  });

  it("switches representative with scope instead of retaining the primary machine", () => {
    expect(getEasSearchEnvironmentId({}, [], connected, a)).toBe(a);
    expect(getEasSearchEnvironmentId({ machine: b }, [], connected, a)).toBe(b);
    expect(getEasSearchEnvironmentId({ machine: "missing" }, [], connected, a)).toBeNull();
  });
});
