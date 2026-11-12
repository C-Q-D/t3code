import type { ScopedThreadRef, TerminalAutomationSelectionRequest } from "@t3tools/contracts";
import { useRef, useState, useSyncExternalStore } from "react";
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

function selectionError(error: unknown) {
  const code =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "code" in error
        ? error.code
        : null;
  return code === "stale_request"
    ? t.chat.terminalAutomation.stale
    : t.chat.terminalAutomation.failed;
}

function TerminalSelection({
  controller,
  request,
  onMessage,
}: {
  controller: TerminalAutomationController;
  request: TerminalAutomationSelectionRequest;
  onMessage: (message: string) => void;
}) {
  const [choice, setChoice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const busy = useRef(false);
  const submit = async (candidateId: string | null) => {
    if (busy.current) return;
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
  if (!controller || !snapshot) return null;
  const request = snapshot.ready ? snapshot.selections[0] : undefined;
  return (
    <div className="shrink-0 text-sm">
      <p role="status" className="px-3 text-muted-foreground">
        {message}
      </p>
      {request ? (
        <TerminalSelection
          key={`${request.selectionRequestId}:${request.candidateVersion}`}
          controller={controller}
          request={request}
          onMessage={setMessage}
        />
      ) : null}
    </div>
  );
}
