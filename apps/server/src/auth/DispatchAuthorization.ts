import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";

/** Internal revocable grant. Dispatch checks validity synchronously; waiters use the same latch. */
export interface DispatchAuthorization {
  readonly isValid: () => boolean;
  readonly invalidated: Effect.Effect<void>;
}

/** Revocation changes the dispatch guard before it wakes any waiter. */
export const make = (withinLifetime: () => boolean = () => true) => {
  let valid = true;
  const stopped = Deferred.makeUnsafe<void>();
  return {
    isValid: () => valid && withinLifetime(),
    invalidated: Deferred.await(stopped),
    invalidate: () => {
      valid = false;
      Deferred.doneUnsafe(stopped, Effect.void);
    },
  };
};
