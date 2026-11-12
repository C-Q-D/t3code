import { createTerminalEnvironmentAtoms } from "@t3tools/client-runtime/state/terminal";
import {
  runAtomCommand,
  squashAtomCommandFailure,
  type AtomCommandResult,
} from "@t3tools/client-runtime/state/runtime";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { Atom } from "effect/reactivity";
import { appAtomRegistry } from "../rpc/atomRegistry";
import { TerminalAutomationController } from "../terminal/automationController";

import { connectionAtomRuntime } from "../connection/runtime";

export const terminalEnvironment = createTerminalEnvironmentAtoms(connectionAtomRuntime);

const automationControllers = new Map<
  string,
  { controller: TerminalAutomationController; references: number; stopPermissions: () => void }
>();

function unwrap<A, E>(result: AtomCommandResult<A, E>): A {
  if (result._tag === "Success") return result.value;
  throw squashAtomCommandFailure(result);
}

/** Returns an existing scope controller for later UI state subscriptions and explicit actions. */
export function getTerminalAutomation(threadRef: ScopedThreadRef) {
  return automationControllers.get(JSON.stringify([threadRef.environmentId, threadRef.threadId]))
    ?.controller;
}

export function acquireTerminalAutomation(threadRef: ScopedThreadRef) {
  const { environmentId, threadId } = threadRef;
  const key = JSON.stringify([environmentId, threadId]);
  let entry = automationControllers.get(key);
  if (!entry) {
    const commands = terminalEnvironment.automation;
    let generation = 0;
    let subscription = 0;
    let active = false;
    const currentGeneration = () => {
      const captured = generation;
      return () => active && generation === captured;
    };
    const controller = new TerminalAutomationController({
      subscribe: (start, end, receive) => {
        const token = ++subscription;
        const unmount = appAtomRegistry.mount(
          commands.driver(
            environmentId,
            threadId,
            () => {
              if (token !== subscription) return;
              generation += 1;
              active = true;
              start();
            },
            () => {
              if (token !== subscription) return;
              generation += 1;
              active = false;
              end();
            },
            (event) => {
              if (token === subscription) receive(event);
            },
          ),
        );
        return () => {
          if (token === subscription) {
            subscription += 1;
            generation += 1;
            active = false;
          }
          unmount();
        };
      },
      registerViews: async (views) => {
        unwrap(
          await runAtomCommand(appAtomRegistry, commands.registerViews, {
            environmentId,
            input: {
              threadId,
              registration: { version: 1, views },
              isCurrent: currentGeneration(),
            },
          }),
        );
      },
      replyBridge: async (reply, isCurrent) => {
        const connected = currentGeneration();
        unwrap(
          await runAtomCommand(appAtomRegistry, commands.replyBridge, {
            environmentId,
            input: { threadId, reply, isCurrent: () => connected() && isCurrent() },
          }),
        );
      },
      replySelection: async (reply) => {
        unwrap(
          await runAtomCommand(appAtomRegistry, commands.replySelection, {
            environmentId,
            input: { threadId, reply, isCurrent: currentGeneration() },
          }),
        );
      },
      reportEvent: async (event) => {
        unwrap(
          await runAtomCommand(appAtomRegistry, commands.reportEvent, {
            environmentId,
            input: { threadId, event, isCurrent: currentGeneration() },
          }),
        );
      },
      getConnectionState: async () =>
        unwrap(
          await runAtomCommand(appAtomRegistry, commands.getConnectionState, {
            environmentId,
            input: { threadId, isCurrent: currentGeneration() },
          }),
        ),
      resume: async (bindingId, inputEpoch, isCurrent) => {
        const connected = currentGeneration();
        return unwrap(
          await runAtomCommand(appAtomRegistry, commands.resume, {
            environmentId,
            input: { threadId, bindingId, inputEpoch, isCurrent: () => connected() && isCurrent() },
          }),
        );
      },
    });
    const stopPermissions = appAtomRegistry.subscribe(
      Atom.make(
        (get) =>
          get(commands.getConnectionState.permissionAtom(environmentId)) &&
          get(commands.registerViews.permissionAtom(environmentId)),
      ),
      (allowed) => {
        if (!allowed) controller.suspend();
        else controller.start();
      },
      { immediate: true },
    );
    entry = { controller, references: 0, stopPermissions };
    automationControllers.set(key, entry);
  }
  entry.references += 1;
  const owned = entry;
  return {
    controller: entry.controller,
    release: () => {
      owned.references -= 1;
      if (owned.references === 0) {
        owned.stopPermissions();
        owned.controller.dispose();
        if (automationControllers.get(key) === owned) automationControllers.delete(key);
      }
    },
  };
}
