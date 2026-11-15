/** Adds display-only reading controls to eligible Codex replies; canonical messages stay untouched. */
import { RegistryContext, useAtomValue } from "@effect/atom-react";
import {
  replyReadingPreferenceAtom,
  resolveReplyCitationSource,
  resolveReplyReading,
  type ReplyReadingResult,
} from "@t3tools/client-runtime/state/reply-reading";
import { replyRewriteIsActive } from "@t3tools/client-runtime/state/reply-rewrite";
import { type ReplyRewriteTargetInput } from "@t3tools/contracts";
import { AsyncResult } from "effect/reactivity";
import { use, useEffect, useState, type ReactNode } from "react";
import { t } from "~/i18n";
import { randomUUID } from "~/lib/utils";
import { replyRewriteEnvironment } from "~/state/replyRewrite";
import { serverEnvironment } from "~/state/server";
import { useAtomCommand } from "~/state/use-atom-command";
import { useV2ItemSupport } from "~/state/v2ItemSupport";
import { Button } from "../ui/button";
import { toastManager } from "../ui/toast";
import { TimelineRowCtx, type TimelineRow } from "./timelineRowContext";

type ReplyRow = Extract<TimelineRow, { kind: "message" | "assistant-meta" }>;
type ReadingChildren = (reading: ReplyReadingResult, controls?: ReactNode) => ReactNode;

export function ReplyRewriteResponse({
  row,
  sourceText,
  children,
}: {
  row: ReplyRow;
  sourceText: string;
  children: ReadingChildren;
}) {
  const original: ReplyReadingResult = {
    text: sourceText,
    source: "original",
    successAvailable: false,
  };
  const ctx = use(TimelineRowCtx);
  const projected = row.projectedItem;
  if (
    !projected ||
    projected.item.type !== "assistant_message" ||
    row.message.streaming ||
    !row.message.runId ||
    !ctx.threadRef ||
    ctx.turnItemSource
  )
    return children(original);
  return (
    <CodexReplyRewriteResponse
      row={row}
      sourceText={sourceText}
      projected={projected}
      target={{
        threadId: projected.sourceThreadId,
        runId: row.message.runId,
        messageId: row.message.id,
      }}
    >
      {children}
    </CodexReplyRewriteResponse>
  );
}

function CodexReplyRewriteResponse({
  row,
  sourceText,
  projected,
  target,
  children,
}: {
  row: ReplyRow;
  sourceText: string;
  projected: NonNullable<ReplyRow["projectedItem"]>;
  target: ReplyRewriteTargetInput;
  children: ReadingChildren;
}) {
  const ctx = use(TimelineRowCtx);
  const support = useV2ItemSupport({
    environmentId: ctx.activeThreadEnvironmentId,
    sourceThreadId: projected.sourceThreadId,
    sourceItemId: projected.sourceItemId,
  });
  const item = projected.item;
  const kind = item.type === "assistant_message" ? item.replyClassification?.kind : undefined;
  const eligible =
    (support.providerSession?.driver ?? support.providerThread?.driver) === "codex" &&
    support.providerThread?.ownerNodeId === null &&
    kind !== "commentary" &&
    kind !== "partial";
  if (!eligible) return children({ text: sourceText, source: "original", successAvailable: false });
  return (
    <ReplyRewriteReading
      key={`${ctx.activeThreadEnvironmentId}:${target.threadId}:${target.messageId}`}
      row={row}
      target={target}
      sourceText={sourceText}
      completionKey={`${support.run?.status}:${support.providerTurn?.status}`}
    >
      {children}
    </ReplyRewriteReading>
  );
}

function ReplyRewriteReading({
  row,
  target,
  sourceText,
  completionKey,
  children,
}: {
  row: ReplyRow;
  target: ReplyRewriteTargetInput;
  sourceText: string;
  completionKey: string;
  children: ReadingChildren;
}) {
  const ctx = use(TimelineRowCtx);
  const environmentId = ctx.activeThreadEnvironmentId;
  const registry = use(RegistryContext);
  const identity = { environmentId, ...target };
  const preferenceAtom = replyReadingPreferenceAtom(identity);
  const preference = useAtomValue(preferenceAtom);
  const queryTarget = { environmentId, input: { target, sourceText, completionKey } };
  const detail = useAtomValue(replyRewriteEnvironment.detail(queryTarget));
  const record = AsyncResult.getOrElse(detail, () => null);
  const config = useAtomValue(serverEnvironment.configValueAtom(environmentId));
  const allowed = useAtomValue(replyRewriteEnvironment.request.permissionAtom(environmentId));
  const cancelAllowed = useAtomValue(replyRewriteEnvironment.cancel.permissionAtom(environmentId));
  const request = useAtomCommand(replyRewriteEnvironment.request);
  const cancel = useAtomCommand(replyRewriteEnvironment.cancel);
  const [busy, setBusy] = useState(false);
  const [unconfirmedRequestId, setUnconfirmedRequestId] = useState<string | null>(null);
  const readingInput = {
    identity,
    sourceText,
    detail: { environmentId, sourceText, record },
    preference,
  };
  const available = resolveReplyReading({ ...readingInput, preference: null });
  const citationRequest =
    ctx.citationRequest?.citation.messageId === target.messageId ? ctx.citationRequest : null;
  const citationSource = citationRequest
    ? resolveReplyCitationSource(citationRequest.citation, available)
    : null;
  const reading = resolveReplyReading({
    ...readingInput,
    preference:
      citationSource === "original" || citationSource === "rewrite" ? citationSource : preference,
  });
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- a citation navigation is external input that selects its saved display version
  useEffect(() => {
    if (!citationRequest) return;
    if (citationSource === "unavailable" && !detail.waiting && detail._tag !== "Initial") {
      citationRequest.onComplete();
      toastManager.add({
        type: "warning",
        title: t.chat.replyRewrite.versionUnavailable,
        description: t.chat.replyRewrite.savedQuoteAvailable,
      });
    } else if (citationSource === "original" || citationSource === "rewrite")
      registry.set(preferenceAtom, citationSource);
  }, [citationRequest, citationSource, detail.waiting, detail._tag, registry, preferenceAtom]);

  const active = replyRewriteIsActive(record);
  const refresh = () => replyRewriteEnvironment.refresh(queryTarget, registry);
  const generate = async () => {
    if (!allowed || active || busy) return;
    setBusy(true);
    try {
      const requestId = unconfirmedRequestId ?? randomUUID();
      const result = await request({ environmentId, input: { ...target, requestId } });
      setUnconfirmedRequestId(result._tag === "Failure" ? requestId : null);
    } finally {
      refresh();
      setBusy(false);
    }
  };
  const stop = async () => {
    const requestId = record?.currentAttempt?.requestId;
    if (!cancelAllowed || !requestId || busy) return;
    setBusy(true);
    try {
      await cancel({ environmentId, input: { ...target, requestId } });
    } finally {
      refresh();
      setBusy(false);
    }
  };
  const attempt = record?.currentAttempt;
  const controls = (
    <div className="my-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
      <>
        <Button
          size="xs"
          variant="ghost"
          aria-pressed={reading.source === "original"}
          onClick={() => registry.set(preferenceAtom, "original")}
        >
          {t.chat.replyRewrite.original}
        </Button>
        <Button
          size="xs"
          variant="ghost"
          aria-pressed={reading.source === "rewrite"}
          disabled={!available.successAvailable}
          onClick={() => registry.set(preferenceAtom, "rewrite")}
        >
          {t.chat.replyRewrite.readable}
        </Button>
      </>
      <Button
        size="xs"
        variant="ghost"
        disabled={
          !allowed || active || busy || detail._tag === "Initial" || detail._tag === "Failure"
        }
        onClick={() => void generate()}
      >
        {available.successAvailable ? t.chat.replyRewrite.regenerate : t.chat.replyRewrite.generate}
      </Button>
      {active ? (
        <Button
          size="xs"
          variant="ghost"
          disabled={!cancelAllowed || busy}
          onClick={() => void stop()}
        >
          {t.chat.replyRewrite.cancel}
        </Button>
      ) : null}
      <Button size="xs" variant="ghost" disabled={busy} onClick={refresh}>
        {t.chat.replyRewrite.refresh}
      </Button>
      <span role="status">
        {busy
          ? t.chat.replyRewrite.submitting
          : attempt
            ? t.chat.replyRewrite.status[attempt.status]
            : ""}
      </span>
      {config?.settings.replyRewrite.auto ? <span>{t.chat.replyRewrite.autoEnabled}</span> : null}
      {!allowed ? <span>{t.chat.replyRewrite.permissionRequired}</span> : null}
      {detail._tag === "Failure" ? (
        <span role="alert">{t.chat.replyRewrite.detailFailed}</span>
      ) : null}
      {attempt?.error ? <span role="alert">{attempt.error.message}</span> : null}
    </div>
  );
  return children(reading, row.kind === "message" ? controls : undefined);
}
