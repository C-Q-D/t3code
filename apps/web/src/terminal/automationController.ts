import type * as A from "@t3tools/contracts";

export interface TerminalAutomationTransport {
  subscribe: (
    start: () => void,
    end: () => void,
    event: (event: typeof A.TerminalAutomationRpcEvent.Type) => void,
    error: (error: unknown) => void,
  ) => () => void;
  registerViews: (views: readonly A.TerminalAutomationCandidate[]) => Promise<void>;
  replyBridge: (reply: A.TerminalAutomationClientReply, isCurrent: () => boolean) => Promise<void>;
  replySelection: (reply: A.TerminalAutomationSelectionReply) => Promise<void>;
  reportEvent: (event: A.TerminalAutomationClientEvent) => Promise<void>;
  getConnectionState: () => Promise<A.TerminalAutomationConnectionState>;
  resume: (
    bindingId: string,
    inputEpoch: number,
    isCurrent: () => boolean,
  ) => Promise<A.TerminalAutomationStatus>;
}

export interface TerminalAutomationView {
  candidate: A.TerminalAutomationCandidate;
  canOperate: () => boolean;
  perform: (
    request: A.TerminalAutomationClientRequest,
    guard: () => void,
    signal: AbortSignal,
  ) => Promise<A.TerminalAutomationClientReply["result"]>;
  invalidate: () => void;
  retainBindings?: (bindings: readonly A.TerminalAutomationBinding[]) => void;
}

export class TerminalBridgeError extends Error {
  constructor(readonly code: A.TerminalAutomationErrorCode) {
    super(code);
  }
}

const sameTarget = (a: A.TerminalAutomationTarget, b: A.TerminalAutomationTarget) =>
  a.terminalId === b.terminalId &&
  a.terminalInstanceId === b.terminalInstanceId &&
  a.viewId === b.viewId;

export class TerminalAutomationController {
  private confirmations = new Map<
    string,
    {
      binding: A.TerminalAutomationBinding;
      current: () => boolean;
      resolved: boolean;
      pending: boolean;
    }
  >();
  private generation = 0;
  private queryVersion = 0;
  private notifiedRevision = 0;
  private appliedRevision = 0;
  private authoritativeSelections = false;
  private synchronizing: Promise<A.TerminalAutomationConnectionState> | undefined;
  private disposed = false;
  private views = new Map<
    string,
    {
      view: TerminalAutomationView;
      barrier: number;
      blocked: boolean;
      blockedBindings: Set<string>;
      pendingReports: number;
      reportFailed: boolean;
      permits: Map<string, number>;
    }
  >();
  private requests = new Map<
    string,
    { abort: AbortController; target: A.TerminalAutomationTarget; bindingId: string }
  >();
  private listeners = new Set<() => void>();
  private stop: (() => void) | undefined;
  private registrationVersion = 0;
  private registering: Promise<void> | undefined;
  private snapshot: {
    ready: boolean;
    bindings: A.TerminalAutomationConnectionState["bindings"];
    selections: readonly A.TerminalAutomationSelectionRequest[];
    localPausedTargets: readonly A.TerminalAutomationTarget[];
    error: unknown;
    resumingBindingIds: readonly string[];
    submittingSelectionIds: readonly string[];
    unverifiedResumeBindingIds: readonly string[];
  } = {
    ready: false,
    bindings: [],
    selections: [],
    localPausedTargets: [],
    error: null,
    resumingBindingIds: [],
    submittingSelectionIds: [],
    unverifiedResumeBindingIds: [],
  };

  constructor(private readonly transport: TerminalAutomationTransport) {}

  getSnapshot = () => this.snapshot;
  isBindingLocallyPaused(binding: A.TerminalAutomationBinding) {
    const entry = this.views.get(binding.target.viewId);
    return (
      !!entry &&
      sameTarget(entry.view.candidate.target, binding.target) &&
      (entry.pendingReports > 0 ||
        entry.reportFailed ||
        entry.blockedBindings.has(binding.bindingId))
    );
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private publish(patch: Partial<typeof this.snapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }
  private fail = (error: unknown) => {
    if (!this.disposed) this.publish({ error });
  };
  private currentFailureHandler() {
    const generation = this.generation;
    return (error: unknown) => {
      if (generation === this.generation) this.fail(error);
    };
  }

  start() {
    if (this.stop || this.disposed) return;
    this.stop = this.transport.subscribe(
      this.invalidate,
      this.invalidate,
      this.receive,
      (error) => {
        this.invalidate();
        this.fail(error);
      },
    );
  }

  suspend() {
    this.invalidate();
    this.stop?.();
    this.stop = undefined;
  }

  private invalidate = () => {
    this.generation += 1;
    this.queryVersion += 1;
    this.notifiedRevision = 0;
    this.appliedRevision = 0;
    this.authoritativeSelections = false;
    this.synchronizing = undefined;
    this.confirmations.clear();
    for (const request of this.requests.values()) request.abort.abort();
    this.requests.clear();
    this.registering = undefined;
    for (const entry of this.views.values()) {
      entry.view.invalidate();
      entry.view.retainBindings?.([]);
      entry.permits.clear();
      entry.blocked = false;
      entry.blockedBindings.clear();
      entry.reportFailed = false;
      entry.barrier += 1;
    }
    this.publish({
      ready: false,
      bindings: [],
      selections: [],
      localPausedTargets: [],
      unverifiedResumeBindingIds: [],
    });
  };

  private receive = (event: typeof A.TerminalAutomationRpcEvent.Type) => {
    if (this.disposed) return;
    if ("type" in event) {
      if (event.type === "state_changed") {
        if (event.revision <= this.notifiedRevision) return;
        this.notifiedRevision = event.revision;
        this.queryVersion += 1;
        void this.synchronize().catch(this.currentFailureHandler());
        return;
      }
      this.publish({ ready: true });
      void this.register().catch(this.currentFailureHandler());
    } else if ("selectionRequestId" in event) {
      if (this.authoritativeSelections) {
        void this.synchronize().catch(this.currentFailureHandler());
        return;
      }
      this.publish({
        selections: [
          ...this.snapshot.selections.filter(
            (item) => item.selectionRequestId !== event.selectionRequestId,
          ),
          event,
        ].slice(-128),
      });
    } else {
      void this.handle(event).catch(this.currentFailureHandler());
    }
  };

  setView(view: TerminalAutomationView) {
    const id = view.candidate.target.viewId;
    const current = this.views.get(id);
    if (current && sameTarget(current.view.candidate.target, view.candidate.target)) {
      current.view = view;
    } else {
      current?.view.invalidate();
      this.views.set(id, {
        view,
        barrier: 0,
        blocked: false,
        blockedBindings: new Set(),
        pendingReports: 0,
        reportFailed: false,
        permits: new Map(),
      });
    }
    this.registrationVersion += 1;
    if (this.snapshot.ready) void this.register().catch(this.currentFailureHandler());
  }

  removeView(
    target: A.TerminalAutomationTarget,
    event: "view_closed" | "instance_exited" = "view_closed",
  ) {
    const entry = this.views.get(target.viewId);
    if (!entry || !sameTarget(entry.view.candidate.target, target)) return;
    entry.view.invalidate();
    this.views.delete(target.viewId);
    this.publish({
      localPausedTargets: this.snapshot.localPausedTargets.filter(
        (item) => !sameTarget(item, target),
      ),
    });
    this.registrationVersion += 1;
    if (this.snapshot.ready) {
      void this.transport
        .reportEvent({ version: 1, target, event })
        .catch(this.currentFailureHandler());
      void this.register().catch(this.currentFailureHandler());
    }
  }

  private register(): Promise<void> {
    if (this.registering) return this.registering;
    const generation = this.generation;
    const work = async () => {
      let version: number;
      do {
        version = this.registrationVersion;
        if (!this.snapshot.ready || generation !== this.generation || this.disposed) return;
        const views = [...this.views.values()]
          .filter(({ view }) => view.canOperate())
          .map(({ view }) => view.candidate);
        await this.transport.registerViews(views);
        if (generation !== this.generation || this.disposed) return;
        await this.synchronize();
      } while (version !== this.registrationVersion);
      if (this.registering === pending) this.registering = undefined;
    };
    const pending = work().finally(() => {
      if (this.registering === pending) this.registering = undefined;
    });
    this.registering = pending;
    return pending;
  }

  synchronize(): Promise<A.TerminalAutomationConnectionState> {
    if (this.synchronizing) return this.synchronizing;
    const generation = this.generation;
    const work = async (): Promise<A.TerminalAutomationConnectionState> => {
      for (;;) {
        const requestedRevision = this.notifiedRevision;
        try {
          return await this.refreshState();
        } catch (error) {
          if (
            generation !== this.generation ||
            this.disposed ||
            (!(error instanceof TerminalBridgeError && error.code === "stale_request") &&
              this.notifiedRevision <= requestedRevision)
          )
            throw error;
        }
      }
    };
    let completed = false;
    const pending = work()
      .then((state) => {
        completed = true;
        return state;
      })
      .finally(() => {
        if (this.synchronizing !== pending) return;
        this.synchronizing = undefined;
        if (completed && this.snapshot.ready && this.notifiedRevision > this.appliedRevision)
          void this.synchronize().catch(this.currentFailureHandler());
      });
    this.synchronizing = pending;
    return pending;
  }

  async refreshState() {
    if (!this.snapshot.ready || this.disposed) throw new TerminalBridgeError("client_unavailable");
    const generation = this.generation;
    const version = ++this.queryVersion;
    const state = await this.transport.getConnectionState();
    if (
      generation !== this.generation ||
      version !== this.queryVersion ||
      this.disposed ||
      (state.revision ?? 0) < Math.max(this.notifiedRevision, this.appliedRevision)
    )
      throw new TerminalBridgeError("stale_request");
    const liveIds = new Set([
      ...state.bindings.map((item) => item.binding.bindingId),
      ...[...this.requests.values()].map((item) => item.bindingId),
    ]);
    for (const entry of this.views.values()) {
      for (const id of entry.blockedBindings)
        if (!liveIds.has(id)) entry.blockedBindings.delete(id);
      entry.view.retainBindings?.(
        state.bindings
          .filter(
            (item) =>
              item.status !== "invalid" &&
              sameTarget(item.binding.target, entry.view.candidate.target),
          )
          .map((item) => item.binding),
      );
    }
    this.appliedRevision = state.revision ?? 0;
    this.authoritativeSelections = state.selections !== undefined;
    this.publish({
      ...this.reconcileConfirmations(state.bindings),
      bindings: state.bindings,
      selections: state.selections ?? this.snapshot.selections,
      error: null,
    });
    return state;
  }

  humanInput(target: A.TerminalAutomationTarget) {
    const entry = this.views.get(target.viewId);
    if (!entry || !sameTarget(entry.view.candidate.target, target)) return;
    for (const [id, confirmation] of this.confirmations)
      if (sameTarget(confirmation.binding.target, target)) this.confirmations.delete(id);
    entry.barrier += 1;
    entry.blocked = true;
    entry.reportFailed = true;
    for (const state of this.snapshot.bindings) {
      if (sameTarget(state.binding.target, target))
        entry.blockedBindings.add(state.binding.bindingId);
    }
    for (const request of this.requests.values()) {
      if (sameTarget(request.target, target)) entry.blockedBindings.add(request.bindingId);
    }
    entry.permits.clear();
    this.publishConfirmationState();
    entry.view.invalidate();
    this.queryVersion += 1;
    this.publish({
      localPausedTargets: [...this.views.values()]
        .filter((item) => item.blocked)
        .map((item) => item.view.candidate.target),
    });
    if (this.snapshot.ready) {
      entry.pendingReports += 1;
      const barrier = entry.barrier;
      const reported = this.transport
        .reportEvent({ version: 1, target, event: "human_intervened" })
        .then(() => {
          if (entry.barrier === barrier) entry.reportFailed = false;
          return this.refreshState();
        })
        .finally(() => {
          entry.pendingReports -= 1;
        });
      void reported.catch(this.currentFailureHandler());
      return reported;
    }
  }

  async resume(bindingId: string, confirmedInputEpoch: number) {
    if (this.snapshot.resumingBindingIds.includes(bindingId))
      throw new TerminalBridgeError("request_conflict");
    this.publish({ resumingBindingIds: [...this.snapshot.resumingBindingIds, bindingId] });
    try {
      await this.resumeConfirmed(bindingId, confirmedInputEpoch);
    } finally {
      this.publish({
        resumingBindingIds: this.snapshot.resumingBindingIds.filter((id) => id !== bindingId),
      });
    }
  }

  private confirmationState() {
    return {
      unverifiedResumeBindingIds: [...this.confirmations]
        .filter(([, item]) => !item.resolved)
        .map(([id]) => id),
      localPausedTargets: [...this.views.values()]
        .filter((entry) => entry.blocked)
        .map((entry) => entry.view.candidate.target),
    };
  }

  private publishConfirmationState() {
    this.publish(this.confirmationState());
  }

  private reconcileConfirmations(states: A.TerminalAutomationConnectionState["bindings"]) {
    for (const [id, confirmation] of this.confirmations) {
      const state = states.find((item) => item.binding.bindingId === id);
      const entry = this.views.get(confirmation.binding.target.viewId);
      if (
        !confirmation.current() ||
        !entry ||
        !state ||
        state.status === "invalid" ||
        state.binding.inputEpoch !== confirmation.binding.inputEpoch ||
        !sameTarget(state.binding.target, confirmation.binding.target)
      ) {
        entry?.permits.delete(id);
        this.confirmations.delete(id);
        continue;
      }
      if (state.status === "bound") {
        entry.permits.set(id, state.binding.inputEpoch);
        entry.blockedBindings.delete(id);
        entry.blocked = entry.blockedBindings.size > 0;
        confirmation.resolved = true;
      } else {
        entry.permits.delete(id);
        entry.blockedBindings.add(id);
        entry.blocked = true;
        confirmation.resolved = false;
        if (!confirmation.pending) this.confirmations.delete(id);
      }
    }
    return this.confirmationState();
  }

  private async resumeConfirmed(bindingId: string, confirmedInputEpoch: number) {
    const generation = this.generation;
    const queryVersion = this.queryVersion;
    await this.refreshState();
    if (generation !== this.generation || this.queryVersion !== queryVersion + 1)
      throw new TerminalBridgeError("stale_request");
    const paused = this.snapshot.bindings.find(
      (item) => item.status === "paused" && item.binding.bindingId === bindingId,
    );
    if (!paused || paused.binding.inputEpoch !== confirmedInputEpoch)
      throw new TerminalBridgeError("stale_request");
    const entry = this.views.get(paused.binding.target.viewId);
    if (
      !entry ||
      !sameTarget(entry.view.candidate.target, paused.binding.target) ||
      !entry.view.canOperate()
    )
      throw new TerminalBridgeError("target_invalid");
    if (entry.pendingReports > 0 || entry.reportFailed)
      throw new TerminalBridgeError("human_intervened");
    const barrier = entry.barrier;
    const confirmation = {
      binding: paused.binding,
      resolved: false,
      pending: true,
      current: () =>
        generation === this.generation &&
        !this.disposed &&
        this.snapshot.ready &&
        this.views.get(paused.binding.target.viewId) === entry &&
        entry.barrier === barrier &&
        entry.pendingReports === 0 &&
        !entry.reportFailed &&
        entry.view.canOperate(),
    };
    this.confirmations.set(bindingId, confirmation);
    entry.blockedBindings.add(bindingId);
    entry.blocked = true;
    this.publishConfirmationState();
    const expiresAt = Date.now() + 10_000;
    try {
      const result = await this.transport.resume(
        bindingId,
        confirmedInputEpoch,
        () => confirmation.current() && Date.now() < expiresAt,
      );
      if (
        !confirmation.current() ||
        this.confirmations.get(bindingId) !== confirmation ||
        result.state.status !== "bound" ||
        result.state.binding.bindingId !== bindingId ||
        result.state.binding.inputEpoch !== confirmedInputEpoch ||
        !sameTarget(result.state.binding.target, paused.binding.target)
      )
        throw new TerminalBridgeError("stale_request");
      const confirmedState = result.state;
      this.queryVersion += 1;
      const bindings = this.snapshot.bindings.map((item) =>
        item.binding.bindingId === bindingId ? confirmedState : item,
      );
      this.publish({ ...this.reconcileConfirmations(bindings), bindings, error: null });
    } catch (error) {
      if (
        confirmation.current() &&
        this.confirmations.get(bindingId) === confirmation &&
        confirmation.resolved
      )
        return;
      this.publishConfirmationState();
      throw error;
    } finally {
      confirmation.pending = false;
      this.publishConfirmationState();
    }
  }

  async submitSelection(selectionRequestId: string, candidateId: string | null) {
    if (this.snapshot.submittingSelectionIds.includes(selectionRequestId))
      throw new TerminalBridgeError("request_conflict");
    this.publish({
      submittingSelectionIds: [...this.snapshot.submittingSelectionIds, selectionRequestId],
    });
    try {
      await this.submitSelectionConfirmed(selectionRequestId, candidateId);
    } finally {
      this.publish({
        submittingSelectionIds: this.snapshot.submittingSelectionIds.filter(
          (id) => id !== selectionRequestId,
        ),
      });
    }
  }

  private async submitSelectionConfirmed(selectionRequestId: string, candidateId: string | null) {
    const selection = this.snapshot.selections.find(
      (item) => item.selectionRequestId === selectionRequestId,
    );
    if (!selection) throw new TerminalBridgeError("stale_request");
    const generation = this.generation;
    try {
      await this.transport.replySelection({
        version: 1,
        selectionRequestId,
        candidateVersion: selection.candidateVersion,
        choice:
          candidateId === null ? { status: "cancelled" } : { status: "selected", candidateId },
      });
    } catch (error) {
      if (
        generation === this.generation &&
        (error instanceof Error ? error.message : (error as { code?: string } | null)?.code) ===
          "stale_request"
      )
        this.publish({ selections: this.snapshot.selections.filter((item) => item !== selection) });
      throw error;
    }
    if (generation === this.generation)
      this.publish({ selections: this.snapshot.selections.filter((item) => item !== selection) });
    if (generation !== this.generation) throw new TerminalBridgeError("stale_request");
    await this.synchronize();
    if (generation !== this.generation) throw new TerminalBridgeError("stale_request");
  }

  private async handle(request: A.TerminalAutomationClientRequest) {
    const generation = this.generation;
    const entry = this.views.get(request.binding.target.viewId);
    const barrier = entry?.barrier;
    const abort = new AbortController();
    if (this.requests.has(request.bridgeRequestId) || this.requests.size >= 128) {
      const code = this.requests.has(request.bridgeRequestId)
        ? "request_conflict"
        : "budget_exceeded";
      await this.transport.replyBridge(
        {
          version: 1,
          bridgeRequestId: request.bridgeRequestId,
          binding: request.binding,
          result:
            request.operation === "apply_local"
              ? {
                  operation: "apply_local",
                  inputRequestId: request.inputRequestId,
                  error: { code },
                }
              : { operation: request.operation, error: { code } },
        },
        () => generation === this.generation && !this.disposed && this.snapshot.ready,
      );
      return;
    }
    const pending = { abort, target: request.binding.target, bindingId: request.binding.bindingId };
    this.requests.set(request.bridgeRequestId, pending);
    const timeout = setTimeout(() => abort.abort(), 10_000);
    const expiresAt = Date.now() + 10_000;
    const guard = () => {
      if (
        this.disposed ||
        !this.snapshot.ready ||
        generation !== this.generation ||
        abort.signal.aborted ||
        Date.now() >= expiresAt
      )
        throw new TerminalBridgeError("client_unavailable");
      if (
        !entry ||
        this.views.get(request.binding.target.viewId) !== entry ||
        !sameTarget(entry.view.candidate.target, request.binding.target)
      )
        throw new TerminalBridgeError("target_invalid");
      if (!entry.view.canOperate()) throw new TerminalBridgeError("target_invalid");
      if (
        entry.barrier !== barrier ||
        entry.pendingReports > 0 ||
        entry.reportFailed ||
        (entry.blockedBindings.has(request.binding.bindingId) &&
          entry.permits.get(request.binding.bindingId) !== request.binding.inputEpoch)
      )
        throw new TerminalBridgeError("human_intervened");
      const known = this.snapshot.bindings.find(
        (item) => item.binding.bindingId === request.binding.bindingId,
      );
      if (known) {
        if (!sameTarget(known.binding.target, request.binding.target) || known.status === "invalid")
          throw new TerminalBridgeError("target_invalid");
        if (known.status === "paused") throw new TerminalBridgeError("human_intervened");
        if (known.binding.inputEpoch !== request.binding.inputEpoch)
          throw new TerminalBridgeError("stale_request");
      }
    };
    try {
      let result: A.TerminalAutomationClientReply["result"];
      try {
        if (
          !this.snapshot.bindings.some(
            (item) => item.binding.bindingId === request.binding.bindingId,
          )
        ) {
          const state = await this.refreshState();
          if (!state.bindings.some((item) => item.binding.bindingId === request.binding.bindingId))
            throw new TerminalBridgeError("target_invalid");
        }
        guard();
        result = await entry!.view.perform(request, guard, abort.signal);
        guard();
      } catch (error) {
        const code = error instanceof TerminalBridgeError ? error.code : "client_unavailable";
        if (generation === this.generation && !(error instanceof TerminalBridgeError))
          this.fail(error);
        result =
          request.operation === "apply_local"
            ? { operation: "apply_local", inputRequestId: request.inputRequestId, error: { code } }
            : { operation: request.operation, error: { code } };
      }
      if (generation === this.generation && !this.disposed && this.snapshot.ready)
        await this.transport.replyBridge(
          {
            version: 1,
            bridgeRequestId: request.bridgeRequestId,
            binding: request.binding,
            result,
          },
          () => {
            if ("error" in result)
              return (
                generation === this.generation &&
                !this.disposed &&
                this.snapshot.ready &&
                Date.now() < expiresAt
              );
            try {
              guard();
              return true;
            } catch {
              return false;
            }
          },
        );
    } finally {
      clearTimeout(timeout);
      if (this.requests.get(request.bridgeRequestId) === pending)
        this.requests.delete(request.bridgeRequestId);
    }
  }

  dispose() {
    this.disposed = true;
    this.invalidate();
    this.stop?.();
    this.stop = undefined;
    this.views.clear();
    this.listeners.clear();
  }
}
