/** Protects the shared slab/native-menu action set, counts and mixed-environment availability. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { installMessages } from "~/i18n";
import { en } from "~/i18n/locales/en";
import { messages as zhCN } from "~/i18n/locales/zh-CN";
import { makeThreadFixture } from "~/test-fixtures";
import { buildSidebarBulkActionModel } from "./sidebarBulkActions.logic";

const snoozeUi = vi.hoisted(() => ({ enabled: true }));
vi.mock("~/snoozeUi", () => ({
  get SNOOZE_UI_ENABLED() {
    return snoozeUi.enabled;
  },
}));
beforeEach(() => {
  snoozeUi.enabled = true;
});

const local = EnvironmentId.make("local");
const remote = EnvironmentId.make("remote");
const first = makeThreadFixture({ id: ThreadId.make("first"), environmentId: local });
const second = makeThreadFixture({ id: ThreadId.make("second"), environmentId: remote });
const base = {
  selectedThreadKeys: new Set(["local:first", "remote:second"]),
  threadByKey: new Map([
    ["local:first", first],
    ["remote:second", second],
  ]),
  supports: () => true,
  canOperate: () => true,
  now: "2026-10-17T08:00:00.000Z",
  snoozePresets: [
    {
      id: "hour",
      label: "In 1 hour",
      whenLabel: "10:00 AM",
      snoozedUntil: "2026-10-17T09:00:00.000Z",
    },
  ] as const,
};

beforeEach(() => installMessages("en", en));
afterEach(() => installMessages("zh-CN", zhCN));

describe("shared sidebar bulk actions", () => {
  it("omits snooze from an eligible selection when the UI is disabled", () => {
    snoozeUi.enabled = false;
    const model = buildSidebarBulkActionModel(base);
    expect(model.items.map((item) => item.id)).toEqual([
      "settle",
      "regenerate-title",
      "mark-unread",
      "delete",
    ]);
  });
  it("counts only rendered selected rows and keeps their action targets in selection order", () => {
    const model = buildSidebarBulkActionModel({
      ...base,
      selectedThreadKeys: new Set(["remote:second", "missing", "local:first"]),
    });
    expect(model.threadKeys).toEqual(["remote:second", "local:first"]);
    expect(model.selectedThreads.map((thread) => thread.id)).toEqual(["second", "first"]);
    expect(model.items.find((item) => item.id === "delete")?.label).toBe("Delete (2)");
  });

  it("offers no actions when every selected row has left the rendered list", () => {
    const model = buildSidebarBulkActionModel({
      ...base,
      selectedThreadKeys: new Set(["missing"]),
    });
    expect(model.items).toEqual([]);
    expect(model.selectedThreads).toEqual([]);
  });

  it("checks grants per action target while retaining the client-only unread action", () => {
    const model = buildSidebarBulkActionModel({
      ...base,
      threadByKey: new Map([
        ["local:first", { ...first, pinnedAt: "2026-10-17T07:00:00.000Z" }],
        ["remote:second", { ...second, settledOverride: "settled" }],
      ]),
      supports: (environmentId, capability) =>
        capability !== "threadTitleRegeneration" || environmentId === local,
      canOperate: (threads) => threads.every((thread) => thread.environmentId === local),
    });
    expect(model.items.find((item) => item.id === "settle")?.disabled).toBe(false);
    expect(model.items.find((item) => item.id === "unpin")?.disabled).toBe(false);
    expect(model.items.find((item) => item.id === "regenerate-title")?.disabled).toBe(false);
    expect(model.items.find((item) => item.id === "delete")?.disabled).toBe(true);
    expect(model.items.find((item) => item.id === "snooze")).toMatchObject({
      disabled: true,
      children: [
        { id: "snooze:hour", disabled: true },
        { id: "snooze:custom", disabled: true },
      ],
    });
    expect(model.items.find((item) => item.id === "mark-unread")).toEqual({
      id: "mark-unread",
      label: "Mark unread (2)",
    });
  });

  it.each(["unsupported", "approval", "input"] as const)(
    "omits snooze for the entire mixed selection when one thread is %s",
    (blocker) => {
      const model = buildSidebarBulkActionModel({
        ...base,
        threadByKey: new Map([
          ["local:first", first],
          [
            "remote:second",
            {
              ...second,
              hasPendingApprovals: blocker === "approval",
              hasPendingUserInput: blocker === "input",
            },
          ],
        ]),
        supports: (environmentId, capability) =>
          !(blocker === "unsupported" && environmentId === remote && capability === "threadSnooze"),
      });
      expect(model.items.map((item) => item.id)).toEqual([
        "settle",
        "regenerate-title",
        "mark-unread",
        "delete",
      ]);
      expect(model.items.find((item) => item.id === "settle")?.disabled).toBe(false);
    },
  );

  it("limits unpin and regeneration targets to supported actionable rows", () => {
    const pending = { requestId: "title-request", startedAt: "2026-10-17T07:55:00.000Z" };
    const model = buildSidebarBulkActionModel({
      ...base,
      selectedThreadKeys: new Set(["local:first", "remote:second", "local:third"]),
      threadByKey: new Map([
        [
          "local:first",
          { ...first, pinnedAt: "2026-10-17T07:00:00.000Z", titleRegeneration: pending },
        ],
        ["remote:second", { ...second, pinnedAt: "2026-10-17T07:01:00.000Z" }],
        ["local:third", makeThreadFixture({ id: ThreadId.make("third"), environmentId: local })],
      ]),
      supports: (environmentId) => environmentId === local,
    });
    expect(model.pinnedSelectedThreads.map((thread) => thread.id)).toEqual(["first"]);
    expect(model.regeneratableTitleThreads.map((thread) => thread.id)).toEqual(["third"]);
    expect(model.items.find((item) => item.id === "unpin")?.label).toBe("Unpin (1)");
    expect(model.items.find((item) => item.id === "regenerate-title")?.label).toBe(
      "Regenerate titles (1)",
    );
  });

  it("disables completed settlement and shows regeneration already in progress", () => {
    const model = buildSidebarBulkActionModel({
      ...base,
      selectedThreadKeys: new Set(["local:first"]),
      threadByKey: new Map([
        [
          "local:first",
          {
            ...first,
            settledOverride: "settled",
            titleRegeneration: {
              requestId: "title-request",
              startedAt: "2026-10-17T07:55:00.000Z",
            },
          },
        ],
      ]),
    });
    expect(model.items.find((item) => item.id === "settle")?.disabled).toBe(true);
    expect(model.settlingThreads).toEqual([]);
    expect(model.items.find((item) => item.id === "regenerate-title")).toEqual({
      id: "regenerate-title",
      label: "Regenerating… (1)",
      disabled: true,
    });
  });
});
