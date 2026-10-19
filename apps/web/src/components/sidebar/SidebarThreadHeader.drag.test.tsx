/**
 * @vitest-environment jsdom
 * Exercises real header drop registration and the sidebar pointer sensor without a browser server.
 */
import { act, createRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  DndContext,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { installMessages } from "~/i18n";
import { en } from "~/i18n/locales/en";
import { SidebarPointerSensor } from "../Sidebar.pointer";
import { SidebarThreadHeader, type SidebarThreadHeaderProps } from "./SidebarThreadHeader";
import {
  SidebarThreadDndContext,
  type SidebarTabDragSource,
  type SidebarTabDropActions,
} from "./SidebarThreadDndContext";
import { createSidebarCollisionDetection } from "../Sidebar.drag";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";

vi.mock("@tanstack/react-router", () => ({ useLocation: () => "/" }));
const snoozeFlag = vi.hoisted(() => ({ SNOOZE_UI_ENABLED: true }));
vi.mock("../../snoozeUi", () => snoozeFlag);

let root: Root;
let host: HTMLDivElement;
const sensors: SidebarPointerSensor[] = [];
const headerProps: SidebarThreadHeaderProps = {
  hasProjects: false,
  currentTab: "active",
  tabCounts: { active: 1, later: 0, settled: 0 },
  onTabChange: () => {},
  onOpenDiscussions: () => {},
  onNewThread: () => {},
  newThreadDisabled: false,
  newThreadShortcutLabel: null,
  newThreadInProjectShortcutLabel: null,
  showNewThreadInProjectHint: false,
  searchInputRef: createRef<HTMLInputElement>(),
  searchQuery: "",
  onSearchQueryChange: () => {},
  onSearchKeyDown: () => {},
  isSearching: false,
  searchResultCount: 0,
  activeSearchResultIndex: 0,
  onClearSearch: () => {},
};

/** Supply one real draggable row; fixture geometry is separate from the drop targets. */
function DragSource() {
  const { setNodeRef, listeners } = useDraggable({ id: "env:thread" });
  return (
    <button ref={setNodeRef} {...listeners} data-drag-source>
      Thread
    </button>
  );
}

/** Keep a real list target available to catch accidental fallback from a tab into row sorting. */
function ListTarget() {
  const { setNodeRef } = useDroppable({ id: "env:list-target" });
  return (
    <div ref={setNodeRef} data-list-target>
      Other thread
    </div>
  );
}

/** Mount the same context, header, sensor and list collision resolver used by Sidebar. */
function LifecycleFixture({
  actions,
  onListDrop,
}: {
  actions: SidebarTabDropActions;
  onListDrop: (target: string | null) => void;
}) {
  const source = actions.getSource("env:thread");
  const currentTab =
    source?.section === "snoozed" ? "later" : source?.section === "settled" ? "settled" : "active";
  const registeredSensors = useSensors(
    useSensor(SidebarPointerSensor, {
      distance: 6,
      onAttach: (sensor) => sensors.push(sensor),
      onFinish: () => {},
    }),
  );
  return (
    <SidebarThreadDndContext
      sensors={registeredSensors}
      autoScroll={false}
      // As in Sidebar, the lifted card stays below the header while the pointer can reach a tab.
      modifiers={[restrictToVerticalAxis, ({ transform }) => ({ ...transform, y: 0 })]}
      collisionDetection={createSidebarCollisionDetection(() => true)}
      tabDrop={actions}
      onDragEnd={(event) => onListDrop(event.over ? String(event.over.id) : null)}
    >
      <SidebarThreadHeader {...headerProps} currentTab={currentTab} />
      <DragSource />
      <ListTarget />
    </SidebarThreadDndContext>
  );
}

/** Fake only the command boundary: the real drag path chooses which lifecycle state changes. */
function lifecycle(source: Partial<SidebarTabDragSource> = {}) {
  const state = {
    source: {
      section: "active",
      canOperate: true,
      supportsSettlement: true,
      supportsSnooze: true,
      canSnooze: true,
      ...source,
    } as SidebarTabDragSource,
    menu: null as { x: number; y: number } | null,
    listTarget: null as string | null,
    mutations: 0,
    snoozedUntil: source.section === "snoozed" ? "2026-10-18T08:00:00.000Z" : null,
    settledOverride: source.section === "settled" ? "settled" : null,
  };
  const actions: SidebarTabDropActions = {
    getSource: (key) => (key === "env:thread" ? state.source : null),
    onDrop: (_key, intent, position) => {
      if (intent === "open-snooze-menu") {
        state.menu = position;
        return;
      }
      state.mutations += 1;
      if (intent === "settle") {
        state.settledOverride = "settled";
        state.snoozedUntil = null;
      }
      if (intent === "unsnooze") state.snoozedUntil = null;
      if (intent === "unsettle") state.settledOverride = null;
      state.source.section =
        state.snoozedUntil !== null
          ? "snoozed"
          : state.settledOverride !== null
            ? "settled"
            : "active";
    },
  };
  return { state, actions };
}

/** Release a row on a client-pixel tab coordinate after crossing the production drag threshold. */
async function dropAt(x: number, y = 95) {
  await point(host.querySelector("[data-drag-source]")!, "pointerdown", 40, 210);
  await point(document, "pointermove", x, y);
  await point(document, "pointerup", x, y);
}

/** Use the production sensor for project or Today headers; onDrop observes the actual release target. */
function RegistrationFixture({
  onDrop,
  today = null,
}: {
  onDrop: (id: string | null) => void;
  today?: SidebarThreadHeaderProps["today"];
}) {
  const registeredSensors = useSensors(
    useSensor(SidebarPointerSensor, {
      distance: 6,
      onAttach: (sensor) => sensors.push(sensor),
      onFinish: () => {},
    }),
  );
  return (
    <DndContext
      sensors={registeredSensors}
      collisionDetection={pointerWithin}
      autoScroll={false}
      onDragEnd={(event) => onDrop(event.over ? String(event.over.id) : null)}
    >
      <SidebarThreadHeader {...headerProps} today={today} />
      <DragSource />
    </DndContext>
  );
}

/** Dispatch client-pixel pointer events through React pickup and the sensor's document listeners. */
async function point(target: EventTarget, type: string, x: number, y: number) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    button: 0,
    buttons: type === "pointerup" ? 0 : 1,
  });
  Object.defineProperties(event, { pointerId: { value: 1 }, isPrimary: { value: true } });
  await act(() => {
    target.dispatchEvent(event);
  });
}

beforeEach(() => {
  // The original gesture suite protects restoration when the fork switch is enabled.
  snoozeFlag.SNOOZE_UI_ENABLED = true;
  installMessages("en", en);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement,
  ) {
    if (this.hasAttribute("data-drag-source")) return new DOMRect(0, 180, 280, 78);
    if (this.hasAttribute("data-list-target")) return new DOMRect(0, 400, 280, 78);
    const text = this.tagName === "BUTTON" ? this.textContent : "";
    if (text?.startsWith("Active")) return new DOMRect(0, 80, 90, 30);
    if (text?.startsWith("Later")) return new DOMRect(95, 80, 90, 30);
    if (text?.startsWith("Settled")) return new DOMRect(190, 80, 90, 30);
    if (text?.startsWith("AI replying")) return new DOMRect(0, 80, 140, 30);
    if (text?.startsWith("Needs you")) return new DOMRect(150, 80, 140, 30);
    return new DOMRect(0, 0, 300, 300);
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(() => {
    for (const sensor of sensors.splice(0)) sensor.cancel();
    root.unmount();
  });
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("header drag registration", () => {
  it("receives a released thread on the Settled tab through the real pointer sensor", async () => {
    let dropped: string | null = null;
    await act(() =>
      root.render(
        <RegistrationFixture
          onDrop={(id) => {
            dropped = id;
          }}
        />,
      ),
    );
    await point(host.querySelector("[data-drag-source]")!, "pointerdown", 40, 210);
    await point(document, "pointermove", 230, 95);
    await point(document, "pointerup", 230, 95);
    expect(dropped).toBe("sidebar-tab:settled");
  });
});

describe("sidebar tab lifecycle gestures with snooze UI enabled", () => {
  it("settles a row dropped on Settled without invoking list sorting", async () => {
    const { state, actions } = lifecycle();
    await act(() =>
      root.render(
        <LifecycleFixture
          actions={actions}
          onListDrop={(id) => {
            state.listTarget = id;
          }}
        />,
      ),
    );
    await dropAt(230);
    expect(state.source.section).toBe("settled");
    expect(state.mutations).toBe(1);
    expect(state.listTarget).toBeNull();
  });

  it("opens the existing duration menu on Later without snoozing before a duration is chosen", async () => {
    const { state, actions } = lifecycle();
    await act(() =>
      root.render(
        <LifecycleFixture
          actions={actions}
          onListDrop={(id) => {
            state.listTarget = id;
          }}
        />,
      ),
    );
    await dropAt(140);
    expect(state.menu).toEqual({ x: 95, y: 110 });
    expect(state.source.section).toBe("active");
    expect(state.mutations).toBe(0);
    expect(state.listTarget).toBeNull();
  });

  it.each(["snoozed", "settled"] as const)(
    "returns a %s row to Active through its lifecycle action",
    async (section) => {
      const { state, actions } = lifecycle({ section });
      await act(() =>
        root.render(
          <LifecycleFixture
            actions={actions}
            onListDrop={(id) => {
              state.listTarget = id;
            }}
          />,
        ),
      );
      await dropAt(40);
      expect(state.source.section).toBe("active");
      expect(state.mutations).toBe(1);
      expect(state.listTarget).toBeNull();
    },
  );

  it.each([
    { section: "active", x: 40 },
    { section: "pinned", x: 40 },
    { section: "working", x: 40 },
    { section: "snoozed", x: 140 },
    { section: "settled", x: 230 },
  ] as const)(
    "does nothing when a $section row is dropped on its own tab",
    async ({ section, x }) => {
      const { state, actions } = lifecycle({ section });
      await act(() =>
        root.render(
          <LifecycleFixture
            actions={actions}
            onListDrop={(id) => {
              state.listTarget = id;
            }}
          />,
        ),
      );
      await dropAt(x);
      expect(state.source.section).toBe(section);
      expect(state.mutations).toBe(0);
      expect(state.menu).toBeNull();
      expect(state.listTarget).toBeNull();
    },
  );

  it.each([
    { canOperate: false, x: 230 },
    { supportsSettlement: false, x: 230 },
    { supportsSnooze: false, x: 140 },
    { canSnooze: false, x: 140 },
  ])("rejects unavailable lifecycle drops: %j", async ({ x, ...availability }) => {
    const { state, actions } = lifecycle(availability);
    await act(() =>
      root.render(
        <LifecycleFixture
          actions={actions}
          onListDrop={(id) => {
            state.listTarget = id;
          }}
        />,
      ),
    );
    await dropAt(x);
    expect(state.source.section).toBe("active");
    expect(state.mutations).toBe(0);
    expect(state.menu).toBeNull();
    expect(state.listTarget).toBeNull();
  });

  it("rechecks a revoked grant at release after an eligible hover", async () => {
    const { state, actions } = lifecycle();
    await act(() =>
      root.render(
        <LifecycleFixture
          actions={actions}
          onListDrop={(id) => {
            state.listTarget = id;
          }}
        />,
      ),
    );
    await point(host.querySelector("[data-drag-source]")!, "pointerdown", 40, 210);
    await point(document, "pointermove", 230, 95);
    state.source.canOperate = false;
    await point(document, "pointerup", 230, 95);
    expect(state.source.section).toBe("active");
    expect(state.mutations).toBe(0);
    expect(state.listTarget).toBeNull();
  });

  it("keeps a pointer just outside the tabs on the ordinary row-sorting path", async () => {
    const { state, actions } = lifecycle();
    await act(() =>
      root.render(
        <LifecycleFixture
          actions={actions}
          onListDrop={(id) => {
            state.listTarget = id;
          }}
        />,
      ),
    );
    await dropAt(290);
    expect(state.source.section).toBe("active");
    expect(state.mutations).toBe(0);
    expect(state.listTarget).toBe("env:list-target");
    expect(state.menu).toBeNull();
  });

  it("cancels a hovered tab drop on Escape without changing lifecycle state", async () => {
    const { state, actions } = lifecycle();
    await act(() =>
      root.render(
        <LifecycleFixture
          actions={actions}
          onListDrop={(id) => {
            state.listTarget = id;
          }}
        />,
      ),
    );
    await point(host.querySelector("[data-drag-source]")!, "pointerdown", 40, 210);
    await point(document, "pointermove", 230, 95);
    await act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { code: "Escape", bubbles: true }));
    });
    await point(document, "pointerup", 230, 95);
    expect(state.source.section).toBe("active");
    expect(state.mutations).toBe(0);
    expect(state.listTarget).toBeNull();
  });
});

describe("header gestures with snooze UI disabled", () => {
  beforeEach(() => {
    snoozeFlag.SNOOZE_UI_ENABLED = false;
  });

  it("shows only project Active and Settled tabs and cannot receive a Later drop", async () => {
    const onDrop = vi.fn<(id: string | null) => void>();
    await act(() => root.render(<RegistrationFixture onDrop={onDrop} />));
    const tabLabels = Array.from(
      host.querySelectorAll("button[aria-pressed]"),
      (button) => button.textContent,
    );
    expect(tabLabels).toEqual(["Active1", "Settled0"]);
    await dropAt(140);
    expect(onDrop).toHaveBeenCalledExactlyOnceWith(null);
  });

  it.each([
    { tab: "working", x: 40 },
    { tab: "waiting", x: 230 },
  ] as const)("does not register Today's $tab tab as a pointer drop target", async ({ tab, x }) => {
    const onDrop = vi.fn<(id: string | null) => void>();
    await act(() =>
      root.render(
        <RegistrationFixture
          onDrop={onDrop}
          today={{
            currentTab: tab,
            counts: { working: 2, waiting: 3 },
            onTabChange: () => {},
          }}
        />,
      ),
    );
    expect(host.textContent).toContain("AI replying2");
    expect(host.textContent).toContain("Needs you3");
    await dropAt(x);
    expect(onDrop).toHaveBeenCalledExactlyOnceWith(null);
  });
});
