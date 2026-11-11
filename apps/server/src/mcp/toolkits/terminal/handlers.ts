import * as A from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Automation from "../../../terminal/AutomationService.ts";
import * as EventSink from "../../../orchestration-v2/EventSink.ts";
import * as ThreadManagement from "../../../orchestration-v2/ThreadManagementService.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";
import * as McpToolAccess from "../../McpToolAccess.ts";
import { assertFullAccess, assertLiveCaller, loadCaller } from "../../threadAccess.ts";
import { TerminalToolkit } from "./tools.ts";

const unsupported = () =>
  new A.OrchestratorMcpFailure({
    code: "capability_denied",
    message:
      "Terminal automation requires a T3 provider thread credential with a live dispatch grant. External OAuth clients and credentials without this lifecycle are unsupported.",
  });

type Guard = Exclude<Automation.Authorization, Effect.Effect<void, A.TerminalAutomationError>>;
const withAuthorization = Effect.fn("TerminalToolkit.withAuthorization")(function* <T>(
  operate: boolean,
  run: (authorization: Guard) => Effect.Effect<T, A.TerminalAutomationError>,
) {
  const scope = yield* McpInvocationContext.requireMcpCapability("terminal");
  const thread = scope.thread;
  const credential = scope.credentialAuthorization;
  if (!thread || scope.client || !credential) return yield* unsupported();
  const sink = yield* EventSink.EventSinkV2;
  const watch = sink.watchDispatchAuthorization;
  if (!watch) return yield* unsupported();
  let activeRunId: A.RunId | null | undefined;
  const lease = yield* watch(thread.threadId, (event) => {
    switch (event.type) {
      case "thread.runtime-mode-updated":
      case "thread.interaction-mode-updated":
      case "thread.provider-switched":
      case "thread.archived":
      case "thread.deleted":
        return false;
      case "run.created":
      case "run.updated":
        return event.payload.id === activeRunId
          ? ["preparing", "starting", "running", "waiting"].includes(event.payload.status)
          : !["preparing", "starting", "running", "waiting"].includes(event.payload.status);
      default:
        return true;
    }
  });
  if (!lease) return yield* Effect.fail<A.TerminalAutomationError>({ code: "budget_exceeded" });
  const isValid = () => credential.isValid() && lease.isValid();
  const check = Effect.gen(function* () {
    if (!isValid()) return yield* unsupported();
    const current = yield* loadCaller();
    yield* assertLiveCaller(current);
    if (operate)
      yield* assertFullAccess(
        current,
        "Terminal input and binding changes require full-access/default mode.",
      );
    activeRunId = current.caller?.activeRunId;
    if (!isValid()) return yield* unsupported();
  });
  const context = yield* Effect.context<
    McpInvocationContext.McpInvocationContext | ThreadManagement.ThreadManagementService
  >();
  yield* check;
  return yield* run({
    isValid,
    invalidated: Effect.raceFirst(credential.invalidated, lease.invalidated),
    check: check.pipe(
      Effect.provide(context),
      Effect.mapError(() => ({ code: "target_invalid" as const })),
    ),
  });
}, Effect.scoped);

const invoke = Effect.fn("TerminalToolkit.invoke")(function* <T>(
  operate: boolean,
  run: (
    service: Automation.TerminalAutomationService["Service"],
    caller: Automation.Caller,
    authorization: Guard,
  ) => Effect.Effect<T, A.TerminalAutomationError>,
) {
  const scope = yield* McpInvocationContext.McpInvocationContext;
  if (!scope.thread || !scope.credentialAuthorization || scope.client) return yield* unsupported();
  const service = yield* Automation.TerminalAutomationService;
  const context = yield* Effect.context<
    | McpInvocationContext.McpInvocationContext
    | ThreadManagement.ThreadManagementService
    | EventSink.EventSinkV2
  >();
  const caller: Automation.Caller = {
    scope: { environmentId: scope.environmentId, threadId: scope.thread.threadId },
    callerId: scope.thread.providerSessionId,
    credentialAuthorization: scope.credentialAuthorization,
    authorizeSelection: (select) =>
      withAuthorization(true, select).pipe(
        Effect.provide(context),
        Effect.mapError(() => ({ code: "target_invalid" as const })),
      ),
  };
  return yield* withAuthorization(operate, (authorization) => run(service, caller, authorization));
});

export const layer = McpToolAccess.toLayer(TerminalToolkit, {
  terminal_status: McpToolAccess.readsAsCaller((input) =>
    invoke(false, (service, caller) => service.status(caller, input)),
  ),
  terminal_bind: McpToolAccess.actsAsCaller((input) =>
    invoke(true, (service, caller, authorization) => service.bind(caller, input, authorization)),
  ),
  terminal_read: McpToolAccess.readsAsCaller((input) =>
    invoke(false, (service, caller, authorization) => service.read(caller, input, authorization)),
  ),
  terminal_input: McpToolAccess.actsAsCaller((input) =>
    invoke(true, (service, caller, authorization) => service.input(caller, input, authorization)),
  ),
  terminal_release: McpToolAccess.actsAsCaller((input) =>
    invoke(true, (service, caller) => service.release(caller, input)),
  ),
});
