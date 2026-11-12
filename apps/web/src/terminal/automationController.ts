import type * as A from "@t3tools/contracts";

export interface TerminalAutomationTransport {
  subscribe: (
    start: () => void,
    end: () => void,
    event: (event: typeof A.TerminalAutomationRpcEvent.Type) => void,
  ) => () => void;
  registerViews: (views: readonly A.TerminalAutomationCandidate[]) => Promise<void>;
  replyBridge: (reply: A.TerminalAutomationClientReply) => Promise<void>;
  replySelection: (reply: A.TerminalAutomationSelectionReply) => Promise<void>;
  reportEvent: (event: A.TerminalAutomationClientEvent) => Promise<void>;
  getConnectionState: () => Promise<A.TerminalAutomationConnectionState>;
  resume: (bindingId: string) => Promise<A.TerminalAutomationStatus>;
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
  private generation = 0;
  private queryVersion = 0;
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
  } = { ready: false, bindings: [], selections: [], localPausedTargets: [], error: null };

  constructor(private readonly transport: TerminalAutomationTransport) {}

  getSnapshot = () => this.snapshot;
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

  start() {
    if (this.stop || this.disposed) return;
    this.stop = this.transport.subscribe(this.invalidate, this.invalidate, this.receive);
  }

  suspend() {
    this.invalidate();
    this.stop?.();
    this.stop = undefined;
  }

  private invalidate = () => {
    this.generation += 1;
    this.queryVersion += 1;
    for (const request of this.requests.values()) request.abort.abort();
    this.requests.clear();
    this.registering = undefined;
    for (const entry of this.views.values()) {
      entry.view.invalidate();
      entry.permits.clear();
      entry.blocked = false;
      entry.blockedBindings.clear();
      entry.reportFailed = false;
      entry.barrier += 1;
    }
    this.publish({ ready: false, bindings: [], selections: [], localPausedTargets: [] });
  };

  private receive = (event: typeof A.TerminalAutomationRpcEvent.Type) => {
    if (this.disposed) return;
    if ("type" in event) {
      this.publish({ ready: true });
      void this.register().catch(this.fail);
    } else if ("selectionRequestId" in event) {
      this.publish({
        selections: [
          ...this.snapshot.selections.filter(
            (item) => item.selectionRequestId !== event.selectionRequestId,
          ),
          event,
        ].slice(-128),
      });
    } else {
      void this.handle(event).catch(this.fail);
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
    if (this.snapshot.ready) void this.register().catch(this.fail);
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
      void this.transport.reportEvent({ version: 1, target, event }).catch(this.fail);
      void this.register().catch(this.fail);
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
      } while (version !== this.registrationVersion);
      if (generation === this.generation) await this.refreshState();
    };
    const pending = work().finally(() => {
      if (this.registering === pending) this.registering = undefined;
    });
    this.registering = pending;
    return pending;
  }

  async refreshState() {
    if (!this.snapshot.ready || this.disposed) throw new TerminalBridgeError("client_unavailable");
    const generation = this.generation;
    const version = ++this.queryVersion;
    const state = await this.transport.getConnectionState();
    if (generation !== this.generation || version !== this.queryVersion || this.disposed)
      throw new TerminalBridgeError("stale_request");
    const liveIds = new Set([
      ...state.bindings.map((item) => item.binding.bindingId),
      ...[...this.requests.values()].map((item) => item.bindingId),
    ]);
    for (const entry of this.views.values()) {
      for (const id of entry.blockedBindings)
        if (!liveIds.has(id)) entry.blockedBindings.delete(id);
    }
    this.publish({ bindings: state.bindings });
    return state;
  }

  humanInput(target: A.TerminalAutomationTarget) {
    const entry = this.views.get(target.viewId);
    if (!entry || !sameTarget(entry.view.candidate.target, target)) return;
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
      void reported.catch(this.fail);
      return reported;
    }
  }

  async resume(bindingId: string) {
    const generation = this.generation;
    const queryVersion = this.queryVersion;
    const state = await this.refreshState();
    if (generation !== this.generation || this.queryVersion !== queryVersion + 1)
      throw new TerminalBridgeError("stale_request");
    const paused = state.bindings.find(
      (item) => item.status === "paused" && item.binding.bindingId === bindingId,
    );
    if (!paused) throw new TerminalBridgeError("stale_request");
    const entry = this.views.get(paused.binding.target.viewId);
    if (
      !entry ||
      !sameTarget(entry.view.candidate.target, paused.binding.target) ||
      !entry.view.canOperate()
    )
      throw new TerminalBridgeError("target_invalid");
    const barrier = entry.barrier;
    const result = await this.transport.resume(bindingId);
    if (
      generation !== this.generation ||
      entry.barrier !== barrier ||
      this.disposed ||
      this.views.get(paused.binding.target.viewId) !== entry
    )
      throw new TerminalBridgeError("stale_request");
    if (result.state.status !== "bound" || result.state.binding.bindingId !== bindingId)
      throw new TerminalBridgeError("stale_request");
    entry.permits.set(bindingId, result.state.binding.inputEpoch);
    await this.refreshState();
    if (generation !== this.generation || entry.barrier !== barrier || this.disposed)
      throw new TerminalBridgeError("stale_request");
    this.publish({
      localPausedTargets: this.snapshot.localPausedTargets.filter(
        (target) => !sameTarget(target, paused.binding.target),
      ),
    });
  }

  async submitSelection(selectionRequestId: string, candidateId: string | null) {
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
    } finally {
      if (generation === this.generation)
        this.publish({ selections: this.snapshot.selections.filter((item) => item !== selection) });
    }
    await this.refreshState();
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
      await this.transport.replyBridge({
        version: 1,
        bridgeRequestId: request.bridgeRequestId,
        binding: request.binding,
        result:
          request.operation === "apply_local"
            ? { operation: "apply_local", inputRequestId: request.inputRequestId, error: { code } }
            : { operation: request.operation, error: { code } },
      });
      return;
    }
    const pending = { abort, target: request.binding.target, bindingId: request.binding.bindingId };
    this.requests.set(request.bridgeRequestId, pending);
    const timeout = setTimeout(() => abort.abort(), 10_000);
    const guard = () => {
      if (
        this.disposed ||
        !this.snapshot.ready ||
        generation !== this.generation ||
        abort.signal.aborted
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
        if (!(error instanceof TerminalBridgeError)) this.fail(error);
        result =
          request.operation === "apply_local"
            ? { operation: "apply_local", inputRequestId: request.inputRequestId, error: { code } }
            : { operation: request.operation, error: { code } };
      }
      if (generation === this.generation && !this.disposed && this.snapshot.ready)
        await this.transport.replyBridge({
          version: 1,
          bridgeRequestId: request.bridgeRequestId,
          binding: request.binding,
          result,
        });
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
