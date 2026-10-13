/** Owns discussion lifecycle, ordered provider dispatch, checkpoint attribution and lossless subscriptions. */
import {
  ChatAttachmentId,
  CommandId,
  DiscussionEntryId,
  DiscussionError,
  DiscussionId,
  DiscussionPromptId,
  DiscussionSeatId,
  MessageId,
  ThreadId,
  DEFAULT_PROVIDER_INTERACTION_MODE,
  PROVIDER_SEND_TURN_MAX_INPUT_CHARS,
  type ChatAttachment,
  type CheckpointRef,
  type Discussion,
  type DiscussionCreateInput,
  type DiscussionEndInput,
  type DiscussionEntry,
  type DiscussionEntryDiffInput,
  type DiscussionEntryDiffResult,
  type DiscussionIdInput,
  type DiscussionInterjectInput,
  type DiscussionInterjectResult,
  type DiscussionListResult,
  type DiscussionMutationResult,
  type DiscussionProviderSupportResult,
  type DiscussionSubscriptionEvent,
  type OrchestrationV2Run,
  type RunId,
} from "@t3tools/contracts";
import * as KeyedLock from "@t3tools/shared/KeyedLock";
import { resolveProjectSettings } from "@t3tools/shared/projectSettings";
import * as Context from "effect/Context";
import * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as PubSub from "effect/PubSub";
import * as Schema from "effect/Schema";
import * as Scope from "effect/Scope";
import * as Semaphore from "effect/Semaphore";
import * as Stream from "effect/Stream";
import * as SqlClient from "effect/sql/SqlClient";
import { attachmentRelativePath, createDeterministicAttachmentId } from "../attachmentStore.ts";
import { parseTurnDiffFilesFromNumstat } from "../checkpointing/Diffs.ts";
import * as CheckpointStore from "../checkpointing/CheckpointStore.ts";
import * as ServerConfig from "../config.ts";
import * as EventSink from "../orchestration-v2/EventSink.ts";
import * as ProjectionStore from "../orchestration-v2/ProjectionStore.ts";
import * as ProviderAdapters from "../orchestration-v2/ProviderAdapterRegistry.ts";
import * as ThreadLaunch from "../orchestration-v2/ThreadLaunchService.ts";
import * as ThreadManagement from "../orchestration-v2/ThreadManagementService.ts";
import { checkpointRefForScopeOrdinal } from "../orchestration-v2/CheckpointService.ts";
import * as Projects from "../project/ProjectService.ts";
import * as Settings from "../serverSettings.ts";
import { forkParked } from "../serverActivation.ts";
import * as DiscussionStore from "./DiscussionStore.ts";
import * as CaptureRecovery from "./DiscussionCheckpointRecovery.ts";
import * as EffectOutbox from "../orchestration-v2/EffectOutbox.ts";
import {
  buildDiscussionBrief,
  discussionBriefPhaseMarker,
  type DiscussionBriefPhase,
} from "./discussionBrief.ts";

/** All transport and future agent entry points share this service; writes are serialized per discussion. */
export class DiscussionService extends Context.Service<
  DiscussionService,
  {
    /** Small all-project list, newest updates first. */
    readonly list: () => Effect.Effect<DiscussionListResult, DiscussionError>;
    /** Full list snapshots; slow clients retain the latest list. */
    readonly subscribeList: () => Stream.Stream<DiscussionListResult, DiscussionError>;
    /** Consistent initial snapshot then every increment; deletion emits once and closes the stream. */
    readonly subscribe: (
      input: DiscussionIdInput,
    ) => Stream.Stream<DiscussionSubscriptionEvent, DiscussionError>;
    /** Current instance capability support; reads metadata without opening provider sessions. */
    readonly providerSupport: () => Effect.Effect<DiscussionProviderSupportResult, DiscussionError>;
    /** Unified delta from the nearest earlier transcript checkpoint, or first run's baseline. */
    readonly getEntryDiff: (
      input: DiscussionEntryDiffInput,
    ) => Effect.Effect<DiscussionEntryDiffResult, DiscussionError>;
    /**
     * Resolves input project/topic/seats, rejects unsupported providers, freezes identities and dispatches seat one.
     * Failure/interruption before the discussion's first commit archives this attempt's committed threads.
     * Cleanup checks durable ownership: a committed discussion keeps its seats even if publication fails.
     * Cleanup failures are logged without replacing the original failure; an unreadable ownership record
     * leaves threads intact because they may belong to a committed discussion. A process crash can leave
     * orphan seat threads; this in-memory cleanup cannot recover them after a restart.
     */
    readonly create: (
      input: DiscussionCreateInput,
    ) => Effect.Effect<DiscussionMutationResult, DiscussionError>;
    /** Records material for later deliveries without steering or interrupting the current run. */
    readonly interject: (
      input: DiscussionInterjectInput,
    ) => Effect.Effect<DiscussionInterjectResult, DiscussionError>;
    /** Persists stopped state before interrupting with holdQueue; leaves the seat cursor in place. */
    readonly stop: (
      input: DiscussionIdInput,
    ) => Effect.Effect<DiscussionMutationResult, DiscussionError>;
    /** Same seat retries with fresh material; a stopped run's pending checkpoint delays dispatch. */
    readonly continue: (
      input: DiscussionIdInput,
    ) => Effect.Effect<DiscussionMutationResult, DiscussionError>;
    /** Freezes summarizer/template and schedules a complete final round, followed by the summary. */
    readonly end: (
      input: DiscussionEndInput,
    ) => Effect.Effect<DiscussionMutationResult, DiscussionError>;
    /** Archives every seat thread then deletes the discussion; any active run prevents deletion. */
    readonly delete: (
      input: DiscussionIdInput,
    ) => Effect.Effect<DiscussionIdInput, DiscussionError>;
    /** Startup recovery pauses live discussions and repairs unrecorded terminal runs; starts the reactor once. */
    readonly start: () => Effect.Effect<void, DiscussionError>;
  }
>()("t3/discussions/DiscussionService") {}

/** Maps infrastructure failures once, preserving causes and already typed discussion errors. */
const domain = <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, DiscussionError, R> =>
  effect.pipe(
    Effect.mapError((cause) =>
      Schema.is(DiscussionError)(cause)
        ? cause
        : new DiscussionError({
            reason: "orchestration_error",
            message: "Discussion operation failed.",
            cause,
          }),
    ),
  );

/** Terminal cancelled runs have the same transcript semantics as an interrupted statement. */
function terminal(run: OrchestrationV2Run): boolean {
  return (
    run.status === "completed" ||
    run.status === "interrupted" ||
    run.status === "cancelled" ||
    run.status === "failed"
  );
}

/** Acquires shared application services; no domain-owned runtime or database connection is created. */
const make = Effect.gen(function* () {
  const store = yield* DiscussionStore.DiscussionStore;
  const threads = yield* ThreadManagement.ThreadManagementService;
  const launch = yield* ThreadLaunch.ThreadLaunchService;
  const projections = yield* ProjectionStore.ProjectionStoreV2;
  const events = yield* EventSink.EventSinkV2;
  const adapters = yield* ProviderAdapters.ProviderAdapterRegistryV2;
  const projects = yield* Projects.ProjectService;
  const settings = yield* Settings.ServerSettingsService;
  const checkpoints = yield* CheckpointStore.CheckpointStore;
  const crypto = yield* Crypto.Crypto;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const config = yield* ServerConfig.ServerConfig;
  const sql = yield* SqlClient.SqlClient;
  const outbox = yield* EffectOutbox.EffectOutboxV2;
  const captureRecovery = yield* CaptureRecovery.DiscussionCheckpointRecovery;
  const scope = yield* Scope.Scope;
  const locks = yield* KeyedLock.make<DiscussionId>();
  const publication = yield* Semaphore.make(1);
  const changes = yield* PubSub.unbounded<{
    readonly discussionId: DiscussionId;
    readonly event: DiscussionSubscriptionEvent;
  }>();
  const lists = yield* PubSub.sliding<DiscussionListResult>(1);
  // The executor reports exhaustion before outbox settlement. Keep the tracked run's notice
  // under its discussion lock even while paused; dispatch/delete release this application-owned latch.
  const exhaustedCaptureRunIds = new Map<DiscussionId, RunId>();
  yield* Effect.addFinalizer(() => Effect.all([PubSub.shutdown(changes), PubSub.shutdown(lists)]));
  let started = false;

  const now = DateTime.now.pipe(Effect.map(DateTime.formatIso));
  const uuid = domain(crypto.randomUUIDv4);
  const invalid = (message: string) => new DiscussionError({ reason: "invalid_state", message });

  /** Reads required state; missing identity never silently creates a new discussion. */
  const requireDiscussion = (id: DiscussionId) =>
    store
      .getDiscussion(id)
      .pipe(
        Effect.flatMap((value) =>
          value
            ? Effect.succeed(value)
            : Effect.fail(
                new DiscussionError({ reason: "not_found", message: "Discussion not found." }),
              ),
        ),
      );

  const list: DiscussionService["Service"]["list"] = () =>
    store.listDiscussions().pipe(
      Effect.map((discussions) => ({
        discussions: discussions.map((item) => ({
          id: item.id,
          projectId: item.projectId,
          title: item.title,
          status: item.status,
          seats: item.seats.map(({ id, personaName, avatar, modelSelection }) => ({
            id,
            personaName,
            avatar,
            modelSelection,
          })),
          cursor: { seatIndex: item.cursor.seatIndex, round: item.cursor.round },
          pause: item.pause ? { reason: item.pause.reason } : null,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
          endedAt: item.endedAt,
        })),
      })),
    );

  /**
   * Commits state and increments together, then publishes under the same snapshot permit.
   * Provider dispatch runs outside SQL transactions to avoid deadlocking the orchestrator's shared SQL client.
   * Publication is uninterruptible after commit; subscribers cannot read a snapshot between a write and its event.
   */
  const mutate = <A>(
    id: DiscussionId,
    operation: Effect.Effect<
      { readonly value: A; readonly increments: ReadonlyArray<DiscussionSubscriptionEvent> },
      DiscussionError
    >,
  ) =>
    publication.withPermit(
      Effect.uninterruptibleMask((restore) =>
        Effect.gen(function* () {
          const result = yield* domain(sql.withTransaction(restore(operation)));
          for (const event of result.increments)
            yield* PubSub.publish(changes, { discussionId: id, event });
          yield* PubSub.publish(lists, yield* list());
          return result.value;
        }),
      ),
    );

  /** Persists one lifecycle snapshot and makes it visible to both subscription kinds. */
  const save = (discussion: Discussion) =>
    mutate(
      discussion.id,
      Effect.gen(function* () {
        const value = { ...discussion, updatedAt: yield* now };
        yield* store.updateDiscussion(value);
        return { value, increments: [{ type: "discussion.updated", discussion: value } as const] };
      }),
    );

  /** Resolves a project through the existing service; deleted/missing projects are rejected before launch. */
  const requireProject = (discussion: Pick<Discussion, "projectId">) =>
    domain(projects.getById(discussion.projectId)).pipe(
      Effect.flatMap((project) =>
        Option.isSome(project)
          ? Effect.succeed(project.value)
          : Effect.fail(
              new DiscussionError({
                reason: "not_found",
                message: "Discussion project not found.",
              }),
            ),
      ),
    );

  /**
   * Derives the checkpoint pair each time from transcript order, skipping failed or missing snapshots.
   * The initial ref uses the first seat's first run baseline, never a later seat's baseline.
   */
  const checkpointPair = (discussion: Discussion, entry: DiscussionEntry) =>
    domain(
      Effect.gen(function* () {
        if (!entry.checkpointRef) return null;
        const previous = (yield* store.listEntries(discussion.id, 0, entry.seq - 1)).findLast(
          (item) =>
            (item.kind === "statement" || item.kind === "summary") && item.checkpointRef !== null,
        );
        const project = yield* requireProject(discussion);
        if (previous?.checkpointRef)
          return {
            cwd: project.workspaceRoot,
            from: previous.checkpointRef,
            to: entry.checkpointRef,
          };
        const firstThread = discussion.seats[0]!.threadId;
        const context = yield* projections.getThreadRecords(firstThread, [
          "runs",
          "nodes",
          "checkpointScopes",
        ]);
        const firstRun = context.runs.toSorted((left, right) => left.ordinal - right.ordinal)[0];
        const node = context.nodes.find((item) => item.id === firstRun?.rootNodeId);
        if (!firstRun || !node?.checkpointScopeId) return null;
        const from = yield* checkpointRefForScopeOrdinal({
          scopeId: node.checkpointScopeId,
          ordinalWithinScope: Math.max(0, firstRun.ordinal - 1),
        }).pipe(Effect.provideService(Crypto.Crypto, crypto));
        if (
          !(yield* checkpoints.hasCheckpointRef({
            cwd: project.workspaceRoot,
            checkpointRef: from,
          }))
        )
          return null;
        return { cwd: project.workspaceRoot, from, to: entry.checkpointRef };
      }),
    );

  /** Git captures and diffs use their existing timeout/retry policy; missing refs produce unknown statistics. */
  const filesFor = (discussion: Discussion, entry: DiscussionEntry) =>
    Effect.gen(function* () {
      const pair = yield* checkpointPair(discussion, entry);
      if (!pair) return null;
      const diff = yield* domain(
        checkpoints.diffCheckpoints({
          cwd: pair.cwd,
          fromCheckpointRef: pair.from,
          toCheckpointRef: pair.to,
          ignoreWhitespace: false,
          format: "numstat",
        }),
      );
      return parseTurnDiffFilesFromNumstat(diff).map(({ path, additions, deletions }) => ({
        path,
        additions,
        deletions,
      }));
    }).pipe(
      Effect.catch((cause) =>
        Effect.logWarning("discussion checkpoint diff unavailable", {
          discussionId: discussion.id,
          entryId: entry.id,
          cause,
        }).pipe(Effect.as(null)),
      ),
    );

  /** Reads the tracked run's durable capture outcome for this locked discussion; missing/error refs remain unknown. */
  const captureState = (discussion: Discussion, run: OrchestrationV2Run) =>
    domain(
      Effect.gen(function* () {
        const captureEffect = yield* outbox.get(`effect:checkpoint.capture:${run.id}`);
        // Read outbox BEFORE the run/checkpoints: succeeded means capture publication already
        // committed. An older interrupted event must not combine its null checkpointId with a
        // newer settled outbox row and release dispatch before recording the durable snapshot.
        const context = yield* projections.getThreadRecords(run.threadId, ["runs", "checkpoints"]);
        const currentRun = context.runs.find((item) => item.id === run.id);
        if (!currentRun) return yield* invalid("Discussion run not found.");
        const checkpoint = context.checkpoints.find((item) => item.id === currentRun.checkpointId);
        // run.updated and its capture effect commit in one transaction before event publication.
        // The pre-provider interrupt branch enqueues no capture, even if a late provider_turn.updated
        // later appears. Only the durable capture row proves a result is still due. Settled failed,
        // cancelled or succeeded rows cannot produce another result; missing/error checkpoints also unblock.
        const pending =
          (currentRun.status === "interrupted" || currentRun.status === "cancelled") &&
          currentRun.checkpointId === null &&
          exhaustedCaptureRunIds.get(discussion.id) !== run.id &&
          Option.isSome(captureEffect) &&
          (captureEffect.value.status === "pending" || captureEffect.value.status === "running");
        return { ref: checkpoint?.status === "ready" ? checkpoint.ref : null, pending };
      }),
    );

  /**
   * Uses cursor.phase for the current or next dispatch, including failures before prepared persistence.
   * Only legacy cursors without phase infer from closing state, the durable message and transcript boundary.
   * @param discussion Snapshot whose cursor identifies the current or next seat assignment.
   * @param entries Ordered transcript, consulted only by the legacy fallback.
   * @returns Assignment phase; legacy projection read failures propagate to the caller.
   */
  const currentPhase = (discussion: Discussion, entries: ReadonlyArray<DiscussionEntry>) =>
    Effect.gen(function* () {
      if (discussion.cursor.phase !== undefined) return discussion.cursor.phase;
      // Legacy snapshots alone need message/End inference; cursor.phase survives preparation failures.
      if (!discussion.closing) return "regular" as const;
      if (discussion.closing.phase === "summarizing") return "summarizing" as const;
      const context = yield* projections.getThreadRecords(
        discussion.seats[discussion.cursor.seatIndex]!.threadId,
        ["runs", "messages"],
      );
      const run = context.runs.find((item) => item.id === discussion.cursor.runId);
      const message = context.messages.find((item) => item.id === run?.userMessageId);
      const endMarker = entries.findLast(
        (item) => item.kind === "system" && item.text === "讨论到此",
      );
      // Only legacy inference reads the End marker seat owner. End assigns a final statement when paused
      // or when an unfinished ordinary run became terminal before reactor bookkeeping. Its owner survives
      // while capture is pending; active or successfully completed ordinary runs have no seat owner.
      if (
        endMarker?.seatId === discussion.seats[discussion.cursor.seatIndex]!.id &&
        message?.text.endsWith(discussionBriefPhaseMarker("regular"))
      )
        return "final_round" as const;
      for (const phase of ["regular", "final_round"] as const) {
        if (message?.text.endsWith(discussionBriefPhaseMarker(phase))) return phase;
      }
      return endMarker && discussion.cursor.dispatchedEntrySeq >= endMarker.seq
        ? ("final_round" as const)
        : ("regular" as const);
    });

  /**
   * Writes a deterministic Markdown attachment for complete oversized material. No retries are scheduled:
   * dispatch retries reuse the same message/attachment identity and bytes. File writes do not publish messages.
   */
  const prepareMessage = (
    threadId: ThreadId,
    messageId: MessageId,
    brief: string,
    phase: DiscussionBriefPhase,
  ) =>
    domain(
      Effect.gen(function* () {
        if (brief.length <= PROVIDER_SEND_TURN_MAX_INPUT_CHARS)
          return {
            text: brief,
            attachments: [] as ReadonlyArray<ChatAttachment>,
            sentAsFile: false,
          };
        const rawId = createDeterministicAttachmentId(threadId, `${messageId}:0`);
        if (!rawId) return yield* invalid("Could not allocate discussion attachment identity.");
        const bytes = new TextEncoder().encode(brief);
        const attachment: ChatAttachment = {
          type: "file",
          id: ChatAttachmentId.make(rawId),
          name: "discussion-material.md",
          mimeType: "text/markdown",
          sizeBytes: bytes.byteLength,
        };
        const relative = attachmentRelativePath(attachment);
        if (!relative) return yield* invalid("Discussion attachment path is invalid.");
        yield* fs.makeDirectory(config.attachmentsDir, { recursive: true });
        yield* fs.writeFile(path.join(config.attachmentsDir, relative), bytes);
        const text = `本次讨论材料共有 ${brief.length} 个字符，已作为附件 discussion-material.md 发送。开口前必须完整读完附件的全部内容，再按附件最后的要求发言。\n\n${discussionBriefPhaseMarker(phase)}`;
        return { text, attachments: [attachment], sentAsFile: true };
      }),
    );

  /** Commits run binding and delivery together; restart reuses this acknowledgement after locating the exact message. */
  const acknowledgeDispatch = (
    prepared: Discussion,
    runId: RunId,
    entries: ReadonlyArray<DiscussionEntry>,
  ) =>
    mutate(
      prepared.id,
      Effect.gen(function* () {
        const seat = prepared.seats[prepared.cursor.seatIndex]!;
        const value: Discussion = {
          ...prepared,
          cursor: { ...prepared.cursor, runId },
          updatedAt: yield* now,
        };
        yield* store.updateDiscussion(value);
        yield* store.setSeatDelivery(prepared.id, seat.id, prepared.cursor.dispatchedEntrySeq);
        const increments: DiscussionSubscriptionEvent[] = [];
        for (const entry of entries) {
          if (entry.kind === "user" && entry.readBySeatId === undefined)
            increments.push({
              type: "entry.updated",
              entry: yield* store.updateEntry(entry.id, { readBySeatId: seat.id }),
            });
        }
        increments.push({ type: "discussion.updated", discussion: value });
        return { value, increments };
      }),
    );

  /**
   * Persists dispatchNo before sending; one dispatch's command and message identities are stable.
   * sendToThread returns the durable message's run (including a queued run), so no latest-run guess
   * can accidentally bind a user message or an automatic continuation. No automatic send retries occur.
   * U3: ordinary queue_after_active starts immediately when no blocking run exists (Orchestrator
   * dispatchMessage); usage-limit guards hold the OLD queue only. This manual retry therefore uses
   * sendToThread rather than the autoResume/reset-gated UsageLimitRecoveryWorker command.
   */
  const dispatchSeat = (discussion: Discussion, phase: DiscussionBriefPhase) =>
    domain(
      Effect.gen(function* () {
        const seat = discussion.seats[discussion.cursor.seatIndex]!;
        const project = yield* requireProject(discussion);
        const delivered = yield* store.getSeatDelivery(discussion.id, seat.id);
        const allEntries = yield* store.listEntries(discussion.id);
        const entries =
          phase === "summarizing"
            ? allEntries
            : allEntries.filter((entry) => entry.seq > (delivered ?? 0));
        const previousOwn = allEntries.findLast(
          (entry) => entry.seatId === seat.id && entry.kind === "statement",
        );
        const brief = buildDiscussionBrief({
          discussion,
          seatIndex: discussion.cursor.seatIndex,
          projectTitle: project.title,
          entries,
          firstDelivery: delivered === null,
          phase,
          interrupted: previousOwn?.status === "interrupted",
        });
        const dispatchNo = discussion.cursor.dispatchNo + 1;
        const messageId = MessageId.make(`discussion:${discussion.id}:dispatch:${dispatchNo}`);
        const message = yield* prepareMessage(seat.threadId, messageId, brief, phase);
        const throughSeq = allEntries.at(-1)?.seq ?? 0;
        const prepared = yield* save({
          ...discussion,
          cursor: {
            ...discussion.cursor,
            phase,
            dispatchNo,
            runId: null,
            dispatchedEntrySeq: throughSeq,
            briefChars: brief.length,
            briefSentAsFile: message.sentAsFile,
          },
        });
        const sent = yield* domain(
          threads.sendToThread({
            projectId: discussion.projectId,
            commandId: CommandId.make(`discussion:${discussion.id}:dispatch:${dispatchNo}`),
            threadId: seat.threadId,
            messageId,
            text: message.text,
            attachments: message.attachments,
            modelSelection: seat.modelSelection,
            mode: "queue",
            createdBy: discussion.createdBy,
            creationSource: "server",
          }),
        );
        // Dispatch holds the discussion lock through cursor binding. onRun takes that same lock
        // before checking runId, so an early terminal event waits instead of being discarded.
        const value = yield* acknowledgeDispatch(prepared, sent.run.id, entries);
        exhaustedCaptureRunIds.delete(discussion.id);
        return value;
      }),
    ).pipe(
      Effect.catch((cause) =>
        Effect.gen(function* () {
          const current = yield* requireDiscussion(discussion.id);
          yield* save({
            ...current,
            status: "paused",
            pause: {
              reason: "seat_failed",
              seatId: current.seats[current.cursor.seatIndex]!.id,
              failureKind: "error",
              message: cause.message,
            },
          });
          return yield* cause;
        }),
      ),
    );

  /**
   * Records assistant messages in durable ordinal order and freezes the run's dispatched assignment.
   * @param discussion Current snapshot; its next assignment must not reclassify an older ordinary run.
   * @param run Tracked terminal run whose userMessageId identifies the original dispatched material.
   * @returns Entry plus capture-pending and first-insertion flags; enrichment keeps original attribution
   * and the dispatch-time transcript position, even after a later cursor assignment.
   */
  const recordRun = (discussion: Discussion, run: OrchestrationV2Run) =>
    domain(
      Effect.gen(function* () {
        const seat = discussion.seats[discussion.cursor.seatIndex]!;
        const existing = yield* store.getEntryByRunId(run.id);
        const capture = yield* captureState(discussion, run);
        if (existing) {
          if (existing.checkpointRef === null && capture.ref !== null) {
            const updated = { ...existing, checkpointRef: capture.ref };
            const files = yield* filesFor(discussion, updated);
            yield* mutate(
              discussion.id,
              Effect.gen(function* () {
                const entry = yield* store.updateEntry(existing.id, {
                  checkpointRef: capture.ref,
                  files,
                });
                return { value: entry, increments: [{ type: "entry.updated", entry } as const] };
              }),
            );
          }
          return { entry: existing, pending: capture.pending, fresh: false };
        }
        const context = yield* projections.getThreadRecords(seat.threadId, [
          "messages",
          "turnItems",
        ]);
        const messageOrdinals = new Map(
          context.turnItems
            .filter((item) => item.type === "assistant_message")
            .map((item) => [item.messageId, item.ordinal]),
        );
        const text = context.messages
          .filter((message) => message.runId === run.id && message.role === "assistant")
          .toSorted(
            (left, right) =>
              (messageOrdinals.get(left.id) ?? DateTime.toEpochMillis(left.createdAt)) -
              (messageOrdinals.get(right.id) ?? DateTime.toEpochMillis(right.createdAt)),
          )
          .map((message) => message.text)
          .join("\n\n");
        const transcript = yield* store.listEntries(discussion.id);
        const kind =
          (yield* currentPhase(discussion, transcript)) === "summarizing" ? "summary" : "statement";
        const dispatchedMessage = context.messages.find(
          (message) => message.id === run.userMessageId,
        );
        const value: DiscussionStore.DiscussionEntryAppend = {
          id: DiscussionEntryId.make(`discussion:${discussion.id}:run:${run.id}`),
          discussionId: discussion.id,
          kind,
          // End while paused changes the NEXT assignment, but this run retains its original brief phase.
          ...(kind === "statement" &&
          dispatchedMessage?.text.endsWith(discussionBriefPhaseMarker("final_round"))
            ? { finalStatement: true as const }
            : {}),
          seatId: seat.id,
          threadId: seat.threadId,
          runId: run.id,
          round: discussion.cursor.round,
          dispatchedEntrySeq: discussion.cursor.dispatchedEntrySeq,
          text,
          files: null,
          status:
            run.status === "completed"
              ? "completed"
              : run.status === "failed"
                ? "failed"
                : "interrupted",
          checkpointRef: capture.ref,
          createdAt: run.completedAt ? DateTime.formatIso(run.completedAt) : yield* now,
        };
        const files = yield* filesFor(discussion, {
          ...value,
          seq: (transcript.at(-1)?.seq ?? 0) + 1,
        });
        const entry = yield* mutate(
          discussion.id,
          Effect.gen(function* () {
            const entry = yield* store.appendEntry({ ...value, files });
            return { value: entry, increments: [{ type: "entry.appended", entry } as const] };
          }),
        );
        return { entry, pending: capture.pending, fresh: true };
      }),
    );

  /** Advances only completed statements; closing uses the frozen final seat order and marks summaries ended. */
  const advance = (discussion: Discussion, entry: DiscussionEntry) =>
    Effect.gen(function* () {
      if (entry.kind === "summary")
        return yield* save({ ...discussion, status: "ended", pause: null, endedAt: yield* now });
      let seatIndex = (discussion.cursor.seatIndex + 1) % discussion.seats.length;
      let phase: DiscussionBriefPhase = "regular";
      let closing = discussion.closing;
      if (closing) {
        if (
          (yield* currentPhase(discussion, yield* store.listEntries(discussion.id))) ===
          "final_round"
        )
          closing = { ...closing, remainingFinalSeatIds: closing.remainingFinalSeatIds.slice(1) };
        const next = closing.remainingFinalSeatIds[0];
        if (next !== undefined) {
          seatIndex = discussion.seats.findIndex((seat) => seat.id === next);
          phase = "final_round";
        } else {
          closing = { ...closing, phase: "summarizing" };
          seatIndex = discussion.seats.findIndex((seat) => seat.id === closing!.summarizerSeatId);
          phase = "summarizing";
        }
      }
      const next = yield* save({
        ...discussion,
        closing,
        cursor: {
          ...discussion.cursor,
          phase,
          seatIndex,
          round: discussion.cursor.round + (seatIndex === 0 && phase !== "summarizing" ? 1 : 0),
          runId: null,
        },
      });
      return yield* dispatchSeat(next, phase);
    });

  /** Processes only the tracked run under its discussion lock; repeated terminal events never dispatch twice. */
  const onRun = (
    discussionId: DiscussionId,
    run: OrchestrationV2Run,
    recovering = false,
    captureExhausted = false,
  ) =>
    locks.withLock(
      discussionId,
      domain(
        Effect.gen(function* () {
          const discussion = yield* store.getDiscussion(discussionId);
          if (!discussion || discussion.cursor.runId !== run.id || !terminal(run)) return;
          if (captureExhausted) exhaustedCaptureRunIds.set(discussionId, run.id);
          const result = yield* recordRun(discussion, run);
          if (recovering || discussion.status === "ended") return;
          if (run.status === "failed" && result.fresh) {
            const context = yield* projections.getThreadRecords(run.threadId, ["turnItems"]);
            const failure = context.turnItems.findLast(
              (item) =>
                item.runId === run.id && item.type === "error" && item.failure !== undefined,
            );
            const detail = failure?.type === "error" ? failure.failure : undefined;
            yield* save({
              ...discussion,
              status: "paused",
              pause: {
                reason: "seat_failed",
                seatId: discussion.seats[discussion.cursor.seatIndex]!.id,
                failureKind: detail?.class === "usage_limit" ? "usage_limit" : "error",
                message: detail?.message ?? "",
                ...(detail?.resetAt ? { resetAt: detail.resetAt } : {}),
              },
            });
            return;
          }
          // A paused discussion retains exhaustion above: Continue can beat the worker's failed
          // settlement, and that settlement emits no further run event. captureState uses the
          // retained notice to unblock with files/checkpointRef unknown instead of waiting forever.
          if (discussion.status === "paused" || result.pending) return;
          if (run.status === "completed") {
            yield* advance(discussion, result.entry);
          } else if (run.status === "interrupted" || run.status === "cancelled") {
            yield* dispatchSeat(
              discussion,
              yield* currentPhase(discussion, yield* store.listEntries(discussion.id)),
            );
          }
        }),
      ),
    );

  /** Loads the tracked run; no guessing from the latest seat run, which could be a user or auto continuation. */
  const trackedRun = (discussion: Discussion) =>
    domain(
      Effect.gen(function* () {
        if (!discussion.cursor.runId) return null;
        const context = yield* projections.getThreadRecords(
          discussion.seats[discussion.cursor.seatIndex]!.threadId,
          ["runs"],
        );
        return context.runs.find((run) => run.id === discussion.cursor.runId) ?? null;
      }),
    );

  return DiscussionService.of({
    list,
    subscribeList: () =>
      Stream.unwrap(
        publication.withPermit(
          Effect.gen(function* () {
            const subscription = yield* PubSub.subscribe(lists);
            const initial = yield* list();
            return Stream.concat(Stream.succeed(initial), Stream.fromSubscription(subscription));
          }),
        ),
      ),
    subscribe: ({ discussionId }) =>
      Stream.unwrap(
        publication.withPermit(
          Effect.gen(function* () {
            // Subscription and snapshot share the write/publication permit: changes before acquisition
            // occur only in the snapshot; changes after it occur only in the queue, with no gap or overlap.
            const subscription = yield* PubSub.subscribe(changes);
            const discussion = yield* requireDiscussion(discussionId);
            const entries = yield* store.listEntries(discussionId);
            const initial: DiscussionSubscriptionEvent = { type: "snapshot", discussion, entries };
            return Stream.concat(
              Stream.succeed(initial),
              Stream.fromSubscription(subscription).pipe(
                Stream.filter((change) => change.discussionId === discussionId),
                Stream.map((change) => change.event),
                Stream.takeUntil((event) => event.type === "discussion.deleted"),
              ),
            );
          }),
        ),
      ),
    providerSupport: () =>
      domain(
        Effect.gen(function* () {
          const instanceIds = yield* adapters.list();
          const instances = yield* Effect.forEach(instanceIds, (instanceId) =>
            domain(
              Effect.gen(function* () {
                const capabilities = adapters.getMetadata
                  ? (yield* adapters.getMetadata(instanceId)).capabilities
                  : yield* (yield* adapters.get(instanceId)).getCapabilities();
                return { instanceId, supported: capabilities.context.acceptsDeveloperContext };
              }),
            ),
          );
          return { instances };
        }),
      ),
    getEntryDiff: (input) =>
      domain(
        Effect.gen(function* () {
          const discussion = yield* requireDiscussion(input.discussionId);
          const entry = (yield* store.listEntries(discussion.id)).find(
            (item) => item.id === input.entryId,
          );
          if (!entry)
            return yield* new DiscussionError({
              reason: "not_found",
              message: "Discussion entry not found.",
            });
          const pair = yield* checkpointPair(discussion, entry);
          if (!pair || entry.files === null || entry.files.length === 0)
            return yield* invalid("Discussion entry has no available file changes.");
          const diff = yield* checkpoints.diffCheckpoints({
            cwd: pair.cwd,
            fromCheckpointRef: pair.from,
            toCheckpointRef: pair.to,
            ignoreWhitespace: false,
            format: "patch",
          });
          return { ...input, diff };
        }),
      ),
    create: (input) =>
      domain(
        Effect.gen(function* () {
          const project = yield* requireProject(input);
          const parsedSeats = yield* Effect.forEach(input.seats, (seat) =>
            Effect.gen(function* () {
              const prompt = yield* store.getPrompt(seat.personaPromptId);
              if (!prompt)
                return yield* new DiscussionError({
                  reason: "not_found",
                  message: "Persona prompt not found.",
                });
              if (prompt.kind !== "persona" || prompt.avatar === null)
                return yield* invalid("Seat must reference a persona prompt.");
              const capabilities = adapters.getMetadata
                ? (yield* domain(adapters.getMetadata(seat.modelSelection.instanceId))).capabilities
                : yield* domain(
                    (yield* domain(adapters.get(seat.modelSelection.instanceId))).getCapabilities(),
                  );
              if (!capabilities.context.acceptsDeveloperContext)
                return yield* new DiscussionError({
                  reason: "provider_unsupported",
                  message: "Seat provider does not accept developer context.",
                });
              return { prompt, modelSelection: seat.modelSelection };
            }),
          );
          if (parsedSeats.length === 0)
            return yield* invalid("Discussion requires at least one seat.");
          const id = DiscussionId.make(yield* uuid);
          const title = input.topic
            .split(/\r?\n/)
            .find((line) => line.trim().length > 0)
            ?.trim();
          if (!title) return yield* invalid("Discussion topic must contain text.");
          const runtimeMode = resolveProjectSettings(
            yield* domain(settings.getSettings),
            input.projectId,
            project,
          ).settings.defaultRuntimeMode;
          const launchingSeats: Array<{ id: DiscussionSeatId; threadId: ThreadId }> = [];
          return yield* Effect.gen(function* () {
            const seats = yield* Effect.forEach(parsedSeats, ({ prompt, modelSelection }, index) =>
              Effect.gen(function* () {
                const seatId = DiscussionSeatId.make(`discussion:${id}:seat:${index + 1}`);
                const threadId = ThreadId.make(`discussion:${id}:seat:${index + 1}`);
                // Launch can commit a thread before failing or observing interruption. Register its
                // identity first, then cleanup checks the actual shell rather than assuming success.
                launchingSeats.push({ id: seatId, threadId });
                yield* domain(
                  launch.launch({
                    commandId: CommandId.make(`discussion:${id}:create:${index + 1}`),
                    projectId: input.projectId,
                    threadId,
                    title: `${prompt.name} · ${title}`,
                    discussion: { discussionId: id, seatId },
                    modelSelection,
                    runtimeMode,
                    interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
                    workspaceStrategy: { type: "root" },
                    createdBy: "user",
                    creationSource: "server",
                  }),
                );
                return {
                  id: seatId,
                  personaName: prompt.name,
                  personaPrompt: prompt.prompt,
                  avatar: prompt.avatar!,
                  modelSelection,
                  threadId,
                };
              }),
            );
            const timestamp = yield* now;
            const discussion: Discussion = {
              id,
              projectId: input.projectId,
              title,
              topic: input.topic,
              seats,
              status: "speaking",
              cursor: {
                seatIndex: 0,
                phase: "regular",
                round: 1,
                dispatchNo: 0,
                runId: null,
                dispatchedEntrySeq: 0,
                briefChars: 0,
                briefSentAsFile: false,
              },
              pause: null,
              closing: null,
              createdBy: "user",
              creationSource: "server",
              createdAt: timestamp,
              updatedAt: timestamp,
              endedAt: null,
            };
            return yield* locks.withLock(
              id,
              Effect.gen(function* () {
                yield* mutate(
                  id,
                  store.createDiscussion(discussion).pipe(
                    Effect.as({
                      value: discussion,
                      increments: [{ type: "discussion.updated", discussion } as const],
                    }),
                  ),
                );
                return { discussion: yield* dispatchSeat(discussion, "regular") };
              }),
            );
          }).pipe(
            // Protect launch AND initial persistence. A transaction can commit before publication
            // fails or interruption is observed, so durable ownership decides whether to archive.
            // onExit runs uninterruptibly; each archive failure is isolated to preserve the original exit.
            Effect.onExit((exit) =>
              Exit.isFailure(exit)
                ? Effect.gen(function* () {
                    const ownership = yield* Effect.exit(store.getDiscussion(id));
                    if (Exit.isFailure(ownership)) {
                      // An unreadable record does not prove absence. Avoid archiving valid seats
                      // while preserving the creation failure and logging the cleanup limitation.
                      yield* Effect.logWarning("discussion creation ownership check failed", {
                        discussionId: id,
                        cause: ownership.cause,
                      });
                      return;
                    }
                    if (ownership.value !== null) return;
                    yield* Effect.forEach(
                      launchingSeats,
                      (seat) =>
                        Effect.gen(function* () {
                          const shell = yield* threads.getThreadShell(seat.threadId);
                          if (shell?.archivedAt === null)
                            yield* threads.dispatch({
                              type: "thread.archive",
                              commandId: CommandId.make(`discussion:${id}:archive:${seat.id}`),
                              threadId: seat.threadId,
                            });
                        }).pipe(
                          Effect.catchCause((cause) =>
                            Effect.logWarning("discussion seat creation cleanup failed", {
                              discussionId: id,
                              seatId: seat.id,
                              threadId: seat.threadId,
                              cause,
                            }),
                          ),
                        ),
                      { discard: true },
                    );
                  })
                : Effect.void,
            ),
          );
        }),
      ),
    interject: ({ discussionId, text }) =>
      locks.withLock(
        discussionId,
        Effect.gen(function* () {
          const discussion = yield* requireDiscussion(discussionId);
          if (
            (discussion.status !== "speaking" && discussion.status !== "paused") ||
            discussion.closing ||
            !text.trim()
          )
            return yield* invalid("Discussion cannot accept an interjection now.");
          return yield* mutate(
            discussionId,
            Effect.gen(function* () {
              const entry = yield* store.appendEntry({
                id: DiscussionEntryId.make(yield* uuid),
                discussionId,
                kind: "user",
                text,
                files: null,
                status: "completed",
                checkpointRef: null,
                createdAt: yield* now,
              });
              const updated = { ...discussion, updatedAt: yield* now };
              yield* store.updateDiscussion(updated);
              return {
                value: { entry },
                increments: [
                  { type: "entry.appended", entry } as const,
                  { type: "discussion.updated", discussion: updated } as const,
                ],
              };
            }),
          );
        }),
      ),
    stop: ({ discussionId }) =>
      locks.withLock(
        discussionId,
        domain(
          Effect.gen(function* () {
            const discussion = yield* requireDiscussion(discussionId);
            if (discussion.status !== "speaking" && discussion.status !== "closing")
              return yield* invalid("Discussion is not speaking.");
            const value = yield* save({
              ...discussion,
              status: "paused",
              pause: {
                reason: "stopped",
                seatId: discussion.seats[discussion.cursor.seatIndex]!.id,
              },
            });
            if (discussion.cursor.runId)
              yield* threads.dispatch({
                type: "run.interrupt",
                commandId: CommandId.make(
                  `discussion:${discussionId}:stop:${discussion.cursor.dispatchNo}`,
                ),
                threadId: discussion.seats[discussion.cursor.seatIndex]!.threadId,
                runId: discussion.cursor.runId,
                holdQueue: true,
              });
            return { discussion: value };
          }),
        ),
      ),
    continue: ({ discussionId }) =>
      locks.withLock(
        discussionId,
        domain(
          Effect.gen(function* () {
            const discussion = yield* requireDiscussion(discussionId);
            if (discussion.status !== "paused") return yield* invalid("Discussion is not paused.");
            const run = yield* trackedRun(discussion);
            if (run && terminal(run)) yield* recordRun(discussion, run);
            const value = yield* save({
              ...discussion,
              status: discussion.closing ? "closing" : "speaking",
              pause: null,
            });
            if (run && (!terminal(run) || (yield* captureState(discussion, run)).pending))
              return { discussion: value };
            return {
              discussion: yield* dispatchSeat(
                value,
                yield* currentPhase(discussion, yield* store.listEntries(discussion.id)),
              ),
            };
          }),
        ),
      ),
    end: (input) =>
      locks.withLock(
        input.discussionId,
        domain(
          Effect.gen(function* () {
            const discussion = yield* requireDiscussion(input.discussionId);
            if (
              (discussion.status !== "speaking" && discussion.status !== "paused") ||
              discussion.closing
            )
              return yield* invalid("Discussion cannot end now.");
            if (!discussion.seats.some((seat) => seat.id === input.summarizerSeatId))
              return yield* invalid("Summarizer must be a discussion seat.");
            const prompt = yield* store.getPrompt(
              input.summaryPromptId ?? DiscussionPromptId.make("builtin:summary:default"),
            );
            if (!prompt)
              return yield* new DiscussionError({
                reason: "not_found",
                message: "Summary prompt not found.",
              });
            if (prompt.kind !== "summary")
              return yield* invalid("Summary prompt must have summary kind.");
            const run = yield* trackedRun(discussion);
            const active = discussion.status !== "paused" && run !== null && !terminal(run);
            // A completed ordinary run can beat reactor bookkeeping. End records it here and
            // starts finals at its successor, just as advance would; a paused seat still starts itself.
            const ordinaryCompleted = discussion.status !== "paused" && run?.status === "completed";
            const firstIndex =
              active || ordinaryCompleted
                ? (discussion.cursor.seatIndex + 1) % discussion.seats.length
                : discussion.cursor.seatIndex;
            const remainingFinalSeatIds = discussion.seats.map(
              (_, offset) => discussion.seats[(firstIndex + offset) % discussion.seats.length]!.id,
            );
            if (run && terminal(run)) yield* recordRun(discussion, run);
            const value = yield* mutate(
              discussion.id,
              Effect.gen(function* () {
                const entry = yield* store.appendEntry({
                  id: DiscussionEntryId.make(yield* uuid),
                  discussionId: discussion.id,
                  kind: "system",
                  ...(!active && !ordinaryCompleted
                    ? { seatId: discussion.seats[discussion.cursor.seatIndex]!.id }
                    : {}),
                  text: "讨论到此",
                  files: null,
                  status: "completed",
                  checkpointRef: null,
                  createdAt: yield* now,
                });
                const value: Discussion = {
                  ...discussion,
                  status: "closing",
                  pause: null,
                  cursor: ordinaryCompleted
                    ? {
                        ...discussion.cursor,
                        phase: "final_round",
                        seatIndex: firstIndex,
                        runId: null,
                        round: discussion.cursor.round + (firstIndex === 0 ? 1 : 0),
                      }
                    : active
                      ? discussion.cursor
                      : { ...discussion.cursor, phase: "final_round" },
                  closing: {
                    summarizerSeatId: input.summarizerSeatId,
                    summaryPrompt: prompt.prompt,
                    remainingFinalSeatIds,
                    phase: "final_round",
                  },
                  updatedAt: yield* now,
                };
                yield* store.updateDiscussion(value);
                return {
                  value,
                  increments: [
                    { type: "entry.appended", entry } as const,
                    { type: "discussion.updated", discussion: value } as const,
                  ],
                };
              }),
            );
            if (
              active ||
              (run && (!terminal(run) || (yield* captureState(discussion, run)).pending))
            )
              return { discussion: value };
            return { discussion: yield* dispatchSeat(value, "final_round") };
          }),
        ),
      ),
    delete: ({ discussionId }) =>
      locks.withLock(
        discussionId,
        domain(
          Effect.gen(function* () {
            const discussion = yield* requireDiscussion(discussionId);
            if (discussion.status !== "ended" && discussion.status !== "paused")
              return yield* invalid("Discussion must be ended or paused before deletion.");
            for (const seat of discussion.seats) {
              const context = yield* projections.getThreadRecords(seat.threadId, ["runs"]);
              if (context.runs.some((run) => !terminal(run) && run.status !== "rolled_back"))
                return yield* invalid("Discussion still has an active run.");
            }
            for (const seat of discussion.seats) {
              const shell = yield* threads.getThreadShell(seat.threadId);
              if (shell?.archivedAt === null)
                yield* threads.dispatch({
                  type: "thread.archive",
                  commandId: CommandId.make(`discussion:${discussionId}:archive:${seat.id}`),
                  threadId: seat.threadId,
                });
            }
            const deleted = yield* mutate(
              discussionId,
              store.deleteDiscussion(discussionId).pipe(
                Effect.as({
                  value: { discussionId },
                  increments: [{ type: "discussion.deleted", discussionId } as const],
                }),
              ),
            );
            exhaustedCaptureRunIds.delete(discussionId);
            return deleted;
          }),
        ),
      ),
    start: () =>
      domain(
        Effect.gen(function* () {
          if (started) return;
          started = true;
          // Capture the log boundary BEFORE repair reads; startup changes replay after recovery,
          // and paused state prevents those replays from dispatching the next seat.
          const afterSequence = yield* events.latestSequence();
          const exhaustedCaptures = yield* captureRecovery.subscribe.pipe(
            Effect.provideService(Scope.Scope, scope),
          );
          for (const discussion of yield* store.listDiscussions()) {
            if (discussion.status !== "speaking" && discussion.status !== "closing") continue;
            let recovered = discussion;
            let run = yield* trackedRun(discussion);
            if (discussion.cursor.runId === null && discussion.cursor.dispatchNo > 0) {
              // A crash can follow the orchestration commit but precede cursor binding. Recover
              // by this dispatch's exact message identity, never the latest user/automatic run.
              const context = yield* domain(
                projections.getThreadRecords(
                  discussion.seats[discussion.cursor.seatIndex]!.threadId,
                  ["runs"],
                ),
              );
              const messageId = MessageId.make(
                `discussion:${discussion.id}:dispatch:${discussion.cursor.dispatchNo}`,
              );
              run = context.runs.find((item) => item.userMessageId === messageId) ?? null;
              if (run)
                recovered = yield* acknowledgeDispatch(
                  discussion,
                  run.id,
                  (yield* store.listEntries(discussion.id)).filter(
                    (entry) => entry.seq <= discussion.cursor.dispatchedEntrySeq,
                  ),
                );
            }
            if (run && terminal(run)) yield* onRun(discussion.id, run, true);
            yield* locks.withLock(
              discussion.id,
              save({
                ...recovered,
                status: "paused",
                pause: {
                  reason: "server_restarted",
                  seatId: discussion.seats[discussion.cursor.seatIndex]!.id,
                },
              }),
            );
          }
          yield* forkParked(
            events.stream({ eventType: "run.updated", afterSequence, bounded: false }).pipe(
              Stream.runForEach(({ event }) =>
                Effect.gen(function* () {
                  if (event.type !== "run.updated") return;
                  const shell = yield* domain(projections.getThreadShell(event.threadId));
                  if (shell?.discussion) yield* onRun(shell.discussion.discussionId, event.payload);
                }).pipe(
                  Effect.catch((cause) =>
                    Effect.logWarning("discussion run reactor failed", {
                      runId: event.runId,
                      cause,
                    }),
                  ),
                ),
              ),
              Effect.catch((cause) =>
                Effect.logError("discussion run subscription failed", { cause }),
              ),
            ),
          ).pipe(Effect.provideService(Scope.Scope, scope));
          yield* forkParked(
            exhaustedCaptures.pipe(
              Stream.runForEach((capture) =>
                domain(
                  Effect.gen(function* () {
                    const shell = yield* projections.getThreadShell(capture.threadId);
                    if (!shell?.discussion) return;
                    const discussion = yield* store.getDiscussion(shell.discussion.discussionId);
                    if (!discussion || discussion.cursor.runId !== capture.runId) return;
                    const run = yield* trackedRun(discussion);
                    if (run) yield* onRun(discussion.id, run, false, true);
                  }),
                ).pipe(
                  Effect.catch((cause) =>
                    Effect.logWarning("discussion exhausted capture recovery failed", {
                      capture,
                      cause,
                    }),
                  ),
                ),
              ),
            ),
          ).pipe(Effect.provideService(Scope.Scope, scope));
        }),
      ),
  });
});

/** Shares store/runtime dependencies with transports; recovery and outbox use the application's memoized layers. */
export const layer: Layer.Layer<
  DiscussionService,
  never,
  | ThreadManagement.ThreadManagementService
  | ThreadLaunch.ThreadLaunchService
  | ProjectionStore.ProjectionStoreV2
  | EventSink.EventSinkV2
  | ProviderAdapters.ProviderAdapterRegistryV2
  | Projects.ProjectService
  | Settings.ServerSettingsService
  | CheckpointStore.CheckpointStore
  | DiscussionStore.DiscussionStore
  | Crypto.Crypto
  | FileSystem.FileSystem
  | Path.Path
  | ServerConfig.ServerConfig
  | SqlClient.SqlClient
> = Layer.effect(DiscussionService, make).pipe(
  Layer.provide(CaptureRecovery.layer),
  Layer.provide(EffectOutbox.layer),
);
