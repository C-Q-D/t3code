import { t } from "~/i18n";
import type { ClientSettings } from "@t3tools/contracts";

// Ids are stored in client settings, so never rename one.
export const THREAD_DETAILS_ITEMS = [
  {
    id: "environment",
    get label() {
      return t.chat.detailItems.environment;
    },
    defaultVisible: true,
  },
  {
    id: "openIn",
    get label() {
      return t.chat.detailItems.openIn;
    },
    defaultVisible: true,
  },
  {
    id: "scripts",
    get label() {
      return t.chat.detailItems.scripts;
    },
    defaultVisible: true,
  },
  {
    id: "branch",
    get label() {
      return t.chat.detailItems.branch;
    },
    defaultVisible: true,
  },
  {
    id: "gitActions",
    get label() {
      return t.chat.detailItems.gitActions;
    },
    defaultVisible: true,
  },
  {
    id: "changes",
    get label() {
      return t.chat.detailItems.changes;
    },
    defaultVisible: true,
  },
  {
    id: "servers",
    get label() {
      return t.chat.detailItems.servers;
    },
    defaultVisible: true,
  },
  {
    id: "automations",
    get label() {
      return t.chat.detailItems.automations;
    },
    defaultVisible: true,
  },
  {
    id: "lineage",
    get label() {
      return t.chat.detailItems.lineage;
    },
    defaultVisible: true,
  },
  {
    id: "sideChats",
    get label() {
      return t.chat.detailItems.sideChats;
    },
    defaultVisible: true,
  },
  {
    id: "usage",
    get label() {
      return t.chat.detailItems.usage;
    },
    defaultVisible: false,
  },
  {
    id: "context",
    get label() {
      return t.chat.detailItems.context;
    },
    defaultVisible: false,
  },
] as const;

export type ThreadDetailsItemId = (typeof THREAD_DETAILS_ITEMS)[number]["id"];
export type ThreadDetailsVisibility = Readonly<Record<ThreadDetailsItemId, boolean>>;

type ThreadDetailsItem = (typeof THREAD_DETAILS_ITEMS)[number];
type ThreadDetailsItemSettings = Pick<
  ClientSettings,
  "threadDetailsItems" | "threadDetailsUsageEnabled"
>;

// People who turned on the retired Labs toggle keep Usage and Context until they change them here.
function defaultVisible(item: ThreadDetailsItem, settings: ThreadDetailsItemSettings) {
  return item.id === "usage" || item.id === "context"
    ? settings.threadDetailsUsageEnabled
    : item.defaultVisible;
}

export function resolveThreadDetailsVisibility(
  settings: ThreadDetailsItemSettings,
): ThreadDetailsVisibility {
  return Object.fromEntries(
    THREAD_DETAILS_ITEMS.map((item) => [
      item.id,
      settings.threadDetailsItems[item.id] ?? defaultVisible(item, settings),
    ]),
  ) as Record<ThreadDetailsItemId, boolean>;
}

/** Stores only choices that differ from the default, so a later default change reaches everyone else. */
export function setThreadDetailsItem(
  settings: ThreadDetailsItemSettings,
  item: ThreadDetailsItem,
  visible: boolean,
): ClientSettings["threadDetailsItems"] {
  const { [item.id]: _previous, ...rest } = settings.threadDetailsItems;
  return visible === defaultVisible(item, settings) ? rest : { ...rest, [item.id]: visible };
}

export function isDefaultThreadDetailsVisibility(visibility: ThreadDetailsVisibility) {
  return THREAD_DETAILS_ITEMS.every((item) => visibility[item.id] === item.defaultVisible);
}

/** Also clears the retired Labs flag, so Usage and Context return to off. */
export const RESET_THREAD_DETAILS_ITEMS = {
  threadDetailsItems: {},
  threadDetailsUsageEnabled: false,
} satisfies Partial<ClientSettings>;
