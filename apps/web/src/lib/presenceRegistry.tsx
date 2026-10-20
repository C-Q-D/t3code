/** Tracks mounted slots locally so wrappers can style their presence without DOM queries. */
import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * Creates an independent slot namespace. Create it outside components and keep
 * usePresence in the small wrapper that renders Provider. Unseen kinds have no
 * entry; read them with `counts[kind] ?? 0`.
 */
export function createPresenceRegistry<Kind extends string>() {
  const Context = createContext<((kind: Kind) => () => void) | null>(null);

  /** Keeps wrapper counts in local state and supplies the stable Provider callback. */
  function usePresence() {
    const [counts, onChange] = useState<Record<Kind, number>>({} as Record<Kind, number>);
    return { counts, onChange };
  }

  /**
   * Scopes registration to children and reports immutable snapshots to onChange.
   * The callback returned by usePresence avoids re-registering on wrapper renders.
   */
  function Provider({
    children,
    onChange,
  }: {
    children: ReactNode;
    onChange: (counts: Record<Kind, number>) => void;
  }) {
    const counts = useRef({} as Record<Kind, number>);
    const register = useCallback(
      (kind: Kind) => {
        counts.current = { ...counts.current, [kind]: (counts.current[kind] ?? 0) + 1 };
        onChange(counts.current);
        return () => {
          counts.current = { ...counts.current, [kind]: counts.current[kind] - 1 };
          onChange(counts.current);
        };
      },
      [onChange],
    );
    return <Context.Provider value={register}>{children}</Context.Provider>;
  }

  /**
   * Registers kind while present (default true); cleanup removes that registration.
   * Layout timing updates wrapper styling before paint. Outside Provider this is a no-op.
   */
  function useRegister(kind: Kind, present = true): void {
    const register = useContext(Context);
    useLayoutEffect(() => {
      if (present) return register?.(kind);
    }, [kind, present, register]);
  }

  return { Provider, useRegister, usePresence };
}
