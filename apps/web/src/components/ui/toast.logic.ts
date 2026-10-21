/** Pure presentation decisions for toast visibility, stacking, actions, and determinate progress. */
import type { ScopedThreadRef, ThreadId } from "@t3tools/contracts";

/**
 * Derives S1 geometry, visibility, and badge membership from a zero-based visible index
 * and Base UI state. Collapsed stacks show three stone layers; expanded stacks honor
 * the provider limit. Pending cards, including limited ones, remain in the collapsed
 * badge count until they close, preserving the existing count semantics.
 */
export function getStoneToastLayer(
  visibleIndex: number,
  {
    expanded = false,
    limited = false,
    transitionStatus,
  }: {
    expanded?: boolean;
    limited?: boolean | undefined;
    transitionStatus?: "starting" | "ending" | "idle" | undefined;
  } = {},
) {
  return {
    inset: visibleIndex * 12,
    offset: visibleIndex === 0 ? 0 : visibleIndex * -10,
    hidden: limited || (!expanded && visibleIndex >= 3),
    countsAsRemaining: !expanded && visibleIndex > 0 && transitionStatus !== "ending",
  };
}

/** Counts pending back cards using the same S1 state decision as visibility and inert; expanded stacks have no badge. */
export function countStoneToastRemaining(
  items: readonly {
    visibleIndex: number;
    toast: { limited?: boolean | undefined; transitionStatus?: "starting" | "ending" | undefined };
  }[],
  expanded: boolean,
) {
  return items.filter(
    ({ visibleIndex, toast }) =>
      getStoneToastLayer(visibleIndex, { ...toast, expanded }).countsAsRemaining,
  ).length;
}

/**
 * Returns a whole percentage in [0, 100] for loading toasts only.
 * Missing or non-finite progressPercent means unknown progress and returns null,
 * so callers render neither a percentage nor a determinate progress bar.
 */
export function resolveToastProgressPercent(
  toastType: unknown,
  progressPercent: number | null | undefined,
): number | null {
  if (toastType !== "loading" || progressPercent == null || !Number.isFinite(progressPercent)) {
    return null;
  }
  return Math.round(Math.min(100, Math.max(0, progressPercent)));
}

/**
 * Base UI toast updates omit `undefined` fields, so callers that need to remove
 * an action must pass a defined `actionProps` whose `children` are empty.
 * Treat that payload (and missing children) as "no visible action".
 */
export function hasVisibleToastAction(actionProps: unknown): boolean {
  if (actionProps == null || typeof actionProps !== "object") {
    return false;
  }
  if (!("children" in actionProps)) {
    return false;
  }
  const children = actionProps.children;
  return children != null && children !== false && children !== "";
}

export function shouldHideCollapsedToastContent(
  visibleToastIndex: number,
  visibleToastCount: number,
): boolean {
  if (visibleToastCount <= 1) return false;
  return visibleToastIndex > 0;
}

type ToastWithHeight = {
  height?: number | null | undefined;
};

type ToastWithTransitionStatus = {
  transitionStatus?: "starting" | "ending" | undefined;
};

type ToastWithLayoutProps = ToastWithHeight & ToastWithTransitionStatus;

type VisibleToastLayoutItem<TToast extends object> = {
  toast: TToast;
  visibleIndex: number;
  offsetY: number;
};

export function buildVisibleToastLayout<TToast extends object>(
  visibleToasts: readonly (TToast & ToastWithLayoutProps)[],
): {
  frontmostHeight: number;
  items: VisibleToastLayoutItem<TToast & ToastWithLayoutProps>[];
} {
  let fullIndex = 0;
  let fullOffsetY = 0;
  let liveIndex = 0;
  let liveOffsetY = 0;

  const items: VisibleToastLayoutItem<TToast & ToastWithLayoutProps>[] = visibleToasts.map(
    (toast) => {
      const height = normalizeToastHeight(toast.height);

      if (toast.transitionStatus === "ending") {
        const item = {
          toast,
          visibleIndex: fullIndex,
          offsetY: fullOffsetY,
        };
        fullOffsetY += height;
        fullIndex += 1;
        return item;
      }

      const item = {
        toast,
        visibleIndex: liveIndex,
        offsetY: liveOffsetY,
      };

      fullOffsetY += height;
      fullIndex += 1;
      liveOffsetY += height;
      liveIndex += 1;
      return item;
    },
  );

  const frontmostLiveToast = visibleToasts.find((toast) => toast.transitionStatus !== "ending");

  return {
    frontmostHeight: normalizeToastHeight(frontmostLiveToast?.height),
    items,
  };
}

function normalizeToastHeight(height: number | null | undefined): number {
  return typeof height === "number" && Number.isFinite(height) && height > 0 ? height : 0;
}

export function shouldRenderThreadScopedToast(
  data:
    | {
        threadRef?: ScopedThreadRef | null;
        threadId?: ThreadId | null;
      }
    | undefined,
  activeThreadRef: ScopedThreadRef | null,
): boolean {
  if (data?.threadRef) {
    return (
      activeThreadRef !== null &&
      data.threadRef.environmentId === activeThreadRef.environmentId &&
      data.threadRef.threadId === activeThreadRef.threadId
    );
  }

  const toastThreadId = data?.threadId;
  if (!toastThreadId) {
    return true;
  }

  return activeThreadRef?.threadId === toastThreadId;
}
