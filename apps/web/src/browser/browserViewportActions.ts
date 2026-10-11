/** Localized browser errors and UI text; retains protocol values and user data. */
import { t } from "~/i18n";
import type { PreviewViewportSetting } from "@t3tools/contracts";

type BrowserViewportHandler = (setting: PreviewViewportSetting) => Promise<void>;

export const BROWSER_VIEWPORT_COMMIT_TIMEOUT_MS = 15_000;

/** A caller-facing viewport commit timeout; tabId identifies the original runtime tab. */
class BrowserViewportCommitTimeoutError extends Error {
  override readonly name = "BrowserViewportCommitTimeoutError";

  /** Creates the timeout message for the runtime tab ID; retains that ID on the error. */
  constructor(readonly tabId: string) {
    super(t.tools.browser.viewportCommitTimeout(tabId));
  }
}

const handlers = new Map<string, BrowserViewportHandler>();
const commitTails = new Map<string, Promise<void>>();

const queueBrowserViewportMutation = <A>(
  tabId: string,
  start: () => Promise<A>,
): {
  readonly started: Promise<{ readonly operation: Promise<A> }>;
  readonly execution: Promise<A>;
} => {
  const previous = commitTails.get(tabId) ?? Promise.resolve();
  const started = previous
    .catch(() => undefined)
    .then(() => ({
      operation: Promise.resolve().then(start),
    }));
  const execution = started.then(({ operation }) => operation);
  const tail = execution.then(() => undefined);
  commitTails.set(tabId, tail);
  const clear = () => {
    if (commitTails.get(tabId) === tail) commitTails.delete(tabId);
  };
  void tail.then(clear, clear);
  return { started, execution };
};

/**
 * Serializes every server-side viewport mutation for one desktop runtime tab.
 * Both visible UI commits and background automation use this queue so a
 * compensating rollback cannot overtake a newer resize.
 */
export function runBrowserViewportMutation<A>(
  tabId: string,
  mutation: () => Promise<A>,
): Promise<A> {
  return queueBrowserViewportMutation(tabId, mutation).execution;
}

const runHandlerWithTimeout = (tabId: string, operation: Promise<void>): Promise<void> => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(
      () => reject(new BrowserViewportCommitTimeoutError(tabId)),
      BROWSER_VIEWPORT_COMMIT_TIMEOUT_MS,
    );
  });
  return Promise.race([operation, timeout]).finally(() => {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  });
};

export function subscribeBrowserViewportChange(
  tabId: string,
  handler: BrowserViewportHandler,
): () => void {
  handlers.set(tabId, handler);
  return () => {
    if (handlers.get(tabId) === handler) handlers.delete(tabId);
  };
}

/**
 * Queues a visible-tab viewport mutation; rejects missing handlers and timed-out commits.
 * @param tabId Original runtime browser tab ID.
 * @param setting Requested viewport size and preset discriminator.
 * @returns Promise for the operation result; callers must handle the failures described above.
 */
export function commitBrowserViewportChange(
  tabId: string,
  setting: PreviewViewportSetting,
): Promise<void> {
  const { started } = queueBrowserViewportMutation(tabId, () => {
    const handler = handlers.get(tabId);
    return handler
      ? handler(setting)
      : Promise.reject(new Error(t.tools.browser.viewportHandlerMissing(tabId)));
  });
  // The queue follows the real handler lifetime, while the caller-facing
  // timeout starts only once this commit reaches the front of that queue.
  const result = started.then(({ operation }) => runHandlerWithTimeout(tabId, operation));
  return result;
}
