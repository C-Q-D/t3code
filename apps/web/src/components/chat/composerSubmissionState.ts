/** Shares form submission state with queued controls supplied by the chat view as React nodes. */
import { createContext } from "react";
import type { ComposerSubmissionState } from "./composerSubmissionState.logic";

/** Without a composer scope, queued save has no draft state and stays disabled. */
export const ComposerSubmissionStateContext = createContext<ComposerSubmissionState | null>(null);
