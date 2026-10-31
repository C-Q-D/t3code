/** Renders secret requests while keeping entered values confined to state and the RPC payload. */
import { t } from "~/i18n";
import { pipe } from "effect/Function";
import {
  SECRET_REQUEST_DEFAULT_PLACEHOLDER,
  secretRequestAnswerInput,
  secretRequestDisplay,
  secretRequestPrivacyNote,
  secretRequestFailureMessage,
  type SecretRequestItem,
} from "@t3tools/client-runtime/secret-request";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type { EnvironmentId, OrchestrationV2ProjectedTurnItem } from "@t3tools/contracts";
import { CheckIcon, KeyRoundIcon, LockIcon, MinusIcon, ShieldCheckIcon } from "lucide-react";
import { useId, useRef, useState, type FormEvent } from "react";

import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { WorkLogRow } from "./WorkLog";

export function SecretRequestCard(props: {
  readonly environmentId: EnvironmentId;
  readonly item: SecretRequestItem;
  readonly visibility: OrchestrationV2ProjectedTurnItem["visibility"];
}) {
  const { item } = props;
  const display = secretRequestDisplay(item, props.visibility);
  if (display.kind === "answered" || display.kind === "pending-elsewhere") {
    const Icon =
      display.kind === "pending-elsewhere"
        ? LockIcon
        : display.outcome === "saved"
          ? CheckIcon
          : MinusIcon;
    return (
      <WorkLogRow
        data-v2-item-type={item.type}
        icon={<Icon className="size-3.5 text-icon-muted" aria-hidden />}
        label={
          <>
            {item.label} · {display.label}
          </>
        }
      />
    );
  }
  return <PendingSecretRequestForm environmentId={props.environmentId} item={item} />;
}

/** Collects or declines one request through the existing guarded command, without reporting secrets. */
function PendingSecretRequestForm(props: {
  readonly environmentId: EnvironmentId;
  readonly item: SecretRequestItem;
}) {
  const { item } = props;
  const inputId = useId();
  const errorId = useId();
  const privacyId = useId();
  const answer = useAtomCommand(serverEnvironment.answerSecretRequest, {
    label: "answer secret request",
    // The failure cause holds the request; keep it out of the console.
    reportFailure: false,
    reportDefect: false,
  });
  const [secret, setSecret] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Enter and click can both submit before a render.
  const inFlight = useRef(false);

  const send = async (
    reply: { readonly type: "save"; readonly secret: string } | { readonly type: "decline" },
  ) => {
    const input = secretRequestAnswerInput(item, reply);
    if (input === null || inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    setError(null);
    const result = await answer({ environmentId: props.environmentId, input }).finally(() => {
      inFlight.current = false;
      setSubmitting(false);
    });
    if (result._tag === "Success") {
      setSecret("");
      return;
    }
    if (!isAtomCommandInterrupted(result)) {
      pipe(squashAtomCommandFailure(result), secretRequestFailureMessage, setError);
    }
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void send({ type: "save", secret });
  };

  return (
    <form
      data-v2-item-type={item.type}
      className="timeline-secret flex min-w-0 flex-col gap-2.5 rounded-card-surface surface-glass p-3.5 text-secondary-copy-large text-foreground shadow-timeline-request-card"
      onSubmit={onSubmit}
      autoComplete="off"
      // On click, not pointerdown: the mousedown that follows a pointerdown
      // moves focus back off the input. A click that ends a text selection
      // leaves it alone so the reason can still be copied.
      onClick={(event) => {
        if (!(event.target instanceof Element)) return;
        if (event.target.closest("input, button, a")) return;
        if (window.getSelection()?.isCollapsed === false) return;
        document.getElementById(inputId)?.focus();
      }}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <label htmlFor={inputId} className="flex min-w-0 items-center gap-2 font-bold">
          <KeyRoundIcon aria-hidden className="size-4 shrink-0" />
          {item.label}
        </label>
        {item.reason.trim() ? (
          <p className="text-secondary-copy-medium text-secondary-label">{item.reason}</p>
        ) : null}
      </div>
      <div className="min-w-0">
        <Input
          id={inputId}
          // Masked text rather than a password field: browsers offer to
          // save any submitted password, and this is not a login.
          type="text"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          // Password managers otherwise offer to save or fill this field.
          data-1p-ignore
          data-lpignore="true"
          data-bwignore
          placeholder={item.placeholder ?? SECRET_REQUEST_DEFAULT_PLACEHOLDER}
          value={secret}
          disabled={submitting}
          aria-invalid={error !== null || undefined}
          aria-describedby={error !== null ? `${privacyId} ${errorId}` : privacyId}
          onChange={(event) => setSecret(event.currentTarget.value)}
        />
      </div>
      {error !== null ? (
        <p id={errorId} role="alert" className="text-secondary-copy text-error-foreground">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap justify-end gap-1.5">
        <Button
          type="button"
          size="toolbar"
          variant="destructive-outline"
          disabled={submitting}
          onClick={() => void send({ type: "decline" })}
        >
          {t.composer.secretRequest.decline}
        </Button>
        <Button type="submit" size="toolbar" disabled={submitting || secret.trim().length === 0}>
          <LockIcon aria-hidden className="size-3.25" />
          {t.composer.secretRequest.save}
        </Button>
      </div>
      <p
        id={privacyId}
        className="flex min-w-0 items-center gap-1.5 text-secondary-copy text-secondary-label"
      >
        <ShieldCheckIcon className="size-3.5 shrink-0" aria-hidden />
        {secretRequestPrivacyNote(item)}
      </p>
    </form>
  );
}
