/** Subscribes to scoped preview sessions and events; retains original thread identities. */
"use client";

import { t } from "~/i18n";

import { useAtomValue } from "@effect/atom-react";
import { parseScopedThreadKey, scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { ScopedThreadRef } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { AsyncResult, Atom } from "effect/reactivity";

import {
  applyPreviewServerEvent,
  readThreadPreviewState,
  reconcilePreviewServerSessions,
} from "~/previewStateStore";
import { previewEnvironment } from "~/state/preview";

/** Invalid scoped preview subscription key; threadKey retains the original rejected value. */
class PreviewSessionThreadKeyParseError extends Schema.TaggedError<PreviewSessionThreadKeyParseError>()(
  "PreviewSessionThreadKeyParseError",
  { threadKey: Schema.String },
) {
  /** Returns the localized failure message for the original identifier; never returns empty text. */
  override get message(): string {
    return t.tools.preview.invalidSessionThreadKey(this.threadKey);
  }
}

const previewSessionSyncAtom = Atom.family((threadKey: string) => {
  const threadRef = parseScopedThreadKey(threadKey);
  if (threadRef === null) {
    throw new PreviewSessionThreadKeyParseError({ threadKey });
  }

  const sessionsAtom = previewEnvironment.list({
    environmentId: threadRef.environmentId,
    input: { threadId: threadRef.threadId },
  });
  const eventsAtom = previewEnvironment.events({
    environmentId: threadRef.environmentId,
    input: {},
  });

  return Atom.make((get) => {
    let disposed = false;
    let eventsVersion = 0;

    const reconcileSessions = (result: Atom.Type<typeof sessionsAtom>) => {
      if (!AsyncResult.isSuccess(result)) return;
      reconcilePreviewServerSessions(threadRef, result.value);
      if (!result.waiting && !readThreadPreviewState(threadRef).listLoaded) {
        // An event overtook the first list. Retry the authoritative baseline;
        // do not declare a partial event-only index ready for surface cleanup.
        queueMicrotask(() => {
          if (!disposed) get.refresh(sessionsAtom);
        });
      }
    };

    const applyLatestEvent = (result: Atom.Type<typeof eventsAtom>) => {
      if (!AsyncResult.isSuccess(result) || result.value.threadId !== threadRef.threadId) return;
      const currentEpoch = readThreadPreviewState(threadRef).serverEpoch;
      if (currentEpoch !== null && currentEpoch !== result.value.serverEpoch) {
        get.refresh(sessionsAtom);
        return;
      }
      applyPreviewServerEvent(threadRef, result.value);
    };

    get.addFinalizer(() => {
      disposed = true;
    });
    const initialEvent = get.once(eventsAtom);
    get.subscribe(sessionsAtom, (result) => {
      reconcileSessions(result);
    });
    get.subscribe(eventsAtom, (result) => {
      eventsVersion += 1;
      applyLatestEvent(result);
    });
    get.mount(sessionsAtom);
    get.mount(eventsAtom);
    queueMicrotask(() => {
      if (disposed) return;
      // The cached list can predate an automation-created tab. Keep the local
      // snapshot visible until an authoritative refresh arrives instead of
      // reconciling against a stale empty result when the panel first mounts.
      get.refresh(sessionsAtom);
      if (eventsVersion === 0) applyLatestEvent(initialEvent);
    });
  }).pipe(Atom.setIdleTTL(1_000), Atom.withLabel(`preview:session-sync:${threadKey}`));
});

export function usePreviewSession(threadRef: ScopedThreadRef): void {
  useAtomValue(previewSessionSyncAtom(scopedThreadKey(threadRef)));
}
