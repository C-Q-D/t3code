/** Assembles the lazy Chinese dictionary with the English dictionary's structure. */
import type { Messages } from "../en";
import { common } from "./common";
import { settings } from "./settings";
import { sidebar } from "./sidebar";
import { composer } from "./composer";
import { chat } from "./chat";
import { git } from "./git";
import { tools } from "./tools";
import { app } from "./app";
import { account } from "./account";
import { discussions } from "./discussions";

export const messages: Messages = {
  common,
  settings,
  sidebar,
  composer,
  chat,
  git,
  tools,
  app,
  account,
  discussions,
};
