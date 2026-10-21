/** Localized desktop presentation and existing interaction behavior. */
import { t } from "~/i18n";
import { settlePromise } from "@t3tools/client-runtime/state/runtime";
import type { DesktopSshPasswordPromptRequest } from "@t3tools/contracts";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import * as Cause from "effect/Cause";
import { useEffect, useId, useRef, useState } from "react";

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

/** Queues desktop password requests and mounts only the active request; credentials stay in that prompt’s local state. */
export function SshPasswordPromptDialog() {
  const [queue, setQueue] = useState<readonly DesktopSshPasswordPromptRequest[]>([]);
  const currentRequest = queue[0] ?? null;

  useEffect(() => {
    const bridge = window.desktopBridge;
    if (!bridge?.onSshPasswordPrompt) {
      return;
    }

    return bridge.onSshPasswordPrompt((request) => {
      setQueue((currentQueue) => [...currentQueue, request]);
    });
  }, []);

  if (!currentRequest) {
    return null;
  }

  return (
    <ActiveSshPasswordPrompt
      key={currentRequest.requestId}
      request={currentRequest}
      onRemove={(requestId) => {
        setQueue((currentQueue) =>
          currentQueue[0]?.requestId === requestId ? currentQueue.slice(1) : currentQueue,
        );
      }}
    />
  );
}

/** Renders the supplied pending SSH request with countdown and response controls; submits a password only for the active request and does not persist it. */
function ActiveSshPasswordPrompt({
  request,
  onRemove,
}: {
  readonly request: DesktopSshPasswordPromptRequest;
  readonly onRemove: (requestId: string) => void;
}) {
  const [password, setPassword] = useState("");
  const [isResponding, setIsResponding] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [responseError, setResponseError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const isRespondingRef = useRef(false);
  const formId = useId();

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 1_000);
    return () => {
      window.clearInterval(interval);
    };
  }, []);

  const expiresAtMs = Date.parse(request.expiresAt);
  const remainingMs = Number.isFinite(expiresAtMs) ? Math.max(0, expiresAtMs - now) : null;
  const isExpired = remainingMs !== null && remainingMs <= 0;
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
      onRemove(requestId);
    } else {
      setResponseError(getPromptErrorMessage(Cause.squash(result.cause)));
    }
    isRespondingRef.current = false;
    setIsResponding(false);
  };

  const dismissExpiredPrompt = () => {
    onRemove(request.requestId);
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
