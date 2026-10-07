/** Assembles the lazy Chinese dictionary with the English dictionary's structure. */
import type { Messages } from "../en";
import { common } from "./common";
import { settings } from "./settings";
import { sidebar } from "./sidebar";
import { composer } from "./composer";
import { chat } from "./chat";

export const messages: Messages = { common, settings, sidebar, composer, chat };
