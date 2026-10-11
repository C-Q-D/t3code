import {
  englishRemotePairingMessages,
  type RemotePairingMessages,
} from "@t3tools/shared/remoteLabels";
import type { DesktopSshEnvironmentTarget, EnvironmentId } from "@t3tools/contracts";
import {
  resolveRemotePairingTarget,
  RemotePairingTargetError,
  remotePairingTargetErrorMessage,
} from "@t3tools/shared/remote";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as SubscriptionRef from "effect/SubscriptionRef";
import * as HttpClient from "effect/http/HttpClient";

import { bootstrapRemoteBearerSession } from "../authorization/remote.ts";
import { deriveWsBaseUrl, normalizeHttpBaseUrl } from "../environment/endpoint.ts";
import { fetchRemoteEnvironmentDescriptor } from "../environment/descriptor.ts";
import * as ClientCapabilities from "../platform/capabilities.ts";
import {
  BearerConnectionCredential,
  BearerConnectionProfile,
  BearerConnectionRegistration,
  type ConnectionCatalogEntry,
  type ConnectionCredential,
  SshConnectionProfile,
  SshConnectionRegistration,
} from "./catalog.ts";
import * as ConnectionCredentialStore from "./credentialStore.ts";
import { mapRemoteEnvironmentError } from "./errors.ts";
import {
  BearerConnectionTarget,
  ConnectionBlockedError,
  SshConnectionTarget,
  type ConnectionAttemptError,
} from "./model.ts";
import * as Persistence from "../platform/persistence.ts";
import * as EnvironmentRegistry from "./registry.ts";
import { orchestrationProtocolCompatibilityError } from "./compatibility.ts";
import { connectionRoutes, routeEntry, sshTargetKey } from "./routes.ts";

export interface PairingConnectionInput {
  readonly pairingUrl?: string;
  readonly host?: string;
  readonly pairingCode?: string;
  /**
   * Set when adding a route to a saved machine: the pairing must reach this
   * environment, or nothing is saved.
   */
  readonly expectedEnvironmentId?: EnvironmentId;
}

export interface SshConnectionInput {
  readonly target: DesktopSshEnvironmentTarget;
  readonly label?: string;
  /** Set when adding a route to a saved machine; see `PairingConnectionInput`. */
  readonly expectedEnvironmentId?: EnvironmentId;
}

export interface BearerConnectionUpdateInput {
  readonly environmentId: EnvironmentId;
  readonly label: string;
  readonly httpBaseUrl: string;
}

/** Registers connection routes and credentials; optional messages affect local validation feedback only. */
export class ConnectionOnboarding extends Context.Service<
  ConnectionOnboarding,
  {
    readonly registerPairing: (
      input: PairingConnectionInput,
      messages?: RemotePairingMessages,
    ) => Effect.Effect<
      EnvironmentId,
      ConnectionAttemptError | Persistence.ConnectionPersistenceError
    >;
    readonly registerSsh: (
      input: SshConnectionInput,
      messages?: RemotePairingMessages,
    ) => Effect.Effect<
      EnvironmentId,
      ConnectionAttemptError | Persistence.ConnectionPersistenceError
    >;
    readonly updateBearer: (
      input: BearerConnectionUpdateInput,
    ) => Effect.Effect<void, ConnectionAttemptError | Persistence.ConnectionPersistenceError>;
  }
>()("@t3tools/client-runtime/connection/onboarding/ConnectionOnboarding") {}

const isRemotePairingTargetError = Schema.is(RemotePairingTargetError);

const resolvePairingTarget = Effect.fn("clientRuntime.connection.onboarding.resolvePairingTarget")(
  function* (
    input: PairingConnectionInput,
    messages: RemotePairingMessages = englishRemotePairingMessages,
  ) {
    return yield* Effect.try({
      try: () => resolveRemotePairingTarget(input),
      catch: (cause) =>
        new ConnectionBlockedError({
          reason: "configuration",
          detail: isRemotePairingTargetError(cause)
            ? remotePairingTargetErrorMessage(cause, messages)
            : cause instanceof Error
              ? cause.message
              : messages.invalidDetails,
        }),
    });
  },
);

/**
 * One bearer route per address, so pairing over Tailscale adds a route next
 * to the LAN one instead of replacing it. Pairing the same address again
 * reuses the id and replaces that route.
 */
function bearerConnectionId(environmentId: EnvironmentId, httpBaseUrl: string): string {
  return `bearer:${environmentId}:${new URL(httpBaseUrl).origin}`;
}

/** Rejects a mismatched target using the display locale while preserving its server-supplied name. */
function differentMachineError(label: string, messages: RemotePairingMessages) {
  return new ConnectionBlockedError({
    reason: "configuration",
    detail: messages.differentMachine(label),
  });
}

export const preparePairingRegistration = Effect.fn(
  "clientRuntime.connection.onboarding.preparePairingRegistration",
)(function* (
  input: PairingConnectionInput,
  messages: RemotePairingMessages = englishRemotePairingMessages,
) {
  const target = yield* resolvePairingTarget(input, messages);
  const presentation = yield* ClientCapabilities.ClientPresentation;
  const descriptor = yield* fetchRemoteEnvironmentDescriptor({
    httpBaseUrl: target.httpBaseUrl,
  }).pipe(Effect.mapError(mapRemoteEnvironmentError));
  // Checked before redeeming the one-time code, so a wrong link is not spent.
  if (
    input.expectedEnvironmentId !== undefined &&
    descriptor.environmentId !== input.expectedEnvironmentId
  ) {
    return yield* differentMachineError(descriptor.label, messages);
  }
  const compatibilityError = orchestrationProtocolCompatibilityError(descriptor);
  // An outdated server is still saved so it can be updated from this client.
  if (compatibilityError !== null && compatibilityError.serverUpdateRequired !== true) {
    return yield* compatibilityError;
  }
  const access = yield* bootstrapRemoteBearerSession({
    httpBaseUrl: target.httpBaseUrl,
    credential: target.credential,
    clientMetadata: presentation.metadata,
  }).pipe(Effect.mapError(mapRemoteEnvironmentError));
  const connectionId = bearerConnectionId(descriptor.environmentId, target.httpBaseUrl);

  return new BearerConnectionRegistration({
    target: new BearerConnectionTarget({
      environmentId: descriptor.environmentId,
      label: descriptor.label,
      connectionId,
    }),
    profile: new BearerConnectionProfile({
      connectionId,
      environmentId: descriptor.environmentId,
      label: descriptor.label,
      httpBaseUrl: target.httpBaseUrl,
      wsBaseUrl: target.wsBaseUrl,
    }),
    credential: new BearerConnectionCredential({
      token: access.access_token,
    }),
  });
});

const registerPairingConnection = Effect.fn(
  "clientRuntime.connection.onboarding.registerPairingConnection",
)(function* (
  input: PairingConnectionInput,
  messages: RemotePairingMessages = englishRemotePairingMessages,
) {
  const registration = yield* preparePairingRegistration(input, messages);
  const registry = yield* EnvironmentRegistry.EnvironmentRegistry;
  yield* registry.register(registration);
  return registration.target.environmentId;
});

const isBearerCredential = Schema.is(BearerConnectionCredential);
const isBearerProfile = Schema.is(BearerConnectionProfile);

const updateBearerConnection = Effect.fn(
  "clientRuntime.connection.onboarding.updateBearerConnection",
)(function* (input: BearerConnectionUpdateInput) {
  const registry = yield* EnvironmentRegistry.EnvironmentRegistry;
  const credentials = yield* ConnectionCredentialStore.ConnectionCredentialStore;
  const saved = (yield* SubscriptionRef.get(registry.entries)).get(input.environmentId);
  // Editing changes the environment's first direct route; others stay as saved.
  const route =
    saved === undefined
      ? undefined
      : connectionRoutes(saved).find(
          (candidate) => candidate.target._tag === "BearerConnectionTarget",
        );
  const entry = saved === undefined || route === undefined ? saved : routeEntry(saved, route);
  const credential =
    entry?.target._tag === "BearerConnectionTarget"
      ? yield* credentials.get(entry.target.connectionId)
      : Option.none();
  const registration = yield* prepareBearerConnectionUpdate({
    input,
    entry: Option.fromUndefinedOr(entry),
    credential,
  });
  yield* registry.register(registration);
});

export const prepareBearerConnectionUpdate = Effect.fn(
  "clientRuntime.connection.onboarding.prepareBearerConnectionUpdate",
)(function* (options: {
  readonly input: BearerConnectionUpdateInput;
  readonly entry: Option.Option<ConnectionCatalogEntry>;
  readonly credential: Option.Option<ConnectionCredential>;
}) {
  const entry = Option.getOrNull(options.entry);
  if (
    entry === undefined ||
    entry === null ||
    entry.target._tag !== "BearerConnectionTarget" ||
    Option.isNone(entry.profile) ||
    !isBearerProfile(entry.profile.value)
  ) {
    return yield* new ConnectionBlockedError({
      reason: "configuration",
      detail: "Only saved bearer environments can be edited.",
    });
  }

  const credential = options.credential;
  if (Option.isNone(credential) || !isBearerCredential(credential.value)) {
    return yield* new ConnectionBlockedError({
      reason: "authentication",
      detail: "The saved bearer credential is unavailable.",
    });
  }

  const label = options.input.label.trim();
  if (label === "") {
    return yield* new ConnectionBlockedError({
      reason: "configuration",
      detail: "Environment label cannot be empty.",
    });
  }
  const httpBaseUrl = yield* Effect.try({
    try: () => normalizeHttpBaseUrl(options.input.httpBaseUrl),
    catch: (cause) =>
      new ConnectionBlockedError({
        reason: "configuration",
        detail: cause instanceof Error ? cause.message : "The environment URL is invalid.",
      }),
  });
  const connectionId = entry.target.connectionId;
  return new BearerConnectionRegistration({
    target: new BearerConnectionTarget({
      environmentId: options.input.environmentId,
      label,
      connectionId,
    }),
    profile: new BearerConnectionProfile({
      connectionId,
      environmentId: options.input.environmentId,
      label,
      httpBaseUrl,
      wsBaseUrl: deriveWsBaseUrl(httpBaseUrl),
    }),
    credential: credential.value,
  });
});

export const prepareSshRegistration = Effect.fn(
  "clientRuntime.connection.onboarding.prepareSshRegistration",
)(function* (input: SshConnectionInput) {
  const gateway = yield* ClientCapabilities.SshEnvironmentGateway;
  const provisioned = yield* gateway.provision(input.target, input.expectedEnvironmentId);
  // One id per SSH target, so a second host or alias for the same machine
  // adds a route instead of replacing the first.
  const connectionId = `ssh:${provisioned.environmentId}:${sshTargetKey(provisioned.bootstrap.target)}`;
  const label = input.label?.trim() || provisioned.label || provisioned.bootstrap.target.alias;

  return new SshConnectionRegistration({
    target: new SshConnectionTarget({
      environmentId: provisioned.environmentId,
      label,
      connectionId,
    }),
    profile: new SshConnectionProfile({
      connectionId,
      environmentId: provisioned.environmentId,
      label,
      target: provisioned.bootstrap.target,
    }),
  });
});

const registerSshConnection = Effect.fn(
  "clientRuntime.connection.onboarding.registerSshConnection",
)(function* (
  input: SshConnectionInput,
  messages: RemotePairingMessages = englishRemotePairingMessages,
) {
  const registration = yield* prepareSshRegistration(input);
  if (
    input.expectedEnvironmentId !== undefined &&
    registration.target.environmentId !== input.expectedEnvironmentId
  ) {
    return yield* differentMachineError(registration.target.label, messages);
  }
  const registry = yield* EnvironmentRegistry.EnvironmentRegistry;
  yield* registry.register(registration);
  return registration.target.environmentId;
});

/** @public Service construction is part of the canonical Effect module API. */
export const make = Effect.gen(function* () {
  const registry = yield* EnvironmentRegistry.EnvironmentRegistry;
  const presentation = yield* ClientCapabilities.ClientPresentation;
  const httpClient = yield* HttpClient.HttpClient;
  const ssh = yield* ClientCapabilities.SshEnvironmentGateway;
  const credentials = yield* ConnectionCredentialStore.ConnectionCredentialStore;

  return ConnectionOnboarding.of({
    registerPairing: (input, messages) =>
      registerPairingConnection(input, messages).pipe(
        Effect.provideService(EnvironmentRegistry.EnvironmentRegistry, registry),
        Effect.provideService(ClientCapabilities.ClientPresentation, presentation),
        Effect.provideService(HttpClient.HttpClient, httpClient),
      ),
    registerSsh: (input, messages) =>
      registerSshConnection(input, messages).pipe(
        Effect.provideService(EnvironmentRegistry.EnvironmentRegistry, registry),
        Effect.provideService(ClientCapabilities.SshEnvironmentGateway, ssh),
      ),
    updateBearer: (input) =>
      updateBearerConnection(input).pipe(
        Effect.provideService(EnvironmentRegistry.EnvironmentRegistry, registry),
        Effect.provideService(ConnectionCredentialStore.ConnectionCredentialStore, credentials),
      ),
  });
});

export const layer = Layer.effect(ConnectionOnboarding, make);
