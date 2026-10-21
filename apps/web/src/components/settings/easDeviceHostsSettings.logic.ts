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
export function updateEasDeviceHosts(
  hosts: ReadonlyArray<EasDeviceHostConfigType>,
  host: EasDeviceHostConfigType,
  remove: boolean,
): ReadonlyArray<EasDeviceHostConfigType> {
  if (remove) return hosts.filter((candidate) => candidate.id !== host.id);
  return hosts.some((candidate) => candidate.id === host.id)
    ? hosts.map((candidate) => (candidate.id === host.id ? host : candidate))
    : [...hosts, host];
}

export function easSessionLimits(host: EasDeviceHostConfigType) {
  const sessions = t.settings.easLimitsText.sessions(host.maxConcurrentSessions);
  return t.settings.easLimitsText.limits(sessions, host.maxSessionMinutes, host.idleMinutes);
}
