/** Environment-scoped composer commands; destination grants are checked before RPC dispatch. */
import { WS_METHODS } from "@t3tools/contracts";
import type { Atom } from "effect/reactivity";

import type { EnvironmentRegistry } from "../connection/registry.ts";
import { createEnvironmentRpcCommand } from "./runtime.ts";

/**
 * Creates suggestion and optimization commands using the shared connection runtime.
 * Each command targets the supplied environment and exposes its operate permission atom.
 * Transport failures follow the command runtime; no retries or local timeout are added here.
 * The server owns the side-query deadline; responses are unary and need no pagination.
 */
export function createComposerAssistEnvironmentAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | R, E>,
) {
  return {
    suggestNext: createEnvironmentRpcCommand(runtime, {
      label: "environment-command:composer:suggest-next",
      tag: WS_METHODS.composerSuggestNext,
    }),
    optimizePrompt: createEnvironmentRpcCommand(runtime, {
      label: "environment-command:composer:optimize-prompt",
      tag: WS_METHODS.composerOptimizePrompt,
    }),
  };
}
