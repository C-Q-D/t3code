/** Localized desktop presentation and existing interaction behavior. */
import { t } from "~/i18n";
import type { DesktopBridge, DesktopWslState } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { Atom } from "effect/reactivity";

import { appAtomRegistry } from "~/rpc/atomRegistry";

const DESKTOP_WSL_STATE_STALE_TIME_MS = 30_000;

type DesktopWslStateBridge = Pick<DesktopBridge, "getWslState">;

class DesktopWslStateUnavailableError extends Schema.TaggedError<DesktopWslStateUnavailableError>()(
  "DesktopWslStateUnavailableError",
  {},
) {
  /** Returns the localized display message for this error while preserving its structured diagnostic fields. */
  override get message(): string {
    return t.account.desktop.wslUnavailable;
  }
}

class DesktopWslStateLoadError extends Schema.TaggedError<DesktopWslStateLoadError>()(
  "DesktopWslStateLoadError",
  { cause: Schema.Defect() },
) {
  /** Returns the localized display message for this error while preserving its structured diagnostic fields. */
  override get message(): string {
    return t.account.desktop.wslFailed;
  }
}

function getDesktopWslStateBridge(): DesktopWslStateBridge | undefined {
  return typeof window === "undefined" ? undefined : window.desktopBridge;
}

export function createDesktopWslStateAtom(getBridge: () => DesktopWslStateBridge | undefined) {
  const loadDesktopWslState = Effect.fn("loadDesktopWslState")(function* () {
    const bridge = getBridge();
    if (!bridge) {
      return yield* new DesktopWslStateUnavailableError();
    }
    return yield* Effect.tryPromise({
      try: (): Promise<DesktopWslState> => bridge.getWslState(),
      catch: (cause) => new DesktopWslStateLoadError({ cause }),
    });
  });

  return Atom.make(loadDesktopWslState()).pipe(
    Atom.swr({
      staleTime: DESKTOP_WSL_STATE_STALE_TIME_MS,
      revalidateOnMount: true,
    }),
    Atom.keepAlive,
    Atom.withLabel("desktop:wsl-state:load"),
  );
}

export const desktopWslStateAtom = createDesktopWslStateAtom(getDesktopWslStateBridge);

export function refreshDesktopWslState(): void {
  appAtomRegistry.refresh(desktopWslStateAtom);
}
