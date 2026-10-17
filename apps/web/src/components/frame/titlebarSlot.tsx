/** Routes publish titlebar content without moving it out of their React context. */
import {
  createContext,
  useCallback,
  useContext,
  useId,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

/** Content owned by one mounted route or nested route. */
export type TitlebarSlotContent = { breadcrumb?: ReactNode; actions?: ReactNode };

type SlotName = keyof TitlebarSlotContent;

/** Shell-local destinations and mount-ordered ownership; content stays in the route tree. */
type TitlebarContextValue = {
  targets: Record<SlotName, HTMLDivElement | null>;
  owners: Record<SlotName, string[]>;
  setTarget: (name: SlotName, target: HTMLDivElement | null) => void;
  register: (name: SlotName, owner: string) => () => void;
};

const TitlebarContext = createContext<TitlebarContextValue | null>(null);

/** Fails at the caller when a route or outlet is outside its app-shell provider. */
function useTitlebarContext() {
  const context = useContext(TitlebarContext);
  if (!context) throw new Error("Titlebar slots require a TitlebarSlotProvider.");
  return context;
}

/** Scopes the titlebar destinations and their route owners to one app shell. */
export function TitlebarSlotProvider({ children }: { children: ReactNode }) {
  const [targets, setTargets] = useState<TitlebarContextValue["targets"]>({
    breadcrumb: null,
    actions: null,
  });
  const [owners, setOwners] = useState<TitlebarContextValue["owners"]>({
    breadcrumb: [],
    actions: [],
  });
  const setTarget = useCallback((name: SlotName, target: HTMLDivElement | null) => {
    setTargets((current) => (current[name] === target ? current : { ...current, [name]: target }));
  }, []);
  const register = useCallback((name: SlotName, owner: string) => {
    setOwners((current) => ({ ...current, [name]: [...current[name], owner] }));
    return () =>
      setOwners((current) => ({ ...current, [name]: current[name].filter((id) => id !== owner) }));
  }, []);

  const value = useMemo(
    () => ({ targets, owners, setTarget, register }),
    [targets, owners, setTarget, register],
  );
  return <TitlebarContext value={value}>{children}</TitlebarContext>;
}

/** Renders one no-drag destination; the shell mounts exactly one outlet per name. */
export function TitlebarSlotOutlet({ name }: { name: keyof TitlebarSlotContent }) {
  const { setTarget } = useTitlebarContext();
  const ref = useCallback(
    (element: HTMLDivElement | null) => setTarget(name, element),
    [name, setTarget],
  );
  return <div ref={ref} className="window-titlebar-slot no-drag" data-titlebar-slot={name} />;
}

/**
 * Returns portals for the supplied breadcrumb/actions; include the result in route JSX.
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

  useLayoutEffect(
    () => (hasBreadcrumb ? register("breadcrumb", owner) : undefined),
    [hasBreadcrumb, owner, register],
  );
  useLayoutEffect(
    () => (hasActions ? register("actions", owner) : undefined),
    [hasActions, owner, register],
  );

  return (
    <>
      {targets.breadcrumb && owners.breadcrumb.at(-1) === owner
        ? createPortal(content.breadcrumb, targets.breadcrumb, `${owner}-breadcrumb`)
        : null}
      {targets.actions && owners.actions.at(-1) === owner
        ? createPortal(content.actions, targets.actions, `${owner}-actions`)
        : null}
    </>
  );
}
