/** Localized desktop presentation and existing interaction behavior. */
import { t } from "~/i18n";
import { settlePromise } from "@t3tools/client-runtime/state/runtime";
import type { DesktopSshPasswordPromptRequest } from "@t3tools/contracts";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import * as Cause from "effect/Cause";
import { useId, useRef, useState, useSyncExternalStore } from "react";

import { useDeadlinePassed } from "../../hooks/useDeadline";
import { useNowSecond } from "../../hooks/useNowSecond";

import { Button } from "../ui/button";
import { Dialog, DialogDescription } from "../ui/dialog";
import { OnboardingPopup, OnboardingFooter } from "../onboarding/OnboardingSurface";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Input } from "../ui/input";

/** Formats only the current request’s real user and destination for the password prompt. */
function describeSshTarget(request: DesktopSshPasswordPromptRequest): string {
  return request.username ? `${request.username}@${request.destination}` : request.destination;
}

/** Formats the remaining whole seconds as minutes and two-digit seconds for the expiry indicator. */
function formatRemainingSeconds(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Returns the supplied SSH response error, replacing expired or no-longer-pending responses with reconnection guidance. */
function getPromptErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : t.account.desktop.sshPromptFailed;
  return message.includes("expired") || message.includes("no longer pending")
    ? t.account.desktop.sshExpired
    : message;
}

let promptQueue: readonly DesktopSshPasswordPromptRequest[] = [];
const promptQueueListeners = new Set<() => void>();

/** Publishes the pending SSH prompt queue to mounted subscribers without persisting credentials. */
function setPromptQueue(next: readonly DesktopSshPasswordPromptRequest[]) {
  promptQueue = next;
  for (const listener of promptQueueListeners) listener();
}

/**
 * Queues the desktop's SSH password prompts for the life of the page, so a prompt
 * that arrives while no dialog is mounted still waits for one.
 */
export function startSshPasswordPromptQueue(): () => void {
  return (
    window.desktopBridge?.onSshPasswordPrompt((request) => {
      setPromptQueue([...promptQueue, request]);
    }) ?? (() => undefined)
  );
}

/** Registers a queue listener and returns its cleanup; mounting a dialog reads prompts received before it mounted. */
function subscribePromptQueue(listener: () => void): () => void {
  promptQueueListeners.add(listener);
  return () => {
    promptQueueListeners.delete(listener);
  };
}

/** Returns the current stable queue snapshot for the dialog subscription. */
const readPromptQueue = () => promptQueue;

/** Removes only the active request matching requestId so stale responses cannot dismiss a newer prompt. */
function removeSshPasswordPrompt(requestId: string) {
  if (promptQueue[0]?.requestId === requestId) setPromptQueue(promptQueue.slice(1));
}

/** Queues desktop password requests and mounts only the active request; credentials stay in that prompt’s local state. */
export function SshPasswordPromptDialog() {
  const queue = useSyncExternalStore(subscribePromptQueue, readPromptQueue, readPromptQueue);
  const currentRequest = queue[0] ?? null;

  if (!currentRequest) {
    return null;
  }

  return <ActiveSshPasswordPrompt key={currentRequest.requestId} request={currentRequest} />;
}

/** Renders the supplied pending SSH request with countdown and response controls; submits a password only for the active request and does not persist it. */
function ActiveSshPasswordPrompt({
  request,
}: {
  readonly request: DesktopSshPasswordPromptRequest;
}) {
  const [password, setPassword] = useState("");
  const [isResponding, setIsResponding] = useState(false);
  const [responseError, setResponseError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const isRespondingRef = useRef(false);
  const formId = useId();

  const expiresAtMs = Date.parse(request.expiresAt);
  const now = useNowSecond();
  const isExpired = useDeadlinePassed(Number.isFinite(expiresAtMs) ? expiresAtMs : null);
  const remainingMs = Number.isFinite(expiresAtMs)
    ? isExpired
      ? 0
      : Math.max(0, expiresAtMs - now)
    : null;
  const remainingSeconds = remainingMs === null ? null : Math.ceil(remainingMs / 1_000);
  const remainingLabel =
    remainingSeconds === null ? null : formatRemainingSeconds(remainingSeconds);
  const visibleResponseError = isExpired ? t.account.desktop.sshExpired : responseError;

  const respond = async (nextPassword: string | null) => {
    if (isRespondingRef.current) {
      return;
    }

    const requestId = request.requestId;
    if (nextPassword !== null && isExpired) {
      setResponseError(t.account.desktop.sshExpired);
      return;
    }

    isRespondingRef.current = true;
    setIsResponding(true);
    setResponseError(null);
    const result = await settlePromise(async () =>
      window.desktopBridge?.resolveSshPasswordPrompt(requestId, nextPassword),
    );
    if (AsyncResult.isSuccess(result) || nextPassword === null) {
      removeSshPasswordPrompt(requestId);
    } else {
      setResponseError(getPromptErrorMessage(Cause.squash(result.cause)));
    }
    isRespondingRef.current = false;
    setIsResponding(false);
  };

  const dismissExpiredPrompt = () => {
    removeSshPasswordPrompt(request.requestId);
  };

  const cancelPrompt = () => {
    if (isExpired) {
      dismissExpiredPrompt();
      return;
    }
    void respond(null);
  };

  const target = describeSshTarget(request);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          cancelPrompt();
        }
      }}
    >
      <OnboardingPopup>
        <header className="flex flex-col gap-3.5">
          <DialogPrimitive.Title className="font-serif text-ov5-prompt-title font-bold">
            {t.account.desktop.sshPasswordRequired}
          </DialogPrimitive.Title>
          <p className="font-mono text-secondary-copy-medium text-secondary-label">{target}</p>
          <DialogDescription className="sr-only">
            {t.account.desktop.sshPasswordPrefix}
            <code>{target}</code>
            {t.account.desktop.sshPasswordSuffix}
          </DialogDescription>
        </header>
        <div>
          <form
            className="space-y-3"
            id={formId}
            onSubmit={(event) => {
              event.preventDefault();
              void respond(password);
            }}
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <label
                  htmlFor={`${formId}-password`}
                  className="text-secondary-copy text-secondary-label"
                >
                  {request.prompt}
                </label>
                {remainingLabel ? (
                  <span
                    className={
                      isExpired
                        ? "shrink-0 text-secondary-copy font-medium text-destructive"
                        : "shrink-0 text-secondary-copy text-muted-foreground"
                    }
                  >
                    {isExpired ? t.account.desktop.expired : remainingLabel}
                  </span>
                ) : null}
              </div>
              <Input
                id={`${formId}-password`}
                size="lg"
                aria-invalid={visibleResponseError !== null}
                ref={inputRef}
                autoComplete="current-password"
                disabled={isResponding || isExpired}
                name="ssh-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            {visibleResponseError ? (
              <p className="text-control text-destructive">{visibleResponseError}</p>
            ) : (
              <p className="text-control text-muted-foreground">{t.account.desktop.sshKeysHint}</p>
            )}
          </form>
        </div>
        <OnboardingFooter>
          <Button
            size="dialog-action"
            disabled={isResponding}
            type="button"
            variant="outline"
            onClick={cancelPrompt}
          >
            {isExpired ? t.account.desktop.dismiss : t.common.confirm.cancel}
          </Button>
          <Button
            size="dialog-action"
            disabled={isResponding || isExpired}
            form={formId}
            type="submit"
          >
            {t.account.desktop.connect}
          </Button>
        </OnboardingFooter>
      </OnboardingPopup>
    </Dialog>
  );
}
