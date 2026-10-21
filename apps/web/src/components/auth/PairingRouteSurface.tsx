/** Localized auth presentation and existing interaction behavior. */
import { t } from "~/i18n";
import { Alert, AlertDescription } from "../ui/alert";
import type { AuthSessionState } from "@t3tools/contracts";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import React, { startTransition, useEffect, useEffectEvent, useRef, useState } from "react";

import { connectPairing } from "../../connection/onboarding";
import {
  peekPairingTokenFromUrl,
  stripPairingTokenFromUrl,
  submitServerAuthCredential,
} from "../../environments/primary";
import { readHostedPairingRequest } from "../../hostedPairing";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { OnboardingPage, OnboardingStatus } from "../onboarding/OnboardingSurface";
import { useAtomCommand } from "../../state/use-atom-command";

/** Renders the pending pairing status while authentication prepares the session; performs no authentication itself. */
export function PairingPendingSurface() {
  return (
    <OnboardingPage>
      <h1 className="font-serif text-ov5-connect-title font-bold">
        {t.account.auth.pairEnvironment}
      </h1>
      <OnboardingStatus tone="pending">{t.account.auth.pairingBackend}</OnboardingStatus>
      <p className="text-secondary-copy text-secondary-label">{t.account.auth.validatingPairing}</p>
    </OnboardingPage>
  );
}

/** Renders the supplied authentication gate and pairing form; submits user credentials and surfaces rejected authentication without changing the supported methods. */
export function PairingRouteSurface({
  auth,
  initialErrorMessage,
  onAuthenticated,
}: {
  auth: AuthSessionState["auth"];
  initialErrorMessage?: string;
  onAuthenticated: () => void;
}) {
  const [autoPairToken] = useState(peekPairingTokenFromUrl);
  const [credential, setCredential] = useState(autoPairToken ?? "");
  const [errorMessage, setErrorMessage] = useState(initialErrorMessage ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const autoSubmitAttemptedRef = useRef(false);

  const submitCredential = async (nextCredential: string) => {
    setIsSubmitting(true);
    setErrorMessage("");

    const submitError = await submitServerAuthCredential(nextCredential).then(
      () => null,
      (error) => errorMessageFromUnknown(error),
    );

    setIsSubmitting(false);

    if (submitError) {
      setErrorMessage(submitError);
      return;
    }

    startTransition(() => {
      onAuthenticated();
    });
  };

  const handleSubmit = async (event?: React.SubmitEvent<HTMLFormElement>) => {
    event?.preventDefault();
    await submitCredential(credential);
  };

  const autoSubmit = useEffectEvent((token: string) => {
    void submitCredential(token);
  });

  useEffect(() => {
    if (!autoPairToken || autoSubmitAttemptedRef.current) {
      return;
    }

    autoSubmitAttemptedRef.current = true;
    stripPairingTokenFromUrl();
    autoSubmit(autoPairToken);
  }, [autoPairToken]);

  return (
    <OnboardingPage>
      <h1 className="font-serif text-ov5-connect-title font-bold">
        {t.account.auth.pairEnvironment}
      </h1>
      <p className="text-secondary-copy text-secondary-label">
        {describeAuthGate(auth.bootstrapMethods)}
      </p>

      <form className="space-y-3.5" onSubmit={(event) => void handleSubmit(event)}>
        <div className="space-y-2">
          <label className="sr-only" htmlFor="pairing-token">
            {t.account.auth.pairingToken}
          </label>
          <Input
            id="pairing-token"
            size="lg"
            font="mono"
            aria-invalid={errorMessage.length > 0}
            autoCapitalize="none"
            autoComplete="off"
            autoCorrect="off"
            disabled={isSubmitting}
            nativeInput
            onChange={(event) => setCredential(event.currentTarget.value)}
            placeholder={t.account.auth.pairingCredentialPlaceholder}
            spellCheck={false}
            value={credential}
          />
        </div>

        {isSubmitting ? (
          <OnboardingStatus tone="pending">{t.account.auth.pairingBackend}</OnboardingStatus>
        ) : errorMessage ? (
          <>
            <OnboardingStatus tone="error">{t.account.auth.pairingFailed}</OnboardingStatus>
            <p className="text-secondary-copy text-error-foreground">{errorMessage}</p>
          </>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2">
          <Button disabled={isSubmitting} size="dialog-action" type="submit">
            {isSubmitting ? t.account.auth.pairing : t.account.auth.continue}
          </Button>
          <Button
            disabled={isSubmitting}
            onClick={() => window.location.reload()}
            size="dialog-action"
            variant="outline"
          >
            {t.account.auth.reloadApp}
          </Button>
        </div>
      </form>

      <div className="text-secondary-copy text-secondary-label">
        {describeSupportedMethods(auth.bootstrapMethods)}
      </div>
    </OnboardingPage>
  );
}

/** Consumes the hosted pairing request once, displays pairing progress and recovery, and navigates only after user action. */
export function HostedPairingRouteSurface() {
  const connectPairingEnvironment = useAtomCommand(connectPairing, {
    reportFailure: false,
  });
  const [request] = useState(readHostedPairingRequest);
  const [status, setStatus] = useState<"pairing" | "paired" | "error">(
    request ? "pairing" : "error",
  );
  const [message, setMessage] = useState(
    request ? t.account.auth.connectingBackend : t.account.auth.incompleteLink,
  );
  const [canRetry, setCanRetry] = useState(false);
  const submitAttemptedRef = useRef(false);
  const tokenSubmittedRef = useRef(false);

  const submitHostedPairingRequest = async () => {
    if (!request) {
      setStatus("error");
      setMessage(t.account.auth.incompleteLink);
      setCanRetry(false);
      return;
    }

    if (tokenSubmittedRef.current) {
      setStatus("error");
      setMessage(t.account.auth.tokenSubmitted);
      setCanRetry(false);
      return;
    }

    setStatus("pairing");
    setMessage(t.account.auth.connectingBackend);
    setCanRetry(false);
    tokenSubmittedRef.current = true;

    const result = await connectPairingEnvironment({
      host: request.host,
      pairingCode: request.token,
    });
    if (result._tag === "Success") {
      setStatus("paired");
      setMessage(t.account.auth.environmentSaved(request.label));
      return;
    }

    tokenSubmittedRef.current = false;
    setStatus("error");
    setCanRetry(true);
    setMessage(
      t.account.auth.retryPairingHint(errorMessageFromUnknown(squashAtomCommandFailure(result))),
    );
  };

  const submitOnMount = useEffectEvent(() => {
    void submitHostedPairingRequest();
  });

  useEffect(() => {
    if (submitAttemptedRef.current) {
      return;
    }
    submitAttemptedRef.current = true;

    stripPairingTokenFromUrl();
    submitOnMount();
  }, []);

  return (
    <OnboardingPage>
      <h1 className="font-serif text-ov5-connect-title font-bold">
        {t.account.auth.pairEnvironment}
      </h1>
      {request ? (
        <Input
          size="lg"
          font="mono"
          nativeInput
          readOnly
          value={request.host}
          aria-label={t.account.auth.hostPrefix}
          aria-invalid={status === "error"}
        />
      ) : null}
      <OnboardingStatus
        tone={status === "paired" ? "success" : status === "error" ? "error" : "pending"}
      >
        {status === "paired"
          ? t.account.auth.backendPaired
          : status === "error"
            ? t.account.auth.pairingFailed
            : t.account.auth.pairingBackend}
      </OnboardingStatus>
      <p className="text-secondary-copy text-secondary-label">{message}</p>

      {status === "error" ? (
        <Alert variant="error" className="mt-0">
          <AlertDescription>{t.account.auth.verifyBackend}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2">
        {status === "pairing" ? (
          <Button disabled size="dialog-action">
            {t.account.auth.pairing}
          </Button>
        ) : canRetry ? (
          <Button size="dialog-action" onClick={() => void submitHostedPairingRequest()}>
            {t.account.auth.tryAgain}
          </Button>
        ) : null}
        {status === "paired" ? (
          <Button
            size="dialog-action"
            variant="outline"
            onClick={() => (window.location.href = "/")}
          >
            {t.account.auth.openApp}
          </Button>
        ) : null}
      </div>
    </OnboardingPage>
  );
}

/** Returns the supplied error's message when available, otherwise a localized authentication failure message. */
function errorMessageFromUnknown(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }

  return t.account.auth.authenticationFailed;
}

/** Describes the credential required by the supplied bootstrap method IDs; those protocol identifiers are not translated. */
function describeAuthGate(bootstrapMethods: ReadonlyArray<string>): string {
  if (bootstrapMethods.includes("desktop-bootstrap")) {
    return t.account.auth.trustedCredential;
  }

  return t.account.auth.enterToken;
}

/** Returns pairing instructions for the supplied bootstrap methods, distinguishing desktop-managed credentials from one-time tokens. */
function describeSupportedMethods(bootstrapMethods: ReadonlyArray<string>): string {
  if (
    bootstrapMethods.includes("desktop-bootstrap") &&
    bootstrapMethods.includes("one-time-token")
  ) {
    return t.account.auth.desktopAndTokenHint;
  }

  if (bootstrapMethods.includes("desktop-bootstrap")) {
    return t.account.auth.desktopManagedHint;
  }

  return t.account.auth.oneTimeTokenHint;
}
