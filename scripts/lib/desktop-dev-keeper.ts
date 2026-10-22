/**
 * Owns the desktop dev app's process tree for `scripts/desktop-cdp.ts start`, which launches this
 * detached with the launch log as stdout and stderr and the repository root as working directory.
 *
 * It first puts itself into a kill-on-close job that only it holds (`desktop-dev-job.ps1 -Adopt`),
 * then runs its arguments as a command with the same stdio, working directory and environment, and
 * exits with that command's code. Everything the command starts is born inside the job, so when
 * this process ends for any reason, Windows ends the rest of the tree: `stop` only has to end this
 * one process, and a dev-runner that exits early leaves nothing behind. Windows only.
 */
// @effect-diagnostics nodeBuiltinImport:off globalConsole:off - Plain Node process that outlives the CLI; it spawns PowerShell once and then the dev command.
import * as NodeChildProcess from "node:child_process";
import * as NodePath from "node:path";

const JOB_SCRIPT = NodePath.join(import.meta.dirname, "desktop-dev-job.ps1");
// PowerShell startup plus Add-Type compiling the helper; seconds even on a cold machine.
const ADOPT_TIMEOUT_MS = 60_000;

/**
 * Puts this process into a new kill-on-close job that only it holds, before it has started
 * anything. Throws when that fails. The helper's stderr goes straight to this process's stderr
 * (the launch log), so its reason is recorded even when a half-done adoption ends this process.
 */
const adoptSelf = () => {
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
      "-Adopt",
      "-ProcessId",
      String(process.pid),
    ],
    { stdio: ["ignore", "ignore", "inherit"], timeout: ADOPT_TIMEOUT_MS, windowsHide: true },
  );
  if (result.error !== undefined || result.status !== 0) {
    throw new Error(
      `could not put itself into a job (${result.error?.message ?? `exit ${result.status}`}); nothing was started.`,
      { cause: result.error },
    );
  }
};

/**
 * Adopts this process into its job, then runs `argv[2..]` and mirrors its exit code. The command
 * is spawned detached so its console setup matches a direct detached launch; it stays in the job
 * regardless, because the job allows no breakaway.
 */
const main = () => {
  const [command, ...args] = process.argv.slice(2);
  if (command === undefined) throw new Error("usage: desktop-dev-keeper.ts <command> [args...]");
  adoptSelf();
  const child = NodeChildProcess.spawn(command, args, {
    detached: true,
    stdio: "inherit",
    windowsHide: true,
  });
  child.once("error", (error) => {
    console.error(`desktop-dev-keeper: could not start ${command}: ${error.message}`);
    process.exitCode = 1;
  });
  child.once("exit", (code, signal) => {
    console.error(`desktop-dev-keeper: the dev command exited with ${signal ?? `code ${code}`}.`);
    process.exitCode = code ?? 1;
  });
};

try {
  main();
} catch (error) {
  console.error(`desktop-dev-keeper: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
