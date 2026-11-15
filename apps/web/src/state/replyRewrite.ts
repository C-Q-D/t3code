/** Binds shared rewrite state to the desktop's existing environment runtime. */
import { createReplyRewriteEnvironmentAtoms } from "@t3tools/client-runtime/state/reply-rewrite";
import { connectionAtomRuntime } from "../connection/runtime";

export const replyRewriteEnvironment = createReplyRewriteEnvironmentAtoms(connectionAtomRuntime);
