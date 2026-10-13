/** Verifies the actual discussion command atoms against a controlled RPC session, without running providers. */
import { describe, expect, it } from "@effect/vitest";
import { vi } from "vite-plus/test";
import {
  AuthOrchestrationOperateScope,
  DiscussionError,
  DiscussionId,
  DiscussionSeatId,
  EnvironmentId,
  WS_METHODS,
  type AuthSessionState,
  type Discussion,
  type DiscussionEntry,
  type ServerConfig,
} from "@t3tools/contracts";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Queue from "effect/Queue";
import * as SubscriptionRef from "effect/SubscriptionRef";
import { AsyncResult, Atom, AtomRegistry } from "effect/reactivity";
import { EnvironmentRegistry } from "../connection/registry.ts";
import { EnvironmentSupervisor } from "../connection/supervisor.ts";
import { EnvironmentCacheStore } from "../platform/persistence.ts";
import type { RpcSession } from "../rpc/session.ts";
import { createServerEnvironmentAtoms } from "./server.ts";

vi.mock("./session.ts", () => ({
  createEnvironmentSessionAtoms: () => ({ sessionStateAtom: sessions }),
}));
const sessions = Atom.family((_id: EnvironmentId) =>
  Atom.make<AsyncResult.AsyncResult<AuthSessionState, string>>(AsyncResult.initial()),
);
const env = EnvironmentId.make("env-a");
const otherEnv = EnvironmentId.make("env-b");
const id = DiscussionId.make("discussion-a");
const otherId = DiscussionId.make("discussion-b");
const grant: AuthSessionState = {
  authenticated: true,
  auth: {
    policy: "remote-reachable",
    bootstrapMethods: [],
    sessionMethods: [],
    sessionCookieName: "test",
  },
  scopes: [AuthOrchestrationOperateScope],
  permissions: [AuthOrchestrationOperateScope],
};

/**
 * Builds real server command atoms with a blocked interjection RPC and observable lifecycle RPCs.
 * @returns Isolated registry, command atoms, arrival records and an explicit interjection completion gate.
 * No subscriptions, persistence writes or provider executions occur; the scope disposes the registry.
 */
const makeHarness = Effect.fn("DiscussionCommandsTest.makeHarness")(function* () {
  const entered = yield* Queue.unbounded<string>();
  const release = yield* Deferred.make<void, DiscussionError>();
  const arrivals: string[] = [];
  // Results are unused acknowledgements: these tests assert RPC arrival order, not snapshot contents.
  const discussion = {} as Discussion;
  const entry = {} as DiscussionEntry;
  const supervisorFor = (environmentId: EnvironmentId) =>
    Effect.gen(function* () {
      const record = (method: string, discussionId: DiscussionId) =>
        Effect.sync(() => {
          const arrival = `${environmentId}:${discussionId}:${method}`;
          arrivals.push(arrival);
          return arrival;
        });
      const client = {
        [WS_METHODS.discussionsInterject]: ({ discussionId }: { discussionId: DiscussionId }) =>
          Effect.gen(function* () {
            const arrival = yield* record("interject", discussionId);
            yield* Queue.offer(entered, arrival);
            yield* Deferred.await(release);
            return { entry };
          }),
        [WS_METHODS.discussionsStop]: ({ discussionId }: { discussionId: DiscussionId }) =>
          record("stop", discussionId).pipe(Effect.as({ discussion })),
        [WS_METHODS.discussionsContinue]: ({ discussionId }: { discussionId: DiscussionId }) =>
          record("continue", discussionId).pipe(Effect.as({ discussion })),
        [WS_METHODS.discussionsEnd]: ({ discussionId }: { discussionId: DiscussionId }) =>
          record("end", discussionId).pipe(Effect.as({ discussion })),
        [WS_METHODS.discussionsDelete]: ({ discussionId }: { discussionId: DiscussionId }) =>
          record("delete", discussionId).pipe(Effect.as({ discussionId })),
      };
      return {
        target: { environmentId, label: environmentId },
        session: yield* SubscriptionRef.make(Option.some({ client } as unknown as RpcSession)),
      } as unknown as EnvironmentSupervisor["Service"];
    });
  const supervisor = yield* supervisorFor(env);
  const otherSupervisor = yield* supervisorFor(otherEnv);
  const environments = {
    run: (environmentId: EnvironmentId, effect: Effect.Effect<unknown>) =>
      Effect.provideService(
        effect,
        EnvironmentSupervisor,
        environmentId === env ? supervisor : otherSupervisor,
      ),
  } as unknown as EnvironmentRegistry["Service"];
  const cache = EnvironmentCacheStore.of({
    loadShell: () => Effect.succeedNone,
    saveShell: () => Effect.void,
    loadThread: () => Effect.succeedNone,
    saveThread: () => Effect.void,
    removeThread: () => Effect.void,
    loadServerConfig: () => Effect.succeedNone,
    saveServerConfig: () => Effect.void,
    loadVcsRefs: () => Effect.succeedNone,
    saveVcsRefs: () => Effect.void,
    removeVcsRefs: () => Effect.void,
    clearVcsRefs: () => Effect.void,
    clear: () => Effect.void,
  });
  const runtime = Atom.runtime(
    Layer.mergeAll(
      Layer.succeed(EnvironmentRegistry, environments),
      Layer.succeed(EnvironmentCacheStore, cache),
    ),
  );
  const commands = createServerEnvironmentAtoms(runtime, {
    initialConfigValueAtom: () => Atom.make<ServerConfig | null>(null),
  });
  const registry = yield* Effect.acquireRelease(Effect.sync(AtomRegistry.make), (registry) =>
    Effect.sync(() => registry.dispose()),
  );
  registry.mount(sessions(env));
  registry.mount(sessions(otherEnv));
  registry.set(sessions(env), AsyncResult.success(grant));
  registry.set(sessions(otherEnv), AsyncResult.success(grant));
  return { registry, commands, entered, release, arrivals };
});

describe("discussion command lanes", () => {
  it.effect("keeps all five commands in click order until the interjection finishes", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const h = yield* makeHarness();
        const first = h.commands.interjectDiscussion.run(h.registry, {
          environmentId: env,
          input: { discussionId: id, text: "idea" },
        });
        yield* Queue.take(h.entered);
        const stop = h.commands.stopDiscussion.run(h.registry, {
          environmentId: env,
          input: { discussionId: id },
        });
        const resume = h.commands.continueDiscussion.run(h.registry, {
          environmentId: env,
          input: { discussionId: id },
        });
        const end = h.commands.endDiscussion.run(h.registry, {
          environmentId: env,
          input: { discussionId: id, summarizerSeatId: DiscussionSeatId.make("seat") },
        });
        const remove = h.commands.deleteDiscussion.run(h.registry, {
          environmentId: env,
          input: { discussionId: id },
        });
        yield* Effect.yieldNow;
        expect(h.arrivals).toEqual(["env-a:discussion-a:interject"]);
        yield* Deferred.succeed(h.release, undefined);
        const results = yield* Effect.promise(() =>
          Promise.all([first, stop, resume, end, remove]),
        );
        expect(results.map((result) => result._tag)).toEqual([
          "Success",
          "Success",
          "Success",
          "Success",
          "Success",
        ]);
        expect(h.arrivals).toEqual([
          "env-a:discussion-a:interject",
          "env-a:discussion-a:stop",
          "env-a:discussion-a:continue",
          "env-a:discussion-a:end",
          "env-a:discussion-a:delete",
        ]);
      }),
    ),
  );
  it.effect("runs the next command after the prior RPC fails", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const h = yield* makeHarness();
        const first = h.commands.interjectDiscussion.run(h.registry, {
          environmentId: env,
          input: { discussionId: id, text: "idea" },
        });
        yield* Queue.take(h.entered);
        const stop = h.commands.stopDiscussion.run(h.registry, {
          environmentId: env,
          input: { discussionId: id },
        });
        yield* Deferred.fail(
          h.release,
          new DiscussionError({ reason: "invalid_state", message: "controlled failure" }),
        );
        const results = yield* Effect.promise(() => Promise.all([first, stop]));
        expect(results.map((result) => result._tag)).toEqual(["Failure", "Success"]);
        expect(h.arrivals).toEqual(["env-a:discussion-a:interject", "env-a:discussion-a:stop"]);
      }),
    ),
  );
  it.effect(
    "lets another discussion and another environment finish while this discussion waits",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const h = yield* makeHarness();
          const first = h.commands.interjectDiscussion.run(h.registry, {
            environmentId: env,
            input: { discussionId: id, text: "idea" },
          });
          yield* Queue.take(h.entered);
          const otherDiscussion = h.commands.stopDiscussion.run(h.registry, {
            environmentId: env,
            input: { discussionId: otherId },
          });
          const otherEnvironment = h.commands.stopDiscussion.run(h.registry, {
            environmentId: otherEnv,
            input: { discussionId: id },
          });
          yield* Effect.yieldNow;
          expect(h.arrivals).toEqual([
            "env-a:discussion-a:interject",
            "env-a:discussion-b:stop",
            "env-b:discussion-a:stop",
          ]);
          const results = yield* Effect.promise(() =>
            Promise.all([otherDiscussion, otherEnvironment]),
          );
          expect(results.map((result) => result._tag)).toEqual(["Success", "Success"]);
          yield* Deferred.succeed(h.release, undefined);
          expect((yield* Effect.promise(() => first))._tag).toBe("Success");
        }),
      ),
  );
});
