/** Localized connection presentation and existing interaction behavior. */
import { t } from "~/i18n";
import { useAtomValue } from "@effect/atom-react";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { AsyncResult, Atom } from "effect/reactivity";
import { useCallback } from "react";

import { isLocalEnvironmentDisabled } from "../../localEnvironment";
import { appAtomRegistry } from "../../rpc/atomRegistry";
import { fetchSessionState } from "./auth";

const primarySessionStateAtom = Atom.make(
  Effect.suspend(() =>
    isLocalEnvironmentDisabled() ? Effect.succeed(null) : Effect.promise(fetchSessionState),
  ),
).pipe(
  Atom.swr({ staleTime: 5_000, revalidateOnMount: true }),
  Atom.setIdleTTL(5 * 60_000),
  Atom.withLabel("primary-environment:session"),
);

function refreshPrimarySessionState(): void {
  appAtomRegistry.refresh(primarySessionStateAtom);
}

/** Returns the primary environment session, loading/error state and refresh action; no primary target yields an empty session. */
export function usePrimarySessionState() {
  const result = useAtomValue(primarySessionStateAtom);
  const refresh = useCallback(() => {
    refreshPrimarySessionState();
  }, []);
  let error: string | null = null;
  if (result._tag === "Failure") {
    const cause = Cause.squash(result.cause);
    error = cause instanceof Error ? cause.message : t.account.connection.readSessionFailed;
  }
  return {
    data: Option.getOrNull(AsyncResult.value(result)),
    error,
    isPending: result.waiting,
    refresh,
  };
}
