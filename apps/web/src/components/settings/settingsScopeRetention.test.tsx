// @vitest-environment jsdom
/** Exercises scope retention and page scrolling through the settings shell and real search-target lifecycle. */
import { act, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import type { SettingsScopeSearch } from "./settingsScope";

interface ScopeState {
  readonly search: SettingsScopeSearch;
  readonly environmentId: string | null;
}

const state = vi.hoisted(() => ({
  pathname: "/settings/diagnostics",
  hash: "",
  navigate: vi.fn(),
  scope: { search: {}, environmentId: null } as ScopeState,
}));

vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  createFileRoute: () => (options: { component: () => ReactNode }) => ({
    options,
    useSearch: () => state.scope.search,
    useNavigate: () => vi.fn(),
  }),
  useNavigate: () => state.navigate,
  useLocation: (options?: { select: (location: unknown) => unknown }) => {
    const location = { pathname: state.pathname, hash: state.hash, state: {} };
    return options ? options.select(location) : location;
  },
  Outlet: () => <StatefulContent />,
  redirect: vi.fn(),
}));
vi.mock("./SettingsScopeContext", async () => {
  const { createContext, useContext } = await import("react");
  const Scope = createContext<ScopeState>(state.scope);
  return {
    SettingsScopeProvider: ({ children }: { children: ReactNode }) => (
      <Scope value={state.scope}>{children}</Scope>
    ),
    useOptionalSettingsScope: () => null,
    useSettingsScope: () => {
      const { search, environmentId } = useContext(Scope);
      return {
        search,
        scope: { kind: "all" },
        environment: environmentId ? { environmentId } : null,
        connectedEnvironments: environmentId ? [{}] : [],
      };
    },
  };
});
vi.mock("../../state/environments", () => ({ useEnvironments: () => ({ environments: [] }) }));
vi.mock("./SettingsBreadcrumb", () => ({
  SettingsBreadcrumb: () => null,
  SettingsPageHeading: () => null,
}));
vi.mock("../sidebar/mainAppLocation", () => ({ useNavigateToMainApp: () => vi.fn() }));
vi.mock("../../hooks/useNavigateBack", () => ({ useEscapeToGoBack: () => undefined }));
vi.mock("./SettingsPanels", () => ({ useSettingsRestore: () => ({ changedSettingLabels: [] }) }));

import { Route } from "../../routes/settings";
import { TitlebarSlotProvider } from "../frame/titlebarSlot";
import { SettingsPageContainer, SettingsSearchTarget } from "./settingsLayout";

/** Supplies an interactive child page and a real search destination without loading individual settings panels. */
function StatefulContent() {
  const [value, setValue] = useState(0);
  return (
    <SettingsPageContainer>
      <button aria-label="Retained value" onClick={() => setValue(value + 1)}>
        {value}
      </button>
      <SettingsSearchTarget id="theme">Theme</SettingsSearchTarget>
    </SettingsPageContainer>
  );
}

let root: Root;
let container: HTMLDivElement;
const Layout = Route.options.component!;
await Layout.preload?.();
const originalScrollIntoView = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "scrollIntoView",
);

/** Applies the supplied router scope while retaining the mounted app shell. */
async function render(scope: ScopeState) {
  state.scope = scope;
  await act(async () =>
    root.render(
      <TitlebarSlotProvider>
        <Layout />
      </TitlebarSlotProvider>,
    ),
  );
}
function retainedValue() {
  return container.querySelector('button[aria-label="Retained value"]')?.textContent ?? null;
}

/** Reads the actual scroll container so assertions cover DOM state rather than reset callbacks. */
function pageScroll() {
  const element = container.querySelector<HTMLElement>("[data-settings-page-scroll]");
  if (!element) throw new Error("Settings page scroll container is missing.");
  return element;
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  state.pathname = "/settings/diagnostics";
  state.hash = "";
  state.navigate.mockReset();
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: true })),
  );
  // jsdom has no layout/scrollIntoView. Supply fixed geometry and the browser's
  // centered-scroll effect; the real target ref still owns when scrolling happens.
  vi.spyOn(HTMLElement.prototype, "offsetTop", "get").mockReturnValue(1200);
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(40);
  vi.spyOn(Element.prototype, "clientHeight", "get").mockReturnValue(480);
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value(this: HTMLElement) {
      const scroll = this.closest<HTMLElement>("[data-settings-page-scroll]");
      if (!scroll) throw new Error("Search destination has no settings scroll container.");
      scroll.scrollTop = this.offsetTop - (scroll.clientHeight - this.offsetHeight) / 2;
    },
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  if (originalScrollIntoView) {
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", originalScrollIntoView);
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
  }
  vi.unstubAllGlobals();
});

const first = { search: { machine: "first", project: "one" }, environmentId: "first" };
const otherProject = { search: { machine: "first", project: "two" }, environmentId: "first" };
const otherMachine = { search: { machine: "second", project: "one" }, environmentId: "second" };
const implicitFirst = { search: { project: "one" }, environmentId: "first" };
const implicitSecond = { search: { project: "one" }, environmentId: "second" };

const disconnected = { search: first.search, environmentId: null };

it.each([
  ["/settings/diagnostics", "another project", "1", first, otherProject],
  ["/settings/providers", "another project", "1", first, otherProject],
  ["/settings/diagnostics", "another environment", "0", first, otherMachine],
  ["/settings/providers", "another environment", "0", first, otherMachine],
  ["/settings/diagnostics", "an implicit environment change", "0", implicitFirst, implicitSecond],
  ["/settings/providers", "an implicit environment change", "0", implicitFirst, implicitSecond],
  ["/settings/diagnostics", "a disconnect", "0", first, disconnected],
  ["/settings/keybindings", "another project", "0", first, otherProject],
])("%s after %s shows %s", async (pathname, _change, expected, before, after) => {
  state.pathname = pathname;
  await render(before);
  await act(async () =>
    container.querySelector<HTMLButtonElement>('button[aria-label="Retained value"]')?.click(),
  );
  expect(retainedValue()).toBe("1");

  await render(after);

  expect(retainedValue()).toBe(expected);
});

it("starts a different settings category at the top after scrolling the previous page", async () => {
  await render(first);
  pageScroll().scrollTop = 640;
  expect(pageScroll().scrollTop).toBe(640);

  state.pathname = "/settings/appearance";
  await render(first);

  expect(pageScroll().scrollTop).toBe(0);
});

it("keeps a search destination centered after changing category and clearing its hash", async () => {
  await render(first);
  pageScroll().scrollTop = 640;

  state.pathname = "/settings/appearance";
  state.hash = "theme";
  await render(first);

  expect(pageScroll().scrollTop).toBe(980);
  expect(document.activeElement?.id).toBe("theme");
  expect(state.navigate).toHaveBeenCalledWith({
    hash: "",
    replace: true,
    resetScroll: false,
    hashScrollIntoView: false,
    state: { settingsTargetHighlight: true },
  });

  state.hash = "";
  await render(first);

  expect(pageScroll().scrollTop).toBe(980);
  expect(document.activeElement?.id).toBe("theme");
});
