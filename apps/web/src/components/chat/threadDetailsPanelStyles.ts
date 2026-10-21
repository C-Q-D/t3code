/** F1 visual primitives used only by thread-details controls, independent of toolbar density. */
const ROW_SURFACE = "bg-transparent enabled:hover:bg-secondary data-pressed:bg-secondary";
const RAISED_SURFACE =
  "bg-secondary shadow-raise-xs-control enabled:hover:bg-accent enabled:active:shadow-raise-xs-pressed";

export const THREAD_DETAILS_PANEL_ROW_CONTENT_CLASS = "gap-2 px-3.5 text-left";
export const THREAD_DETAILS_PANEL_LABEL_CLASS = "min-w-0 overflow-x-clip overflow-y-visible";
const CONTROL = `h-9.5 min-w-0 rounded-full border-0 ${THREAD_DETAILS_PANEL_ROW_CONTENT_CLASS} text-secondary-copy-large font-semibold text-foreground`;
export const THREAD_DETAILS_PANEL_ROW_CLASS = `${CONTROL} w-full justify-start ${ROW_SURFACE}`;
/** A child agent's two-line lineage row: flat until hovered, sized for a 26px avatar tile. */
export const THREAD_DETAILS_PANEL_AGENT_ROW_CLASS = `min-h-11 w-full min-w-0 justify-start gap-2.5 rounded-lg border-0 py-1 ps-2 pe-3 text-left whitespace-normal text-foreground ${ROW_SURFACE}`;
export const THREAD_DETAILS_PANEL_SELECT_ROW_CLASS = `${CONTROL} w-full justify-start bg-thread-details-well shadow-well-control pe-2 [&_[data-slot=select-icon]]:ms-auto [&_[data-slot=select-icon]]:flex [&_[data-slot=select-icon]]:shrink-0`;
export const THREAD_DETAILS_PANEL_LOCKED_ROW_CLASS = `${CONTROL} flex w-full items-center justify-start bg-thread-details-well shadow-well-control`;
export const THREAD_DETAILS_PANEL_ICON_CLASS = "size-3.5 shrink-0";
export const THREAD_DETAILS_PANEL_CHEVRON_CLASS = "size-3.5 shrink-0";
export const THREAD_DETAILS_PANEL_ICON_ACTION_CLASS = `size-7 justify-center rounded-full border-0 bg-transparent p-0 ${ROW_SURFACE}`;
/** PR actions use F1's 30px pills; compact checks retain their own semantic content. */
export const THREAD_DETAILS_PANEL_META_ACTION_CLASS = `h-7.5 gap-1 rounded-full border-0 px-3 text-secondary-copy-medium font-semibold text-foreground ${RAISED_SURFACE}`;
export const THREAD_DETAILS_PANEL_SPLIT_GROUP_CLASS = "flex w-full items-center gap-0.75";
export const THREAD_DETAILS_PANEL_SPLIT_PRIMARY_CLASS = `${CONTROL} flex-1 justify-start rounded-e-md ${RAISED_SURFACE}`;
export const THREAD_DETAILS_PANEL_SPLIT_SECONDARY_CLASS = `${CONTROL} w-9.5 justify-center rounded-s-md px-0 ${RAISED_SURFACE}`;
export const THREAD_DETAILS_PANEL_SPLIT_SEPARATOR_CLASS = "hidden";
export const THREAD_DETAILS_PANEL_ACTION_CLASS = `${CONTROL} justify-center ${RAISED_SURFACE}`;

export const THREAD_DETAILS_PANEL_SELECT_LABEL_CLASS = "flex h-full min-w-0 flex-1 items-center";
export const THREAD_DETAILS_PANEL_SELECT_ICON_CLASS = "rounded-e-full";
