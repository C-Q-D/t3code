#!/usr/bin/env node
/**
 * Starts the desktop dev app with a DevTools port, drives its main window, and stops it again, so
 * agents check UI in the real Electron window with one command per step. Run without arguments
 * for usage. Windows only.
 *
 * `start` runs dev:desktop under `lib/desktop-dev-keeper.ts`, which holds the whole process tree
 * in a kill-on-close job, and records that keeper's process id and creation time in
 * `%TEMP%/t3code-desktop-cdp/<port>.json`. `stop` ends the keeper only while both still match, so
 * a process that merely reuses the id is never touched.
 */
// @effect-diagnostics nodeBuiltinImport:off globalDate:off globalConsole:off preferSchemaOverJson:off - Host-side dev tool that owns a detached process tree and prints plain results for agents.
import * as NodeAssert from "node:assert/strict";
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeNet from "node:net";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeTimersPromises from "node:timers/promises";
import * as NodeUtil from "node:util";

import {
  connectDesktopPage,
  findAppPage,
  type ElementTarget,
  type PointTarget,
} from "./lib/desktop-cdp.ts";

const USAGE = `Usage:
  node scripts/desktop-cdp.ts start --port <port> --home-dir <dir> [--seed] [--timeout-seconds <n>]
  node scripts/desktop-cdp.ts stop --port <port>
  node scripts/desktop-cdp.ts shot --port <port> --out <file.png> [--selector <css> [--text <text>] [--pad <px>]]
  node scripts/desktop-cdp.ts click|hover --port <port> (--selector <css> [--text <text>] | --at <x>,<y>)
  node scripts/desktop-cdp.ts key --port <port> --key <Enter|Escape|Tab|ArrowDown|...>
  node scripts/desktop-cdp.ts type --port <port> --text <text>
  node scripts/desktop-cdp.ts eval --port <port> --expression <js>

start launches dev:desktop detached with that DevTools port, waits until the app page loads, and
returns; stop ends exactly the process tree start launched. --home-dir must be an isolated T3 home
(a worktree's .t3, or a temp directory), never ~/.t3. --seed first rebuilds its database from a
read-only snapshot of your real data (migrate-dev-db).

Each window command connects, raises the window if it is hidden, acts, and disconnects. Reduced
motion is off only while connected, so for anything animated write a flow script that imports
scripts/lib/desktop-cdp.ts and keeps one connection open.`;

const REPO_ROOT = NodePath.resolve(import.meta.dirname, "..");
const DEV_RUNNER = NodePath.join(REPO_ROOT, "scripts", "dev-runner.ts");
const KEEPER = NodePath.join(import.meta.dirname, "lib", "desktop-dev-keeper.ts");
const JOB_SCRIPT = NodePath.join(import.meta.dirname, "lib", "desktop-dev-job.ps1");
const LIVE_T3_HOME = NodePath.join(NodeOS.homedir(), ".t3");
const LAUNCH_DIRECTORY = NodePath.join(NodeOS.tmpdir(), "t3code-desktop-cdp");
const DEFAULT_START_TIMEOUT_SECONDS = 240;
const START_POLL_MS = 1_000;
const PORT_RELEASE_POLL_MS = 500;
const PORT_RELEASE_POLLS = 30;
// A refused loopback connection returns within milliseconds; only a stuck listener takes longer.
const PORT_PROBE_TIMEOUT_MS = 2_000;
// PowerShell startup plus Add-Type compiling the helper; seconds even on a cold machine.
const JOB_SCRIPT_TIMEOUT_MS = 60_000;
// Terminating a process is immediate; this only bounds an overloaded machine.
const KEEPER_EXIT_TIMEOUT_MS = 10_000;
const NOT_RUNNING_EXIT_CODE = 3;
const LOG_TAIL_LINES = 30;
// dev-runner prints these and keeps running or exits slowly; waiting for the page would only burn
// the whole timeout.
const FATAL_LOG_PATTERNS = [/DevRunnerProcessExitError/u, /Cannot find module/u];

/** What `start` leaves behind so that a later `stop` ends exactly the tree it launched. */
interface LaunchRecord {
  readonly keeperPid: number;
  /**
   * The keeper's creation time as a decimal FILETIME. Windows reuses process ids; the id together
   * with this names one process for good.
   */
  readonly keeperCreatedAt: string;
  readonly port: number;
  readonly homeDir: string;
  readonly log: string;
  readonly startedAt: string;
}

/** Shape check for a parsed launch record file; records from an older format fail it. */
const isLaunchRecord = (value: unknown): value is LaunchRecord =>
  typeof value === "object" &&
  value !== null &&
  "keeperPid" in value &&
  typeof value.keeperPid === "number" &&
  "keeperCreatedAt" in value &&
  typeof value.keeperCreatedAt === "string" &&
  "port" in value &&
  typeof value.port === "number" &&
  "homeDir" in value &&
  typeof value.homeDir === "string" &&
  "log" in value &&
  typeof value.log === "string" &&
  "startedAt" in value &&
  typeof value.startedAt === "string";

/** Where the record for DevTools `port` lives; one launch per port at a time. */
const launchRecordPath = (port: number) => NodePath.join(LAUNCH_DIRECTORY, `${port}.json`);

/**
 * The record `start` wrote for `port`, or `undefined` when there is none. Throws when the file
 * exists but is not a record, so the caller never acts on a half-understood file.
 */
const readLaunchRecord = (port: number): LaunchRecord | undefined => {
  const path = launchRecordPath(port);
  if (!NodeFS.existsSync(path)) return undefined;
  const record: unknown = JSON.parse(NodeFS.readFileSync(path, "utf8"));
  if (!isLaunchRecord(record)) throw new Error(`${path} is not a launch record; delete it.`);
  return record;
};

/** The last LOG_TAIL_LINES lines of the launch log at `path`, for error messages. */
const logTail = (path: string) =>
  NodeFS.existsSync(path)
    ? NodeFS.readFileSync(path, "utf8").trimEnd().split(/\r?\n/u).slice(-LOG_TAIL_LINES).join("\n")
    : "(no log)";

/**
 * Runs `lib/desktop-dev-job.ps1` with `args` and waits at most JOB_SCRIPT_TIMEOUT_MS. Returns its
 * trimmed stdout when it exits 0 and `undefined` when it exits 3 (no running process with that
 * id); throws with its stderr on anything else, including a timeout.
 */
const runJobScript = (args: ReadonlyArray<string>): string | undefined => {
  const result = NodeChildProcess.spawnSync(
    "powershell.exe",
    [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      JOB_SCRIPT,
      ...args,
    ],
    { encoding: "utf8", timeout: JOB_SCRIPT_TIMEOUT_MS, windowsHide: true },
  );
  if (result.error !== undefined) {
    throw new Error(`Could not run ${JOB_SCRIPT}: ${result.error.message}`, {
      cause: result.error,
    });
  }
  if (result.status === 0) return result.stdout.trim();
  if (result.status === NOT_RUNNING_EXIT_CODE) return undefined;
  throw new Error(result.stderr.trim() || `${JOB_SCRIPT} exited with ${result.status}.`);
};

/** Creation time of the running process `pid` as LaunchRecord stores it, or `undefined` when none runs with that id. */
const creationTimeOf = (pid: number) => runJobScript(["-Identify", "-ProcessId", String(pid)]);

/** Whether the keeper in `record` still runs: the same id with the same creation time. */
const isKeeperRunning = (record: LaunchRecord) =>
  creationTimeOf(record.keeperPid) === record.keeperCreatedAt;

/**
 * Ends the keeper in `record`, and with it the job that holds the whole tree, but only while its
 * id still names the recorded process; checking and ending go through one process handle. Waits
 * until the keeper has exited. Returns false when it had already exited. Throws when it cannot be
 * checked or ended.
 */
const endRecordedKeeper = (record: LaunchRecord) =>
  runJobScript([
    "-Stop",
    "-ProcessId",
    String(record.keeperPid),
    "-CreatedAt",
    record.keeperCreatedAt,
  ]) !== undefined;

/**
 * Ends the keeper this process spawned through the handle Node holds for it, so a reused id
 * cannot be hit, and waits up to KEEPER_EXIT_TIMEOUT_MS for it to exit. Returns whether it is gone.
 */
const endSpawnedKeeper = async (keeper: NodeChildProcess.ChildProcess) => {
  const isGone = () =>
    keeper.pid === undefined || keeper.exitCode !== null || keeper.signalCode !== null;
  if (isGone()) return true;
  const exited = new Promise<void>((resolve) => keeper.once("exit", () => resolve()));
  keeper.kill();
  // Unreferenced, so a keeper that exits at once does not hold this CLI open for the full wait.
  await Promise.race([
    exited,
    NodeTimersPromises.setTimeout(KEEPER_EXIT_TIMEOUT_MS, undefined, { ref: false }),
  ]);
  return isGone();
};

/**
 * Whether anything accepts TCP connections on 127.0.0.1:`port`. Only a refused connection counts
 * as free; a probe that neither connects nor is refused within PORT_PROBE_TIMEOUT_MS counts as in
 * use. Rejects on any other socket error rather than guessing.
 */
const isPortListening = (port: number) =>
  new Promise<boolean>((resolve, reject) => {
    const socket = NodeNet.connect({ host: "127.0.0.1", port, timeout: PORT_PROBE_TIMEOUT_MS });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", (error: NodeJS.ErrnoException) => {
      socket.destroy();
      if (error.code === "ECONNREFUSED") {
        resolve(false);
      } else {
        reject(new Error(`Could not probe port ${port}: ${error.message}`, { cause: error }));
      }
    });
  });

/** Polls until nothing listens on `port`. Returns false if something still does after PORT_RELEASE_POLLS polls. */
const waitForPortRelease = async (port: number) => {
  for (let poll = 0; poll < PORT_RELEASE_POLLS; poll++) {
    if (!(await isPortListening(port))) return true;
    await NodeTimersPromises.setTimeout(PORT_RELEASE_POLL_MS);
  }
  return !(await isPortListening(port));
};

/**
 * Same test as migrate-dev-db's shared-home guard: the real path when it exists, lowercased
 * because this only runs on Windows.
 */
const canonicalPath = (path: string) => {
  try {
    return NodeFS.realpathSync.native(path).toLowerCase();
  } catch {
    return NodePath.resolve(path).toLowerCase();
  }
};

/**
 * Cleans up after a failed `start`: ends the keeper, and with it the tree, then removes the launch
 * record once the keeper is confirmed gone and keeps it otherwise, so `stop` can retry. Returns
 * the error to throw: `reason`, any cleanup problem, and the last lines of `log`.
 */
const abandonStart = async (
  keeper: NodeChildProcess.ChildProcess,
  port: number,
  log: string,
  reason: unknown,
): Promise<Error> => {
  const problems: Array<string> = [];
  if (await endSpawnedKeeper(keeper)) {
    NodeFS.rmSync(launchRecordPath(port), { force: true });
    try {
      if (!(await waitForPortRelease(port))) {
        problems.push(
          `Port ${port} still answers after the keeper's job ended; something outside the job holds it.`,
        );
      }
    } catch (error) {
      problems.push(error instanceof Error ? error.message : String(error));
    }
  } else {
    problems.push(
      `The keeper (pid ${keeper.pid}) did not exit; its record stays, so run stop --port ${port} to retry.`,
    );
  }
  const message = reason instanceof Error ? reason.message : String(reason);
  return new Error([message, ...problems, `Last lines of ${log}:`, logTail(log)].join("\n"), {
    cause: reason,
  });
};

/**
 * Launches dev:desktop for `homeDir` with DevTools on `port` and returns once the app page has
 * loaded, printing `ready ...` and dev-runner's port line. The tree keeps running after this CLI
 * exits; `stop --port` ends it.
 *
 * Refuses the live ~/.t3 home, a port whose recorded keeper still runs, and a port something
 * already listens on. With `seed`, first rebuilds the home's database through migrate-dev-db,
 * which runs synchronously with no timeout of its own. Fails when the keeper exits, the log shows
 * a fatal dev-runner error, or the page has not loaded within `timeoutSeconds`; it then ends the
 * keeper, and with it the whole tree, and the error carries the log's last lines.
 */
const start = async (port: number, homeDir: string, seed: boolean, timeoutSeconds: number) => {
  if (canonicalPath(homeDir) === canonicalPath(LIVE_T3_HOME)) {
    throw new Error(
      `--home-dir ${homeDir} is the live T3 home; its userdata is the real database in use. Use a worktree's .t3 or a temp directory.`,
    );
  }
  const previous = readLaunchRecord(port);
  if (previous !== undefined && isKeeperRunning(previous)) {
    throw new Error(
      `Port ${port} already has a desktop dev app (keeper pid ${previous.keeperPid}, home ${previous.homeDir}). Stop it first.`,
    );
  }
  if (await isPortListening(port)) {
    throw new Error(`Something already listens on port ${port}. Pick another port.`);
  }

  if (seed) {
    const migration = NodeChildProcess.spawnSync(
      process.execPath,
      [
        NodePath.join(REPO_ROOT, "apps", "server", "scripts", "migrate-dev-db.ts"),
        "--base-dir",
        homeDir,
      ],
      { cwd: REPO_ROOT, stdio: "inherit" },
    );
    if (migration.status !== 0) {
      throw new Error(
        `migrate-dev-db failed (${migration.error?.message ?? `exit ${migration.status}`}).`,
      );
    }
  }

  NodeFS.mkdirSync(LAUNCH_DIRECTORY, { recursive: true });
  const log = NodePath.join(LAUNCH_DIRECTORY, `${port}.log`);
  const logFd = NodeFS.openSync(log, "w");
  // dev:desktop only resolves its workspace from the repository root; started from a package
  // directory it fails with "Cannot find module". The keeper passes this working directory on.
  const keeper = NodeChildProcess.spawn(
    process.execPath,
    [KEEPER, process.execPath, DEV_RUNNER, "dev:desktop", "--home-dir", homeDir],
    {
      cwd: REPO_ROOT,
      env: { ...process.env, T3CODE_DESKTOP_REMOTE_DEBUGGING_PORT: String(port) },
      detached: true,
      stdio: ["ignore", logFd, logFd],
      windowsHide: true,
    },
  );
  NodeFS.closeSync(logFd);
  let exit: string | undefined;
  keeper.once("error", (error) => {
    exit = `failed to start: ${error.message}`;
  });
  keeper.once("exit", (code, signal) => {
    exit = `exited with ${signal ?? `code ${code}`}`;
  });

  try {
    const pid = keeper.pid;
    if (pid === undefined) {
      await NodeTimersPromises.setTimeout(0);
      throw new Error(`Could not start the keeper: ${exit ?? "no pid"}.`);
    }
    // Node holds the keeper's handle until it sees the exit, so this id cannot be reused yet.
    const keeperCreatedAt = creationTimeOf(pid);
    if (keeperCreatedAt === undefined) throw new Error("The keeper exited right after starting.");
    const record: LaunchRecord = {
      keeperPid: pid,
      keeperCreatedAt,
      port,
      homeDir,
      log,
      startedAt: new Date().toISOString(),
    };
    NodeFS.writeFileSync(launchRecordPath(port), `${JSON.stringify(record, null, 2)}\n`);

    const deadline = Date.now() + timeoutSeconds * 1000;
    while (Date.now() < deadline) {
      if (exit !== undefined) throw new Error(`The keeper ${exit} before the app loaded.`);
      const logText = NodeFS.readFileSync(log, "utf8");
      const fatal = FATAL_LOG_PATTERNS.find((pattern) => pattern.test(logText));
      if (fatal !== undefined) throw new Error(`dev-runner logged ${fatal.source}.`);
      const page = await findAppPage(port).catch(() => undefined);
      if (page !== undefined) {
        keeper.unref();
        const ports = /\[dev-runner\][^\n]*serverPort=\d+ webPort=\d+/u.exec(logText)?.[0];
        console.log(`ready port=${port} keeper=${pid} home=${homeDir} log=${log}`);
        if (ports !== undefined) console.log(ports);
        return;
      }
      await NodeTimersPromises.setTimeout(START_POLL_MS);
    }
    throw new Error(`The app page did not load within ${timeoutSeconds} s.`);
  } catch (error) {
    throw await abandonStart(keeper, port, log, error);
  }
};

/**
 * Ends the tree `start` launched on `port` and confirms the port is released. The keeper is ended
 * only while its id and creation time still match the record. Removes the record once the keeper
 * is confirmed gone. Throws when there is no record, the keeper cannot be ended, or something
 * still listens on the port afterwards.
 */
const stop = async (port: number) => {
  const record = readLaunchRecord(port);
  if (record === undefined) {
    throw new Error(
      `Nothing was started on port ${port} by this tool (${launchRecordPath(port)} is missing).`,
    );
  }
  const ended = endRecordedKeeper(record);
  NodeFS.rmSync(launchRecordPath(port), { force: true });
  if (!(await waitForPortRelease(port))) {
    throw new Error(
      ended
        ? `Port ${port} still answers after ending keeper pid ${record.keeperPid}; part of the app left its job. Find the port's owner and confirm it belongs to ${record.homeDir} before ending it.`
        : `Port ${port} is in use, but the app this tool started there had already exited (keeper pid ${record.keeperPid} is gone), so the listener is not one this tool started.`,
    );
  }
  console.log(
    ended
      ? `stopped port=${port} keeper=${record.keeperPid}`
      : `stopped port=${port}: the app had already exited`,
  );
};

/** Reads `--at <x>,<y>` as a viewport point in CSS pixels; throws on anything else. */
const parsePoint = (value: string): PointTarget => {
  const match = /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/u.exec(value);
  NodeAssert.ok(match, `--at expects <x>,<y>, got ${value}`);
  return { x: Number(match[1]), y: Number(match[2]) };
};

/** Builds an ElementTarget without a `text` key when none was given (exactOptionalPropertyTypes). */
const elementTarget = (selector: string, text: string | undefined): ElementTarget =>
  text === undefined ? { selector } : { selector, text };

/**
 * Parses the command line and runs one command. Usage errors and failures throw; the caller
 * prints them and sets exit code 1.
 */
const main = async () => {
  // oxlint-disable-next-line t3code/no-global-process-runtime -- Standalone dev tool has no Effect runtime; it drives job objects, PowerShell and user32.
  if (process.platform !== "win32") throw new Error("desktop-cdp only supports Windows hosts.");

  const { positionals, values } = NodeUtil.parseArgs({
    allowPositionals: true,
    options: {
      port: { type: "string" },
      "home-dir": { type: "string" },
      seed: { type: "boolean", default: false },
      "timeout-seconds": { type: "string", default: String(DEFAULT_START_TIMEOUT_SECONDS) },
      out: { type: "string" },
      selector: { type: "string" },
      text: { type: "string" },
      pad: { type: "string", default: "16" },
      at: { type: "string" },
      key: { type: "string" },
      expression: { type: "string" },
    },
  });
  const [command] = positionals;
  if (command === undefined) {
    console.log(USAGE);
    return;
  }
  const port = Number(values.port);
  NodeAssert.ok(
    Number.isInteger(port) && port >= 1024 && port <= 65535,
    "--port must be 1024-65535",
  );

  if (command === "start") {
    NodeAssert.ok(values["home-dir"], "start needs --home-dir");
    const timeoutSeconds = Number(values["timeout-seconds"]);
    NodeAssert.ok(timeoutSeconds > 0, "--timeout-seconds must be positive");
    await start(port, NodePath.resolve(values["home-dir"]), values.seed, timeoutSeconds);
    return;
  }
  if (command === "stop") {
    await stop(port);
    return;
  }

  const page = await connectDesktopPage(port);
  try {
    const target = (): ElementTarget | PointTarget => {
      if (values.at !== undefined) return parsePoint(values.at);
      NodeAssert.ok(values.selector, `${command} needs --selector or --at`);
      return elementTarget(values.selector, values.text);
    };
    switch (command) {
      case "shot": {
        NodeAssert.ok(values.out, "shot needs --out");
        const element =
          values.selector === undefined ? undefined : elementTarget(values.selector, values.text);
        console.log(`saved ${await page.shot(values.out, element, Number(values.pad))}`);
        break;
      }
      case "click":
      case "hover": {
        const point = await page[command](target());
        console.log(`${command} x=${Math.round(point.x)} y=${Math.round(point.y)}`);
        break;
      }
      case "key": {
        NodeAssert.ok(values.key, "key needs --key");
        await page.key(values.key);
        console.log(`key ${values.key}`);
        break;
      }
      case "type": {
        NodeAssert.ok(values.text !== undefined, "type needs --text");
        await page.insertText(values.text);
        console.log(`typed ${values.text.length} characters`);
        break;
      }
      case "eval": {
        NodeAssert.ok(values.expression, "eval needs --expression");
        console.log(JSON.stringify(await page.evaluate(values.expression), null, 2) ?? "undefined");
        break;
      }
      default:
        throw new Error(`Unknown command ${command}.\n${USAGE}`);
    }
  } finally {
    page.close();
  }
};

main().catch((error: unknown) => {
  console.error(`desktop-cdp: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
