import { t } from "~/i18n";
import {
  EasDeviceHostConfig,
  type EasDeviceHostConfig as EasDeviceHostConfigType,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";

export const parseEasDeviceHostDraft = Schema.decodeUnknownOption(EasDeviceHostConfig);

export const newEasDeviceHost = (id: string): EasDeviceHostConfigType => ({
  kind: "eas",
  id,
  label: t.settings.easLimitsUi.title,
  accessToken: "",
  maxSessionMinutes: 30,
  idleMinutes: 10,
  maxConcurrentSessions: 2,
});

/** Adds, replaces, or removes one EAS host. */
/**
 * With `keepToken`, the environment keeps the token it holds: a saved token arrives redacted, and
 * one environment's token says nothing about another's. One new to the host uses its own Expo login.
 */
export function updateEasDeviceHosts(
  hosts: ReadonlyArray<EasDeviceHostConfigType>,
  host: EasDeviceHostConfigType,
  remove: boolean,
  keepToken = false,
): ReadonlyArray<EasDeviceHostConfigType> {
  if (remove) return hosts.filter((candidate) => candidate.id !== host.id);
  const existing = hosts.find((candidate) => candidate.id === host.id);
  const next = keepToken ? { ...host, accessToken: existing?.accessToken ?? "" } : host;
  return existing
    ? hosts.map((candidate) => (candidate.id === host.id ? next : candidate))
    : [...hosts, next];
}

export function easSessionLimits(host: EasDeviceHostConfigType) {
  const sessions = t.settings.easLimitsText.sessions(host.maxConcurrentSessions);
  return t.settings.easLimitsText.limits(sessions, host.maxSessionMinutes, host.idleMinutes);
}
