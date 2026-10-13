/** Verifies destination grants for command availability and execution; controlled sessions supply permissions. */
import { requestGuarded, runStreamGuarded } from "../rpc/client.ts";
import { EnvironmentSupervisor } from "../connection/supervisor.ts";
import * as SubscriptionRef from "effect/SubscriptionRef";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import type { RpcSession } from "../rpc/session.ts";
import { describe, expect, it } from "@effect/vitest";
import { vi } from "vite-plus/test";
import {
  AuthOrchestrationOperateScope,
  AuthSettingsWriteScope,
  AuthSourceControlWriteScope,
  ThreadId,
  DiscussionId,
  DiscussionSeatId,
  type ServerConfig,
  EnvironmentId,
  ScheduledTaskId,
  WS_METHODS,
  ORCHESTRATION_V2_WS_METHODS,
  type AuthSessionState,
} from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Deferred from "effect/Deferred";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as TestClock from "effect/testing/TestClock";
import { Atom, AtomRegistry, AsyncResult } from "effect/reactivity";
import { EnvironmentRegistry } from "../connection/registry.ts";
import { createCommandPermissions } from "./commandPermissions.ts";
import { createEnvironmentRpcCommand } from "./runtime.ts";
import { createServerEnvironmentAtoms } from "./server.ts";
import { EnvironmentCacheStore } from "../platform/persistence.ts";

vi.mock("./session.ts", () => ({
  createEnvironmentSessionAtoms: () => ({ sessionStateAtom: sessions }),
}));
const sessions = Atom.family((_id: EnvironmentId) =>
  Atom.make<AsyncResult.AsyncResult<AuthSessionState, string>>(AsyncResult.initial()),
);
const env = EnvironmentId.make("target");
const other = EnvironmentId.make("other");
const grant = (allowed: boolean): AuthSessionState => ({
  authenticated: true,
  auth: {
    policy: "remote-reachable",
    bootstrapMethods: [],
    sessionMethods: [],
    sessionCookieName: "test",
  },
  scopes: allowed ? [AuthOrchestrationOperateScope] : [],
  permissions: allowed ? [AuthOrchestrationOperateScope] : [],
});
const runtime = Atom.runtime(
  Layer.succeed(EnvironmentRegistry, {
    run: (_id: EnvironmentId, effect: Effect.Effect<unknown>) => effect,
  } as unknown as EnvironmentRegistry["Service"]),
);
const permissions = createCommandPermissions(runtime, WS_METHODS.scheduledTasksDelete);
const setup = Effect.gen(function* () {
  const registry = AtomRegistry.make();
  registry.mount(sessions(env));
  yield* Effect.addFinalizer(() => Effect.sync(() => registry.dispose()));
  return registry;
});

/**
 * Creates real discussion commands with observable RPCs and a blocked first interjection.
 * @returns Command registry, arrival records and explicit entry/completion gates.
 * The scope owns the registry; no live environment or database is accessed.
 */
const discussionPermissionHarness = Effect.fn("DiscussionPermissionTest.harness")(function* () {
  const entered = yield* Deferred.make<void>();
  const release = yield* Deferred.make<void>();
  const calls: string[] = [];
  const client = Object.fromEntries(
    [
      WS_METHODS.discussionsInterject,
      WS_METHODS.discussionsStop,
      WS_METHODS.discussionsContinue,
      WS_METHODS.discussionsEnd,
      WS_METHODS.discussionsDelete,
    ].map((method) => [
      method,
      () =>
        Effect.gen(function* () {
          calls.push(method);
          if (method === WS_METHODS.discussionsInterject) {
            yield* Deferred.succeed(entered, undefined);
            yield* Deferred.await(release);
          }
          return {};
        }),
    ]),
  );
  // These acknowledgements are deliberately unused; permission tests observe RPC entry only.
  const supervisor = {
    target: { environmentId: env, label: "test" },
    session: yield* SubscriptionRef.make(Option.some({ client } as unknown as RpcSession)),
  } as unknown as EnvironmentSupervisor["Service"];
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
  const discussionRuntime = Atom.runtime(
    Layer.mergeAll(
      Layer.succeed(EnvironmentCacheStore, cache),
      Layer.succeed(EnvironmentRegistry, {
        run: (_id: EnvironmentId, effect: Effect.Effect<unknown>) =>
          Effect.provideService(effect, EnvironmentSupervisor, supervisor),
      } as unknown as EnvironmentRegistry["Service"]),
    ),
  );
  const commands = createServerEnvironmentAtoms(discussionRuntime, {
    initialConfigValueAtom: () => Atom.make<ServerConfig | null>(null),
  });
  const registry = yield* Effect.acquireRelease(Effect.sync(AtomRegistry.make), (registry) =>
    Effect.sync(() => registry.dispose()),
  );
  registry.mount(sessions(env));
  return { registry, commands, calls, entered, release };
});

describe("discussion command permissions", () => {
  it.effect("denies all five real lifecycle commands without the destination operate grant", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const h = yield* discussionPermissionHarness();
        h.registry.set(sessions(env), AsyncResult.success(grant(false)));
        const target = {
          environmentId: env,
          input: { discussionId: DiscussionId.make("discussion") },
        };
        for (const command of [
          h.commands.interjectDiscussion,
          h.commands.stopDiscussion,
          h.commands.continueDiscussion,
          h.commands.endDiscussion,
          h.commands.deleteDiscussion,
        ])
          expect(h.registry.get(command.permissionAtom(env))).toBe(false);
        const invoke = () =>
          Promise.all([
            h.commands.interjectDiscussion.run(h.registry, {
              ...target,
              input: { ...target.input, text: "idea" },
            }),
            h.commands.stopDiscussion.run(h.registry, target),
            h.commands.continueDiscussion.run(h.registry, target),
            h.commands.endDiscussion.run(h.registry, {
              ...target,
              input: { ...target.input, summarizerSeatId: DiscussionSeatId.make("seat") },
            }),
            h.commands.deleteDiscussion.run(h.registry, target),
          ]);
        const results = yield* Effect.promise(invoke);
        expect(results.map((result) => result._tag)).toEqual([
          "Failure",
          "Failure",
          "Failure",
          "Failure",
          "Failure",
        ]);
        expect(h.calls).toEqual([]);
        // Prove every replacement RPC is reachable; denial must not pass because the harness is broken.
        h.registry.set(sessions(env), AsyncResult.success(grant(true)));
        yield* Deferred.succeed(h.release, undefined);
        const allowed = yield* Effect.promise(invoke);
        expect(allowed.map((result) => result._tag)).toEqual([
          "Success",
          "Success",
          "Success",
          "Success",
          "Success",
        ]);
        expect(h.calls).toEqual([
          WS_METHODS.discussionsInterject,
          WS_METHODS.discussionsStop,
          WS_METHODS.discussionsContinue,
          WS_METHODS.discussionsEnd,
          WS_METHODS.discussionsDelete,
        ]);
      }),
    ),
  );
  it.effect("rechecks the operate grant when a queued discussion command reaches its turn", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const h = yield* discussionPermissionHarness();
        h.registry.set(sessions(env), AsyncResult.success(grant(true)));
        const target = {
          environmentId: env,
          input: { discussionId: DiscussionId.make("discussion") },
        };
        expect(h.registry.get(h.commands.stopDiscussion.permissionAtom(env))).toBe(true);
        const first = h.commands.interjectDiscussion.run(h.registry, {
          ...target,
          input: { ...target.input, text: "idea" },
        });
        yield* Deferred.await(h.entered);
        const second = h.commands.stopDiscussion.run(h.registry, target);
        yield* Effect.yieldNow;
        expect(h.calls).toEqual([WS_METHODS.discussionsInterject]);
        h.registry.set(sessions(env), AsyncResult.success(grant(false)));
        yield* Deferred.succeed(h.release, undefined);
        const results = yield* Effect.promise(() => Promise.all([first, second]));
        expect(results.map((result) => result._tag)).toEqual(["Success", "Failure"]);
        expect(h.calls).toEqual([WS_METHODS.discussionsInterject]);
      }),
    ),
  );
});

describe("command permissions", () => {
  it.effect("requires the destination operate grant to export conversations", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const registry = yield* setup;
        const exportPermissions = createCommandPermissions(
          runtime,
          ORCHESTRATION_V2_WS_METHODS.exportTranscript,
        );
        registry.set(sessions(env), AsyncResult.success(grant(false)));
        expect(registry.get(exportPermissions.permissionAtom(env))).toBe(false);
        expect((yield* Effect.flip(exportPermissions.authorize(registry, env)))._tag).toBe(
          "EnvironmentAuthorizationError",
        );
        registry.set(sessions(env), AsyncResult.success(grant(true)));
        expect(registry.get(exportPermissions.permissionAtom(env))).toBe(true);
        yield* exportPermissions.authorize(registry, env);
        registry.set(sessions(other), AsyncResult.success(grant(false)));
        expect(registry.get(exportPermissions.permissionAtom(other))).toBe(false);
      }),
    ),
  );
  it.effect("requires the destination settings grant to run storage cleanup", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const registry = yield* setup;
        const cleanup = createCommandPermissions(runtime, WS_METHODS.serverRunStorageCleanup);
        registry.set(sessions(env), AsyncResult.success(grant(true)));
        expect(registry.get(cleanup.permissionAtom(env))).toBe(false);
        expect((yield* cleanup.authorize(registry, env).pipe(Effect.flip))._tag).toBe(
          "EnvironmentAuthorizationError",
        );
        registry.set(
          sessions(env),
          AsyncResult.success({
            ...grant(true),
            scopes: [AuthSettingsWriteScope],
            permissions: [AuthSettingsWriteScope],
          }),
        );
        expect(registry.get(cleanup.permissionAtom(env))).toBe(true);
        yield* cleanup.authorize(registry, env);
        registry.set(sessions(other), AsyncResult.success(grant(false)));
        expect(registry.get(cleanup.permissionAtom(other))).toBe(false);
      }),
    ),
  );

  it.effect("requires the destination settings grant to check OTLP endpoints", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const registry = yield* setup;
        const check = createCommandPermissions(runtime, WS_METHODS.serverCheckOtlpEndpoint);
        registry.set(sessions(env), AsyncResult.success(grant(true)));
        expect(registry.get(check.permissionAtom(env))).toBe(false);
        registry.set(
          sessions(env),
          AsyncResult.success({
            ...grant(false),
            scopes: [AuthSettingsWriteScope],
            permissions: [AuthSettingsWriteScope],
          }),
        );
        expect(registry.get(check.permissionAtom(env))).toBe(true);
        yield* check.authorize(registry, env);
      }),
    ),
  );

  it.effect("uses the target grant for both availability and execution", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const registry = yield* setup;
        registry.set(sessions(env), AsyncResult.success(grant(true)));
        expect(registry.get(permissions.permissionAtom(env))).toBe(true);
        expect(permissions.permissionAtom(env)).toBe(permissions.permissionAtom(env));
        yield* permissions.authorize(registry, env);
        registry.set(sessions(other), AsyncResult.success(grant(false)));
        expect(registry.get(permissions.permissionAtom(other))).toBe(false);
        const denied = yield* permissions.authorize(registry, other).pipe(Effect.flip);
        expect(denied._tag).toBe("EnvironmentAuthorizationError");
      }),
    ),
  );
  it.effect("waits for an initial grant", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const registry = yield* setup;
        const fiber = yield* permissions.authorize(registry, env).pipe(Effect.forkChild);
        yield* Effect.yieldNow;
        registry.set(sessions(env), AsyncResult.success(grant(true)));
        yield* Fiber.join(fiber);
      }),
    ),
  );
  it.effect("bounds a session that never loads", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const registry = yield* setup;
        const fiber = yield* permissions
          .authorize(registry, env)
          .pipe(Effect.flip, Effect.forkChild);
        yield* TestClock.adjust("6 seconds");
        expect((yield* Fiber.join(fiber))._tag).toBe("EnvironmentAuthorizationError");
      }),
    ),
  );
  it.effect(
    "denies failed and unauthenticated sessions, but accepts a cached refreshing grant",
    () =>
      Effect.scoped(
        Effect.gen(function* () {
          const registry = yield* setup;
          registry.set(sessions(env), AsyncResult.failure(Cause.fail("offline")));
          expect((yield* permissions.authorize(registry, env).pipe(Effect.flip))._tag).toBe(
            "EnvironmentAuthorizationError",
          );
          registry.set(
            sessions(env),
            AsyncResult.success({ ...grant(true), authenticated: false }),
          );
          expect((yield* permissions.authorize(registry, env).pipe(Effect.flip))._tag).toBe(
            "EnvironmentAuthorizationError",
          );
          registry.set(sessions(env), AsyncResult.waiting(AsyncResult.success(grant(true))));
          yield* permissions.authorize(registry, env);
        }),
      ),
  );
  it("rechecks permission after waiting in a serial command lane", async () => {
    const registry = AtomRegistry.make();
    const unmount = registry.mount(sessions(env));
    registry.set(sessions(env), AsyncResult.success(grant(true)));
    let release!: () => void;
    let started!: () => void;
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let calls = 0;
    const command = createEnvironmentRpcCommand(runtime, {
      label: "test.delete",
      tag: WS_METHODS.scheduledTasksDelete,
      concurrency: { mode: "serial", key: () => "target" },
      execute: () =>
        Effect.promise(async () => {
          calls++;
          started();
          await gate;
          return { id: ScheduledTaskId.make("task") };
        }),
    });
    const target = { environmentId: env, input: { id: ScheduledTaskId.make("task") } };
    try {
      const first = command.run(registry, target);
      await entered;
      const second = command.run(registry, target);
      registry.set(sessions(env), AsyncResult.success(grant(false)));
      release();
      expect((await first)._tag).toBe("Success");
      expect((await second)._tag).toBe("Failure");
      expect(calls).toBe(1);
    } finally {
      unmount();
      registry.dispose();
    }
  });
});

it.effect(
  "requires source control alone for git, and both grants when attaching a worktree to a thread",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const registry = yield* setup;
        registry.set(sessions(env), AsyncResult.success(grant(true)));
        const git = createCommandPermissions(runtime, WS_METHODS.vcsInit);
        expect((yield* git.authorize(registry, env).pipe(Effect.flip)).requiredPermission).toBe(
          AuthSourceControlWriteScope,
        );
        registry.set(
          sessions(env),
          AsyncResult.success({
            ...grant(false),
            scopes: [AuthSourceControlWriteScope],
            permissions: [AuthSourceControlWriteScope],
          }),
        );
        yield* git.authorize(registry, env);
        const prepare = createCommandPermissions(runtime, WS_METHODS.gitPreparePullRequestThread);
        const input = {
          cwd: "/repo",
          reference: "123",
          mode: "worktree",
          threadId: ThreadId.make("thread"),
        };
        expect(registry.get(prepare.permissionAtom(env, input))).toBe(false);
        expect(
          (yield* prepare.authorize(registry, env, input).pipe(Effect.flip)).requiredScope,
        ).toBe(AuthOrchestrationOperateScope);
        yield* prepare.authorize(registry, env, { ...input, threadId: undefined });
        registry.set(
          sessions(env),
          AsyncResult.success({
            ...grant(true),
            scopes: [AuthSourceControlWriteScope, AuthOrchestrationOperateScope],
            permissions: [AuthSourceControlWriteScope, AuthOrchestrationOperateScope],
          }),
        );
        expect(registry.get(prepare.permissionAtom(env, input))).toBe(true);
        yield* prepare.authorize(registry, env, input);
      }),
    ),
);

it.effect("honors exact empty permissions and preserves legacy parent grants", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const registry = yield* setup;
      const git = createCommandPermissions(runtime, WS_METHODS.vcsInit);
      registry.set(sessions(env), AsyncResult.success({ ...grant(true), permissions: [] }));
      expect(registry.get(git.permissionAtom(env))).toBe(false);
      const denied = yield* git.authorize(registry, env).pipe(Effect.flip);
      expect(denied).toMatchObject({
        requiredPermission: AuthSourceControlWriteScope,
        requiredScope: AuthOrchestrationOperateScope,
      });
      const { permissions: _exact, ...legacy } = grant(true);
      registry.set(sessions(env), AsyncResult.success(legacy));
      expect(registry.get(git.permissionAtom(env))).toBe(true);
      yield* git.authorize(registry, env);
    }),
  ),
);

it.effect("rejects protected unary and streamed RPCs outside a guarded command", () =>
  Effect.gen(function* () {
    let writes = 0;
    const session = {
      client: {
        [WS_METHODS.scheduledTasksDelete]: () =>
          Effect.sync(() => {
            writes++;
            return { id: ScheduledTaskId.make("task") };
          }),
        [WS_METHODS.gitRunStackedAction]: () =>
          Stream.fromEffect(
            Effect.sync(() => {
              writes++;
            }),
          ),
      },
    } as unknown as RpcSession;
    const supervisor = {
      target: { environmentId: env, label: "target" },
      session: yield* SubscriptionRef.make(Option.some(session)),
    } as unknown as EnvironmentSupervisor["Service"];
    const unary = yield* requestGuarded(WS_METHODS.scheduledTasksDelete, {
      id: ScheduledTaskId.make("task"),
    }).pipe(Effect.provideService(EnvironmentSupervisor, supervisor), Effect.flip);
    expect(unary._tag).toBe("EnvironmentAuthorizationError");
    const streamed = yield* runStreamGuarded(WS_METHODS.gitRunStackedAction, {
      actionId: "test-action",
      cwd: "/repo",
      action: "commit",
    }).pipe(Stream.runDrain, Effect.provideService(EnvironmentSupervisor, supervisor), Effect.flip);
    expect(streamed._tag).toBe("EnvironmentAuthorizationError");
    expect(writes).toBe(0);
  }),
);
