/** Defines the English dictionary and the shared shape for all UI translations. */
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

export const en = {
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
/** Dictionary structure with wide strings and typed interpolation functions. */
export type Messages = typeof en;
