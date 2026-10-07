/** Defines the English dictionary and the shared shape for all UI translations. */
import { common } from "./common";
import { settings } from "./settings";
import { sidebar } from "./sidebar";
import { composer } from "./composer";
import { chat } from "./chat";

export const en = { common, settings, sidebar, composer, chat };
/** Dictionary structure with wide strings and typed interpolation functions. */
export type Messages = typeof en;
