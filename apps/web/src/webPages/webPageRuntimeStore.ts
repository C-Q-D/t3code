/** Tracks opened web pages independently of persisted entries and the built-in browser. */
import { create } from "zustand";

/** Navigation reported by the desktop page host; failure is distinct from a loading state. */
export type WebPageNav = {
  url: string;
  title: string;
  loading: boolean;
  failure: { code: number; description: string } | null;
  canGoBack: boolean;
  canGoForward: boolean;
};

/** Pausing releases a page but preserves selection and its icon; forgetting removes both. */
interface WebPageRuntimeState {
  activeId: string | null;
  opened: Readonly<Record<string, true>>;
  navById: Readonly<Record<string, WebPageNav>>;
  faviconById: Readonly<Record<string, string>>;
  select: (id: string) => void;
  open: (id: string) => void;
  pause: (id: string) => void;
  forget: (id: string) => void;
  applyNav: (id: string, nav: WebPageNav) => void;
  applyFavicon: (id: string, dataUrl: string) => void;
}

const TAB_PREFIX = "web-page:";

/** Namespaces a saved entry id so page tabs cannot collide with built-in browser tabs. */
export function webPageRuntimeTabId(id: string): string {
  return `${TAB_PREFIX}${id}`;
}

/** Recovers the entire entry id, including delimiters; unrelated tab ids return null. */
export function parseWebPageRuntimeTabId(tabId: string): string | null {
  return tabId.startsWith(TAB_PREFIX) ? tabId.slice(TAB_PREFIX.length) : null;
}

/** Compares navigation values because host events can repeat with newly allocated failure objects. */
function navEquals(previous: WebPageNav | undefined, next: WebPageNav): boolean {
  return (
    previous !== undefined &&
    previous.url === next.url &&
    previous.title === next.title &&
    previous.loading === next.loading &&
    previous.canGoBack === next.canGoBack &&
    previous.canGoForward === next.canGoForward &&
    previous.failure?.code === next.failure?.code &&
    previous.failure?.description === next.failure?.description
  );
}

export const useWebPageRuntimeStore = create<WebPageRuntimeState>()((set) => ({
  activeId: null,
  opened: {},
  navById: {},
  faviconById: {},
  select: (id) =>
    set((state) => {
      if (state.activeId === id && Object.hasOwn(state.opened, id)) return state;
      return { activeId: id, opened: { ...state.opened, [id]: true } };
    }),
  open: (id) =>
    set((state) => {
      if (Object.hasOwn(state.opened, id)) return state;
      return { opened: { ...state.opened, [id]: true } };
    }),
  pause: (id) =>
    set((state) => {
      if (!Object.hasOwn(state.opened, id) && !Object.hasOwn(state.navById, id)) return state;
      const opened = { ...state.opened };
      const navById = { ...state.navById };
      delete opened[id];
      delete navById[id];
      return { opened, navById };
    }),
  forget: (id) =>
    set((state) => {
      if (
        state.activeId !== id &&
        !Object.hasOwn(state.opened, id) &&
        !Object.hasOwn(state.navById, id) &&
        !Object.hasOwn(state.faviconById, id)
      )
        return state;
      const opened = { ...state.opened };
      const navById = { ...state.navById };
      const faviconById = { ...state.faviconById };
      delete opened[id];
      delete navById[id];
      delete faviconById[id];
      return {
        activeId: state.activeId === id ? null : state.activeId,
        opened,
        navById,
        faviconById,
      };
    }),
  applyNav: (id, nav) =>
    set((state) => {
      if (navEquals(state.navById[id], nav)) return state;
      return { navById: { ...state.navById, [id]: nav } };
    }),
  applyFavicon: (id, dataUrl) =>
    set((state) => {
      if (state.faviconById[id] === dataUrl) return state;
      return { faviconById: { ...state.faviconById, [id]: dataUrl } };
    }),
}));
