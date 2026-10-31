/** Verifies pool lifecycle and shared startup health without launching native processes or windows. */
import * as DesktopUiLocale from "../i18n/DesktopUiLocale.ts";
import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Deferred from "effect/Deferred";
import * as Duration from "effect/Duration";
import * as Sink from "effect/Sink";
import * as SubscriptionRef from "effect/SubscriptionRef";
import * as TestClock from "effect/testing/TestClock";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Logger from "effect/Logger";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as References from "effect/References";
import * as Stream from "effect/Stream";
import { HttpClient, HttpClientResponse } from "effect/http";
import { ChildProcessSpawner } from "effect/process";

import * as DesktopObservability from "../app/DesktopObservability.ts";
import * as DesktopState from "../app/DesktopState.ts";
import * as DesktopAppSettings from "../settings/DesktopAppSettings.ts";
import * as DesktopTelemetryPublisher from "../telemetry/DesktopTelemetryPublisher.ts";
import * as DesktopBrowserHost from "../preview/DesktopBrowserHost.ts";
import * as ElectronDialog from "../electron/ElectronDialog.ts";
import * as ElectronApp from "../electron/ElectronApp.ts";
import * as ElectronWindow from "../electron/ElectronWindow.ts";
import * as DesktopWindow from "../window/DesktopWindow.ts";
import * as DesktopWslEnvironment from "../wsl/DesktopWslEnvironment.ts";
import * as DesktopBackendConfiguration from "./DesktopBackendConfiguration.ts";
import * as DesktopBackendPool from "./DesktopBackendPool.ts";
import type { DesktopBackendStartConfig } from "./DesktopBackendManager.ts";

const startupConfig: DesktopBackendStartConfig = {
  executablePath: "/electron",
  args: [],
  entryPath: "/server/bin.mjs",
  cwd: "/server",
  env: {},
  bootstrap: {
    mode: "desktop",
    noBrowser: true,
    port: 3773,
    t3Home: "/tmp/t3",
    host: "127.0.0.1",
    desktopBootstrapToken: "token",
    tailscaleServeEnabled: false,
    tailscaleServePort: 443,
  },
  bootstrapDelivery: "fd3",
  extendEnv: true,
  httpBaseUrl: new URL("http://127.0.0.1:3773"),
  captureOutput: false,
  preflightFailure: Option.none(),
  // Runtime pruning follows the complete readiness callback, including its handled window error.
  runningDistro: "Ubuntu",
  wslRuntimeId: "test-runtime",
};

/** Builds the real pool and manager with controlled process, HTTP and window boundaries. */
function layerPool(
  labelRef: Ref.Ref<string>,
  options: {
    primaryConfig?: DesktopBackendStartConfig;
    locale?: "en" | "zh-CN";
    showErrorBox?: ElectronDialog.ElectronDialog["Service"]["showErrorBox"];
    readyWindow?: DesktopWindow.DesktopWindow["Service"]["handleBackendReady"];
    readinessFinished?: Effect.Effect<void>;
  } = {},
): Layer.Layer<DesktopBackendPool.DesktopBackendPool | DesktopState.DesktopState> {
  return DesktopBackendPool.layer.pipe(
    Layer.provide(DesktopUiLocale.layerTest(options.locale)),
    Layer.provideMerge(
      Layer.mergeAll(
        FileSystem.layerNoop({ exists: () => Effect.succeed(options.readyWindow !== undefined) }),
        Layer.succeed(
          ChildProcessSpawner.ChildProcessSpawner,
          ChildProcessSpawner.make(() =>
            Effect.succeed(
              ChildProcessSpawner.makeHandle({
                pid: ChildProcessSpawner.ProcessId(123),
                exitCode: Effect.never,
                isRunning: Effect.succeed(false),
                kill: () => Effect.void,
                unref: Effect.succeed(Effect.void),
                stdin: Sink.drain,
                stdout: Stream.empty,
                stderr: Stream.empty,
                all: Stream.empty,
                getInputFd: () => Sink.drain,
                getOutputFd: () => Stream.empty,
              }),
            ),
          ),
        ),
        Layer.succeed(
          HttpClient.HttpClient,
          HttpClient.make((request) =>
            Effect.succeed(
              HttpClientResponse.fromWeb(request, new Response(null, { status: 200 })),
            ),
          ),
        ),
        Layer.succeed(DesktopObservability.DesktopBackendOutputLogFactory, {
          forInstance: () =>
            Effect.succeed({
              beginSession: () => Effect.void,
              writeOutputChunk: () => Effect.void,
              persistFailureSnapshot: () => Effect.void,
              persistFailure: () => Effect.void,
              discardSession: Effect.void,
            } satisfies DesktopObservability.DesktopBackendOutputLogShape),
        } satisfies DesktopObservability.DesktopBackendOutputLogFactory["Service"]),
        Layer.succeed(DesktopTelemetryPublisher.DesktopTelemetryPublisher, {
          latest: Effect.succeedNone,
          changes: Stream.empty,
          encoded: Stream.empty,
          handleControlForSource: () => Effect.void,
          removeControlSource: () => Effect.void,
          publishUpdateReport: () => Effect.void,
          updateRequests: Stream.empty,
          updateCommits: Stream.empty,
          updateCancellations: Stream.empty,
        }),
        DesktopBrowserHost.layer,
        Layer.succeed(DesktopBackendConfiguration.DesktopBackendConfiguration, {
          resolvePrimary: options.primaryConfig
            ? Effect.succeed(options.primaryConfig)
            : Effect.die("unexpected primary config resolve"),
          resolvePrimaryLabel: Ref.get(labelRef),
          resolveWsl: () => Effect.die("unexpected WSL config resolve"),
          currentBootstrapToken: Effect.die("unexpected bootstrap token read"),
        } satisfies DesktopBackendConfiguration.DesktopBackendConfiguration["Service"]),
        DesktopAppSettings.layerTest(),
        DesktopState.layer,
        DesktopWslEnvironment.layerTest({
          pruneRuntimes: () => options.readinessFinished ?? Effect.void,
        }),
        Layer.succeed(ElectronDialog.ElectronDialog, {
          ...ElectronDialog.make,
          showErrorBox: options.showErrorBox ?? ElectronDialog.make.showErrorBox,
        }),
        ElectronApp.layer,
        Layer.succeed(DesktopWindow.DesktopWindow, {
          createMain: Effect.die("unexpected window create"),
          ensureMain: Effect.die("unexpected window ensure"),
          revealOrCreateMain: Effect.die("unexpected window reveal"),
          activate: Effect.die("unexpected window activate"),
          createMainIfBackendReady: Effect.die("unexpected window create"),
          showConnectingSplash: Effect.void,
          handleBackendReady: options.readyWindow ?? (() => Effect.void),
          handleBackendNotReady: Effect.void,
          flushMainWindowBounds: Effect.void,
          prepareCaptureReveal: Effect.void,
          dispatchMenuAction: () => Effect.die("unexpected menu action"),
          dispatchSnapShotEvent: () => Effect.void,
          zoomMain: () => Effect.die("unexpected zoom"),
          runMainContentsCommand: () => Effect.die("unexpected main contents command"),
          syncAppearance: Effect.void,
        } satisfies DesktopWindow.DesktopWindow["Service"]),
      ),
    ),
  );
}

describe("DesktopBackendPool", () => {
  it.effect("publishes repeated startup failures to shared recovery state", () =>
    Effect.gen(function* () {
      const pool = yield* DesktopBackendPool.DesktopBackendPool;
      const state = yield* DesktopState.DesktopState;
      const primary = yield* pool.primary;
      yield* primary.start;
      yield* TestClock.adjust(Duration.seconds(4));
      assert.deepEqual(yield* SubscriptionRef.get(state.primaryBackendStartup), {
        _tag: "Failing",
        reason: "The server could not start (missing server entry at /server/bin.mjs).",
        output: "",
      });
    }).pipe(Effect.provide(layerPool(Ref.makeUnsafe("Windows"), { primaryConfig: startupConfig }))),
  );

  it.effect("publishes Ready only after the main window finishes opening", () =>
    Effect.gen(function* () {
      const entered = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();
      const finished = yield* Deferred.make<void>();
      yield* Effect.gen(function* () {
        const pool = yield* DesktopBackendPool.DesktopBackendPool;
        const state = yield* DesktopState.DesktopState;
        yield* (yield* pool.primary).start;
        yield* Deferred.await(entered);
        assert.deepEqual(yield* SubscriptionRef.get(state.primaryBackendStartup), {
          _tag: "Starting",
        });
        yield* Deferred.succeed(release, undefined);
        yield* Deferred.await(finished);
        assert.deepEqual(yield* SubscriptionRef.get(state.primaryBackendStartup), {
          _tag: "Ready",
        });
      }).pipe(
        Effect.provide(
          layerPool(Ref.makeUnsafe("Windows"), {
            primaryConfig: startupConfig,
            readyWindow: () =>
              Deferred.succeed(entered, undefined).pipe(Effect.andThen(Deferred.await(release))),
            readinessFinished: Deferred.succeed(finished, undefined).pipe(Effect.asVoid),
          }),
        ),
      );
    }),
  );

  it.effect("keeps recovery state non-Ready when main window creation fails", () =>
    Effect.gen(function* () {
      const finished = yield* Deferred.make<void>();
      yield* Effect.gen(function* () {
        const pool = yield* DesktopBackendPool.DesktopBackendPool;
        const state = yield* DesktopState.DesktopState;
        yield* (yield* pool.primary).start;
        yield* Deferred.await(finished);
        assert.deepEqual(yield* SubscriptionRef.get(state.primaryBackendStartup), {
          _tag: "Starting",
        });
      }).pipe(
        Effect.provide(
          layerPool(Ref.makeUnsafe("Windows"), {
            primaryConfig: startupConfig,
            readyWindow: () =>
              Effect.fail(
                new ElectronWindow.ElectronWindowCreateError({
                  cause: new Error("native window creation failed"),
                  options: {
                    title: null,
                    width: null,
                    height: null,
                    minWidth: null,
                    minHeight: null,
                    show: null,
                    modal: null,
                    frame: null,
                    transparent: null,
                    backgroundColor: null,
                    webPreferences: {
                      preload: null,
                      partition: null,
                      backgroundThrottling: null,
                      sandbox: null,
                      contextIsolation: null,
                      nodeIntegration: null,
                      webviewTag: null,
                    },
                  },
                }),
              ),
            readinessFinished: Deferred.succeed(finished, undefined).pipe(Effect.asVoid),
          }),
        ),
      );
    }),
  );
  it.effect.each([
    {
      name: "translates dependency failures without translating diagnostic reasons",
      reason:
        'WSL server dependencies could not be loaded (for example "node-pty"). The native packages the server needs are not unpacked where the WSL distro\'s Node can read them. This is a packaging problem with this build. Please report it.',
      displayedReason:
        '无法加载 WSL 服务端依赖（例如 "node-pty"）。服务端所需的原生包未解压到 WSL 发行版的 Node 可以读取的位置。这是此版本的打包问题，请报告此问题。',
    },
    {
      name: "preserves other preflight reasons in the dialog and diagnostics",
      reason: "WSL distro Ubuntu could not be started",
      displayedReason: "WSL distro Ubuntu could not be started",
    },
  ])("$name", ({ reason, displayedReason }) => {
    const dialogs: Array<{ title: string; content: string }> = [];
    const diagnosticReasons: Array<unknown> = [];
    const logger = Logger.make(({ fiber }) => {
      const annotations = fiber.getRef(References.CurrentLogAnnotations);
      if (annotations.component === "desktop-backend-pool") {
        diagnosticReasons.push(annotations.reason);
      }
    });
    const layer = layerPool(Ref.makeUnsafe("WSL (Ubuntu)"), {
      locale: "zh-CN",
      showErrorBox: (title, content) =>
        Effect.sync(() => {
          dialogs.push({ title, content });
        }),
      primaryConfig: {
        executablePath: "/electron",
        args: [],
        entryPath: "/server/bin.mjs",
        cwd: "/server",
        env: {},
        bootstrap: {
          mode: "desktop",
          noBrowser: true,
          port: 3774,
          t3Home: "/tmp/t3",
          host: "127.0.0.1",
          desktopBootstrapToken: "token",
          tailscaleServeEnabled: false,
          tailscaleServePort: 443,
        },
        bootstrapDelivery: "fd3",
        extendEnv: true,
        httpBaseUrl: new URL("http://127.0.0.1:3774"),
        captureOutput: false,
        // Surface the failure on the first start, without advancing a retry timer.
        preflightFailure: Option.some({ reason, fatal: true, retryLimit: 1 }),
      },
    });

    return Effect.scoped(
      Effect.gen(function* () {
        const pool = yield* DesktopBackendPool.DesktopBackendPool;
        const primary = yield* pool.primary;
        yield* primary.start;

        assert.deepEqual(dialogs, [
          {
            title: "WSL 后端无法启动",
            content: `${displayedReason}\n\n正在回退到 Windows 后端以打开 T3 Code。修复 WSL 发行版后，请在“设置 > 连接”中重新启用 WSL 后端。`,
          },
        ]);
        assert.deepEqual(diagnosticReasons, [reason]);
      }).pipe(
        Effect.provide(Layer.mergeAll(layer, Logger.layer([logger], { mergeWithExisting: false }))),
      ),
    );
  });

  it.effect("unregister stops the registered instance", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const id = DesktopBackendPool.BackendInstanceId("wsl:Ubuntu");
        const pool = yield* DesktopBackendPool.DesktopBackendPool;
        const instance = yield* pool.register({
          id,
          label: Effect.succeed("WSL (Ubuntu)"),
          configResolve: Effect.succeed({
            executablePath: "/electron",
            args: [],
            entryPath: "/server/bin.mjs",
            cwd: "/server",
            env: {},
            bootstrap: {
              mode: "desktop",
              noBrowser: true,
              port: 3774,
              t3Home: "/tmp/t3",
              host: "127.0.0.1",
              desktopBootstrapToken: "token",
              tailscaleServeEnabled: false,
              tailscaleServePort: 443,
            },
            bootstrapDelivery: "fd3",
            extendEnv: true,
            httpBaseUrl: new URL("http://127.0.0.1:3774"),
            captureOutput: false,
            preflightFailure: Option.some({ reason: "WSL starting", fatal: false }),
          } satisfies DesktopBackendStartConfig),
        });
        yield* instance.start;
        assert.equal((yield* instance.snapshot).restartScheduled, true);

        yield* pool.unregister(id);

        const stopped = yield* instance.snapshot;
        assert.equal(stopped.desiredRunning, false);
        assert.equal(stopped.restartScheduled, false);
        assert.equal(Option.isNone(yield* pool.get(id)), true);
      }).pipe(Effect.provide(layerPool(Ref.makeUnsafe("Windows")))),
    ),
  );
});
