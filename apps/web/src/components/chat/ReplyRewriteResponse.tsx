/** Adds display-only reading controls to eligible Codex replies; canonical messages stay untouched. */
import { RegistryContext, useAtomValue } from "@effect/atom-react";
import {
  replyReadingPreferenceAtom,
  resolveReplyReading,
  type ReplyReadingResult,
} from "@t3tools/client-runtime/state/reply-reading";
import { replyRewriteIsActive } from "@t3tools/client-runtime/state/reply-rewrite";
import {
  EnvironmentAuthorizationError,
  ReplyRewriteError,
  type ReplyRewriteTargetInput,
} from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Schema from "effect/Schema";
import { AsyncResult } from "effect/reactivity";
import { use, useState, type ReactNode } from "react";
import { t } from "~/i18n";
import { randomUUID } from "~/lib/utils";
import { replyRewriteEnvironment } from "~/state/replyRewrite";
import { serverEnvironment } from "~/state/server";
import { useAtomCommand } from "~/state/use-atom-command";
import { useV2ItemSupport } from "~/state/v2ItemSupport";
import { Button } from "../ui/button";
import { toastManager } from "../ui/toast";
import { TimelineRowCtx, type TimelineRow } from "./timelineRowContext";
import { useReplyCitationReading } from "./useReplyCitationReading";

type ReplyRow = Extract<TimelineRow, { kind: "message" | "assistant-meta" }>;
type ReadingChildren = (reading: ReplyReadingResult, controls?: ReactNode) => ReactNode;
const isAuthorizationError = Schema.is(EnvironmentAuthorizationError);
const isRewriteError = Schema.is(ReplyRewriteError);

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
    !sourceText.trim() ||
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
  const detailFailure = detail._tag === "Failure" ? Cause.squash(detail.cause) : null;
  const record = isAuthorizationError(detailFailure)
    ? null
    : AsyncResult.getOrElse(detail, () => null);
  const config = useAtomValue(serverEnvironment.configValueAtom(environmentId));
  const allowed = useAtomValue(replyRewriteEnvironment.request.permissionAtom(environmentId));
  const cancelAllowed = useAtomValue(replyRewriteEnvironment.cancel.permissionAtom(environmentId));
  const request = useAtomCommand(replyRewriteEnvironment.request);
  const cancel = useAtomCommand(replyRewriteEnvironment.cancel);
  const [busy, setBusy] = useState(false);
  const readingInput = {
    identity,
    sourceText,
    detail: { environmentId, sourceText, record },
    preference,
    failure: isRewriteError(detailFailure) ? detailFailure : null,
  };
  const available = resolveReplyReading({ ...readingInput, preference: null });
  const citationRequest =
    ctx.citationRequest?.citation.messageId === target.messageId ? ctx.citationRequest : null;
  const citationReading = useReplyCitationReading({
    request: citationRequest,
    available,
    preference,
    waiting: detail.waiting || detail._tag === "Initial",
    onSelect: (value) => registry.set(preferenceAtom, value),
    onUnavailable: () => {
      toastManager.add({
        type: "warning",
        title: t.chat.replyRewrite.versionUnavailable,
        description: t.chat.replyRewrite.savedQuoteAvailable,
      });
    },
  });
  const reading = resolveReplyReading({ ...readingInput, preference: citationReading.preference });

  const active = replyRewriteIsActive(record);
  const refresh = () => replyRewriteEnvironment.refresh(queryTarget, registry);
  const generate = async () => {
    if (!allowed || active || busy) return;
    setBusy(true);
    try {
      await request({ environmentId, input: { ...target, sourceText, requestId: randomUUID() } });
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
          onClick={() => citationReading.select("original")}
        >
          {t.chat.replyRewrite.original}
        </Button>
        <Button
          size="xs"
          variant="ghost"
          aria-pressed={reading.source === "rewrite"}
          disabled={!available.successAvailable}
          onClick={() => citationReading.select("rewrite")}
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
