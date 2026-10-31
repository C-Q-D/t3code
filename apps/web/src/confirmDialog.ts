/** Queues local confirmations and preserves caller copy until each close transition completes. */
import type { ConfirmDialogOptions, ConfirmDialogVariant } from "@t3tools/contracts";

/** Public render state; action copy stays attached while its dialog closes. */
export type ConfirmDialogState =
  | { readonly status: "idle" }
  | {
      readonly status: "confirming";
      readonly message: string;
      readonly variant: ConfirmDialogVariant;
      readonly confirmLabel?: string;
    }
  | {
      readonly status: "closing";
      readonly message: string;
      readonly variant: ConfirmDialogVariant;
      readonly confirmLabel?: string;
    };

/** A queued question, its localized action, and the resolver owned by its caller. */
type PendingConfirmation = {
  readonly message: string;
  readonly variant: ConfirmDialogVariant;
  readonly confirmLabel?: string;
  readonly resolve: (confirmed: boolean) => void;
};

const idleState: ConfirmDialogState = { status: "idle" };
let state: ConfirmDialogState = idleState;
let activeConfirmation: PendingConfirmation | null = null;
let queuedConfirmations: PendingConfirmation[] = [];
const listeners = new Set<() => void>();

/** Notifies subscribers after replacing the render state. */
function publish(next: ConfirmDialogState): void {
  state = next;
  for (const listener of listeners) {
    listener();
  }
}

/** Resolves active and queued callers with the supplied response and empties the queue. */
function resolvePendingConfirmations(confirmed: boolean): void {
  activeConfirmation?.resolve(confirmed);
  for (const confirmation of queuedConfirmations) {
    confirmation.resolve(confirmed);
  }
  activeConfirmation = null;
  queuedConfirmations = [];
}

/** Returns the current immutable render snapshot for external-store subscribers. */
export function readConfirmDialogState(): ConfirmDialogState {
  return state;
}

/**
 * Only themed hosts subscribe, so a subscriber is a mounted host. When the last
 * one leaves, pending confirmations resolve as cancelled.
 */
export function subscribeConfirmDialogHost(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    if (!listeners.delete(listener) || listeners.size > 0) return;
    resolvePendingConfirmations(false);
    publish(idleState);
  };
}

/** Undefined means no themed host is available. */
export function requestConfirmDialog(
  message: string,
  options?: ConfirmDialogOptions,
): Promise<boolean> | undefined {
  if (listeners.size === 0) return undefined;

  const confirmation = new Promise<boolean>((resolve) => {
    const pending = {
      message,
      variant: options?.variant ?? "default",
      ...(options?.confirmLabel === undefined ? {} : { confirmLabel: options.confirmLabel }),
      resolve,
    } satisfies PendingConfirmation;
    if (activeConfirmation || state.status === "closing") {
      queuedConfirmations.push(pending);
      return;
    }

    activeConfirmation = pending;
    publish({
      status: "confirming",
      message,
      variant: pending.variant,
      ...(pending.confirmLabel === undefined ? {} : { confirmLabel: pending.confirmLabel }),
    });
  });

  return confirmation;
}

export function isConfirmDialogActive(): boolean {
  return state.status !== "idle" || activeConfirmation !== null || queuedConfirmations.length > 0;
}

/** Resolves the active caller once and retains its copy until the close transition ends. */
export function respondToConfirmDialog(confirmed: boolean): void {
  if (state.status !== "confirming" || !activeConfirmation) return;

  const confirmation = activeConfirmation;
  activeConfirmation = null;
  confirmation.resolve(confirmed);
  publish({ ...state, status: "closing" });
}

/** Activates the next queued request only after the previous popup finishes closing. */
export function completeConfirmDialogClose(): void {
  if (state.status !== "closing") return;

  const next = queuedConfirmations.shift();
  if (!next) {
    publish(idleState);
    return;
  }

  activeConfirmation = next;
  publish({
    status: "confirming",
    message: next.message,
    variant: next.variant,
    ...(next.confirmLabel === undefined ? {} : { confirmLabel: next.confirmLabel }),
  });
}

/** Cancels pending test requests and clears host registrations and listeners. */
export function resetConfirmDialogForTests(): void {
  listeners.clear();
  resolvePendingConfirmations(false);
  publish(idleState);
}
