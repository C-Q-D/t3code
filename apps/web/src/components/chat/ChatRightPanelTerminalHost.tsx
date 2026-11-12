import {
  parseScopedThreadKey,
  scopedThreadKey,
  scopeThreadRef,
} from "@t3tools/client-runtime/environment";
import {
  AuthTerminalOperateScope,
  AuthTerminalReadScope,
  type ScopedThreadRef,
} from "@t3tools/contracts";
import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { createPortal } from "react-dom";
import { useComposerDraftStore } from "../../composerDraftStore";
import { useRightPanelStore, type RightPanelSurface } from "../../rightPanelStore";
import { useQuietThreadShell, useThreadRefs } from "../../state/entities";
import { useEnvironmentScope } from "../../state/session";
import { useStableCallback } from "../../hooks/useStableCallback";
import {
  PersistentThreadTerminalPanel,
  type PersistentThreadTerminalPanelProps,
} from "../PersistentThreadTerminals";

type TerminalProps = Omit<PersistentThreadTerminalPanelProps, "visible" | "threadRef" | "surface">;
type Slot = { threadKey: string; surfaceId: string; element: HTMLDivElement };
const TerminalSlotContext = createContext<((slot: Slot | Omit<Slot, "element">) => void) | null>(
  null,
);
type HostConfiguration = {
  present: boolean;
  activeThreadRef: ScopedThreadRef | null;
  terminal: TerminalProps;
};
const TerminalHostContext = createContext<Dispatch<
  SetStateAction<HostConfiguration | null>
> | null>(null);

export function RightPanelTerminalSlot({
  threadRef,
  surfaceId,
}: {
  threadRef: ScopedThreadRef;
  surfaceId: string;
}) {
  const setSlot = useContext(TerminalSlotContext);
  const threadKey = scopedThreadKey(threadRef);
  const ref = (element: HTMLDivElement | null) => {
    setSlot?.({ threadKey, surfaceId, ...(element ? { element } : {}) });
  };
  return <div className="flex min-h-0 flex-1 flex-col" ref={ref} />;
}

function RetainedTerminal({
  target,
  ...props
}: PersistentThreadTerminalPanelProps & { target: HTMLDivElement | null }) {
  const [container] = useState(() => {
    const element = document.createElement("div");
    element.className = "flex h-full min-h-0 flex-1 flex-col";
    return element;
  });
  const parking = useRef<HTMLDivElement>(null);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- moves the same portal container between the visible panel slot and hidden parking without replacing its terminal effects
  useLayoutEffect(() => {
    (target ?? parking.current)?.appendChild(container);
    return () => container.remove();
  }, [container, target]);
  return (
    <>
      <div hidden ref={parking} />
      {createPortal(<PersistentThreadTerminalPanel {...props} />, container)}
    </>
  );
}

function ThreadTerminals({
  threadRef,
  surfaces,
  slot,
  present,
  activeThreadKey,
  terminal,
}: {
  threadRef: ScopedThreadRef;
  surfaces: ReadonlyArray<RightPanelSurface>;
  slot: Slot | null;
  present: boolean;
  activeThreadKey: string | null;
  terminal: TerminalProps;
}) {
  const canRead = useEnvironmentScope(threadRef.environmentId, AuthTerminalReadScope);
  const canOperate = useEnvironmentScope(threadRef.environmentId, AuthTerminalOperateScope);
  const thread = useQuietThreadShell(threadRef);
  const canRetain = canRead && canOperate && thread?.deletedAt == null;
  const threadKey = scopedThreadKey(threadRef);
  const [mountedIds, setMountedIds] = useState<string[]>([]);
  const retainedIds = canRetain
    ? mountedIds.filter((id) =>
        surfaces.some((surface) => surface.kind === "terminal" && surface.id === id),
      )
    : [];
  if (
    canRetain &&
    present &&
    activeThreadKey === threadKey &&
    slot?.threadKey === threadKey &&
    surfaces.some((surface) => surface.kind === "terminal" && surface.id === slot.surfaceId) &&
    !retainedIds.includes(slot.surfaceId)
  ) {
    retainedIds.push(slot.surfaceId);
  }
  if (
    retainedIds.length !== mountedIds.length ||
    retainedIds.some((id, index) => id !== mountedIds[index])
  )
    setMountedIds(retainedIds);
  return surfaces.map((surface) => {
    if (surface.kind !== "terminal" || !retainedIds.includes(surface.id)) return null;
    const target =
      present &&
      activeThreadKey === threadKey &&
      slot?.threadKey === threadKey &&
      slot.surfaceId === surface.id
        ? slot.element
        : null;
    return (
      <RetainedTerminal
        key={surface.id}
        {...terminal}
        launchContext={activeThreadKey === threadKey ? terminal.launchContext : null}
        threadRef={threadRef}
        surface={surface}
        visible={target !== null}
        target={target}
      />
    );
  });
}

export function ChatRightPanelTerminalHost({
  present,
  enabled,
  activeThreadRef,
  terminal,
  children,
}: {
  present: boolean;
  enabled: boolean;
  activeThreadRef: ScopedThreadRef | null;
  terminal: TerminalProps;
  children: ReactNode;
}) {
  const configureHost = useContext(TerminalHostContext);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- hands the active panel slot and actions to the terminal resource owner above keyed ChatViews
  useLayoutEffect(() => {
    if (!enabled || !configureHost) return;
    const configuration = { present, activeThreadRef, terminal };
    configureHost(configuration);
    return () =>
      configureHost((current) =>
        current === configuration ? { ...current, present: false, activeThreadRef: null } : current,
      );
  }, [configureHost, enabled, present, activeThreadRef, terminal]);
  return enabled && present ? children : null;
}

export function ChatRightPanelTerminalProvider({ children }: { children: ReactNode }) {
  const [configuration, configureHost] = useState<HostConfiguration | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const registerSlot = useStableCallback((next: Slot | Omit<Slot, "element">) => {
    setSlot((current) =>
      "element" in next
        ? next
        : current?.threadKey === next.threadKey && current.surfaceId === next.surfaceId
          ? null
          : current,
    );
  });
  const panels = useRightPanelStore((state) => state.byThreadKey);
  const serverRefs = useThreadRefs();
  const drafts = useComposerDraftStore((state) => state.draftThreadsByThreadKey);
  const existing = new Set([
    ...serverRefs.map(scopedThreadKey),
    ...Object.values(drafts).map((draft) =>
      scopedThreadKey(scopeThreadRef(draft.environmentId, draft.threadId)),
    ),
  ]);
  return (
    <TerminalHostContext.Provider value={configureHost}>
      <TerminalSlotContext.Provider value={registerSlot}>
        {children}
        {configuration
          ? Object.entries(panels).map(([key, panel]) => {
              const threadRef = existing.has(key) ? parseScopedThreadKey(key) : null;
              if (!threadRef || !panel.surfaces.some((surface) => surface.kind === "terminal"))
                return null;
              return (
                <ThreadTerminals
                  key={key}
                  threadRef={threadRef}
                  surfaces={panel.surfaces}
                  slot={slot}
                  present={configuration.present && panel.isOpen}
                  activeThreadKey={
                    configuration.activeThreadRef
                      ? scopedThreadKey(configuration.activeThreadRef)
                      : null
                  }
                  terminal={configuration.terminal}
                />
              );
            })
          : null}
      </TerminalSlotContext.Provider>
    </TerminalHostContext.Provider>
  );
}
