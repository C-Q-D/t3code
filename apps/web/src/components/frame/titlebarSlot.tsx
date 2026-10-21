/** Routes publish titlebar content without moving it out of their React context. */
import { useStableCallback } from "~/hooks/useStableCallback";
import { createContext, useContext, useId, useLayoutEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Route-owned content; optional panel mounts beside the main slab only where the frame exposes it. */
export type TitlebarSlotContent = {
  breadcrumb?: ReactNode;
  actions?: ReactNode;
  panel?: ReactNode;
};

type SlotName = keyof TitlebarSlotContent;

/** Shell-local destinations and mount-ordered ownership; content stays in the route tree. */
type TitlebarContextValue = {
  targets: Record<SlotName, HTMLDivElement | null>;
  owners: Record<SlotName, string[]>;
  setTarget: (name: SlotName, target: HTMLDivElement | null) => void;
  register: (name: SlotName, owner: string) => () => void;
  compactPanel: boolean;
  setCompactPanel: (compact: boolean) => void;
};

const TitlebarContext = createContext<TitlebarContextValue | null>(null);

/** Fails at the caller when a route or outlet is outside its app-shell provider. */
function useTitlebarContext() {
  const context = useContext(TitlebarContext);
  if (!context) throw new Error("Titlebar slots require a TitlebarSlotProvider.");
  return context;
}

/** Shares only the panel's discrete layout so portaled actions can replace their focusable controls. */
export function useTitlebarPanelLayout() {
  const { targets, owners, compactPanel, setCompactPanel } = useTitlebarContext();
  const active = targets.panel !== null && owners.panel.length > 0;
  return { active, compact: active && compactPanel, setCompact: setCompactPanel };
}

/** Scopes the titlebar destinations and their route owners to one app shell. */
export function TitlebarSlotProvider({ children }: { children: ReactNode }) {
  const [compactPanel, setCompactPanel] = useState(true);
  const [targets, setTargets] = useState<TitlebarContextValue["targets"]>({
    breadcrumb: null,
    actions: null,
    panel: null,
  });
  const [owners, setOwners] = useState<TitlebarContextValue["owners"]>({
    breadcrumb: [],
    actions: [],
    panel: [],
  });
  const setTarget = useStableCallback((name: SlotName, target: HTMLDivElement | null) => {
    setTargets((current) => (current[name] === target ? current : { ...current, [name]: target }));
  });
  const register = useStableCallback((name: SlotName, owner: string) => {
    setOwners((current) => ({ ...current, [name]: [...current[name], owner] }));
    return () =>
      setOwners((current) => ({ ...current, [name]: current[name].filter((id) => id !== owner) }));
  });

  const value = { targets, owners, setTarget, register, compactPanel, setCompactPanel };
  return <TitlebarContext value={value}>{children}</TitlebarContext>;
}

/** Renders one no-drag destination; the shell mounts exactly one outlet per name. */
export function TitlebarSlotOutlet({ name }: { name: keyof TitlebarSlotContent }) {
  const { setTarget } = useTitlebarContext();
  const ref = (element: HTMLDivElement | null) => setTarget(name, element);
  return <div ref={ref} className="window-titlebar-slot no-drag" data-titlebar-slot={name} />;
}

/**
 * Returns portals for breadcrumb/actions and an optional frame-owned panel; include them in route JSX.
 * Null, undefined and false release a slot. The last registered owner wins independently
 * per slot; cleanup restores the previous mounted owner. Content updates keep priority.
 * Registration follows layout-effect order (child before parent on a shared commit).
 * Portals preserve route context and event handling; only the winning content is mounted.
 * Must be called below TitlebarSlotProvider; throws when the provider is missing.
 */
export function useTitlebarSlot(content: TitlebarSlotContent): ReactNode {
  const { targets, owners, register } = useTitlebarContext();
  const owner = useId();
  const hasBreadcrumb = content.breadcrumb != null && content.breadcrumb !== false;
  const hasActions = content.actions != null && content.actions !== false;
  const hasPanel = content.panel != null && content.panel !== false;

  useLayoutEffect(
    () => (hasBreadcrumb ? register("breadcrumb", owner) : undefined),
    [hasBreadcrumb, owner, register],
  );
  useLayoutEffect(
    () => (hasActions ? register("actions", owner) : undefined),
    [hasActions, owner, register],
  );
  useLayoutEffect(
    () => (hasPanel ? register("panel", owner) : undefined),
    [hasPanel, owner, register],
  );

  return (
    <>
      {targets.breadcrumb && owners.breadcrumb.at(-1) === owner
        ? createPortal(content.breadcrumb, targets.breadcrumb, `${owner}-breadcrumb`)
        : null}
      {targets.actions && owners.actions.at(-1) === owner
        ? createPortal(content.actions, targets.actions, `${owner}-actions`)
        : null}
      {targets.panel && owners.panel.at(-1) === owner
        ? createPortal(content.panel, targets.panel, `${owner}-panel`)
        : null}
    </>
  );
}
