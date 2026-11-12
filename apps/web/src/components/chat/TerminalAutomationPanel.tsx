import type { ScopedThreadRef, TerminalAutomationSelectionRequest } from "@t3tools/contracts";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { t } from "~/i18n";
import { getTerminalAutomation, subscribeTerminalAutomation } from "../../state/terminal";
import type { TerminalAutomationController } from "../../terminal/automationController";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog";
import { Radio, RadioGroup } from "../ui/radio-group";

function selectionError(error: unknown, resuming = false) {
  const code =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "code" in error
        ? error.code
        : null;
  return code === "stale_request" || (resuming && code === "human_intervened")
    ? resuming
      ? t.chat.terminalAutomation.staleResume
      : t.chat.terminalAutomation.stale
    : t.chat.terminalAutomation.failed;
}

function TerminalSelection({
  controller,
  request,
  onMessage,
  submitting,
}: {
  controller: TerminalAutomationController;
  request: TerminalAutomationSelectionRequest;
  onMessage: (message: string) => void;
  submitting: boolean;
}) {
  const [choice, setChoice] = useState<string | null>(null);
  const [locallyPending, setPending] = useState(false);
  const pending = locallyPending || submitting;
  const [errorMessage, setErrorMessage] = useState("");
  const busy = useRef(false);
  const submit = async (candidateId: string | null) => {
    if (busy.current || pending) return;
    busy.current = true;
    setPending(true);
    try {
      await controller.submitSelection(request.selectionRequestId, candidateId);
      onMessage(
        candidateId === null
          ? t.chat.terminalAutomation.cancelled
          : t.chat.terminalAutomation.selected,
      );
    } catch (error) {
      setErrorMessage(selectionError(error));
      onMessage(selectionError(error));
    } finally {
      busy.current = false;
      setPending(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) void submit(null);
      }}
    >
      <DialogPopup showCloseButton={!pending}>
        <DialogHeader>
          <DialogTitle>{t.chat.terminalAutomation.choose}</DialogTitle>
          <DialogDescription>{t.chat.terminalAutomation.description}</DialogDescription>
        </DialogHeader>
        <div className="px-5.5 py-4">
          <RadioGroup
            aria-label={t.chat.terminalAutomation.choose}
            value={choice}
            onValueChange={setChoice}
            disabled={pending}
          >
            {request.candidates.map((candidate) => (
              <label key={candidate.candidateId} className="flex min-w-0 items-start gap-3 text-sm">
                <Radio value={candidate.candidateId} />
                <span className="min-w-0 break-all">
                  <span className="block font-medium">{candidate.title}</span>
                  <span className="block text-muted-foreground">
                    {candidate.clientKind === "web"
                      ? t.chat.terminalAutomation.web
                      : t.chat.terminalAutomation.desktop}{" "}
                    ·{" "}
                    {candidate.visible
                      ? t.chat.terminalAutomation.visible
                      : t.chat.terminalAutomation.hidden}
                  </span>
                  <span className="block text-muted-foreground">
                    {candidate.target.terminalId} · {candidate.target.terminalInstanceId} ·{" "}
                    {candidate.target.viewId}
                  </span>
                </span>
              </label>
            ))}
          </RadioGroup>
          <p role="alert" className="text-destructive">
            {errorMessage}
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={() => void submit(null)}>
            {t.common.confirm.cancel}
          </Button>
          <Button
            disabled={pending || choice === null}
            onClick={() => {
              if (choice !== null) void submit(choice);
            }}
          >
            {pending ? t.chat.terminalAutomation.pending : t.chat.terminalAutomation.confirm}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

const subscribeNothing = () => () => {};
const emptySnapshot = () => null;

export function TerminalAutomationPanel({ threadRef }: { threadRef: ScopedThreadRef }) {
  const controller = useSyncExternalStore(subscribeTerminalAutomation, () =>
    getTerminalAutomation(threadRef),
  );
  const snapshot = useSyncExternalStore(
    controller?.subscribe ?? subscribeNothing,
    controller?.getSnapshot ?? emptySnapshot,
  );
  const [message, setMessage] = useState("");
  const [verified, setVerified] = useState<TerminalAutomationController | null>(null);
  const ready = snapshot?.ready ?? false;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- checks server invitation validity when this foreground scope mounts or reconnects
  useEffect(() => {
    if (!controller || !ready) return;
    let current = true;
    void controller.synchronize().then(
      () => {
        if (current) setVerified(controller);
      },
      (error: unknown) => {
        if (current) setMessage(selectionError(error));
      },
    );
    return () => {
      current = false;
    };
  }, [controller, ready]);
  if (!controller || !snapshot) return null;
  const request = snapshot.ready && verified === controller ? snapshot.selections[0] : undefined;
  const refresh = async () => {
    try {
      await controller.synchronize();
      setVerified(controller);
      setMessage("");
    } catch (error) {
      setMessage(selectionError(error));
    }
  };
  const resume = async (bindingId: string, epoch: number) => {
    try {
      await controller.resume(bindingId, epoch);
      setMessage("");
    } catch (error) {
      setMessage(
        controller.getSnapshot().unverifiedResumeBindingIds.includes(bindingId)
          ? ""
          : selectionError(error, true),
      );
    }
  };
  return (
    <div className="max-h-40 shrink-0 overflow-y-auto bg-card text-sm">
      {snapshot.bindings.map((state) => {
        const binding = state.binding;
        const locallyPaused = controller.isBindingLocallyPaused(binding);
        const status = !snapshot.ready
          ? t.chat.terminalAutomation.unavailable
          : state.status === "invalid"
            ? state.reason === "client_unavailable"
              ? t.chat.terminalAutomation.unavailable
              : t.chat.terminalAutomation.invalid
            : state.status === "paused" || locallyPaused
              ? t.chat.terminalAutomation.paused
              : t.chat.terminalAutomation.bound;
        const pending = snapshot.resumingBindingIds.includes(binding.bindingId);
        const unverified = snapshot.unverifiedResumeBindingIds.includes(binding.bindingId);
        return (
          <div key={binding.bindingId} className="flex flex-wrap items-center gap-2 px-3 py-1">
            <span className="min-w-0 break-all">
              {binding.alias} · {binding.target.terminalId} · {binding.target.terminalInstanceId} ·{" "}
              {binding.target.viewId} · {t.chat.terminalAutomation.inputEpoch(binding.inputEpoch)} ·{" "}
              <span role="status">{status}</span>
            </span>
            {snapshot.ready && state.status !== "invalid" && unverified ? (
              <Button size="sm" variant="outline" disabled={pending} onClick={() => void refresh()}>
                {pending ? t.chat.terminalAutomation.pending : t.chat.terminalAutomation.verify}
              </Button>
            ) : snapshot.ready && state.status === "paused" ? (
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => void resume(binding.bindingId, binding.inputEpoch)}
              >
                {pending ? t.chat.terminalAutomation.pending : t.chat.terminalAutomation.resume}
              </Button>
            ) : null}
          </div>
        );
      })}
      {!snapshot.ready || snapshot.error || verified !== controller ? (
        <div className="flex items-center gap-2 px-3 py-1">
          <span>
            {!snapshot.ready || snapshot.error
              ? t.chat.terminalAutomation.unavailable
              : t.chat.terminalAutomation.checking}
          </span>
          {snapshot.ready ? (
            <Button size="sm" variant="outline" onClick={() => void refresh()}>
              {t.chat.terminalAutomation.refresh}
            </Button>
          ) : null}
        </div>
      ) : null}
      <p role="status" className="px-3 text-muted-foreground">
        {snapshot.unverifiedResumeBindingIds.length > 0
          ? t.chat.terminalAutomation.unknownResume
          : message}
      </p>
      {request ? (
        <TerminalSelection
          key={`${request.selectionRequestId}:${request.candidateVersion}`}
          controller={controller}
          request={request}
          onMessage={setMessage}
          submitting={snapshot.submittingSelectionIds.includes(request.selectionRequestId)}
        />
      ) : null}
    </div>
  );
}
