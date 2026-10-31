/** Defines runtime mode display labels independently of protocol values. */
import { PixelSparkIcon } from "../icons/PixelLucideIcon";
import { t } from "~/i18n";
import type { RuntimeMode } from "@t3tools/contracts";
import { type LucideIcon, LockIcon, LockOpenIcon, PenLineIcon } from "lucide-react";

export const runtimeModeConfig: Record<
  RuntimeMode,
  { label: string; description: string; icon: LucideIcon }
> = {
  "approval-required": {
    label: t.chat.runtimeMode.supervised,
    description: t.chat.runtimeMode.askBeforeCommandsAndFileChanges,
    icon: LockIcon,
  },
  "auto-accept-edits": {
    label: t.chat.runtimeMode.autoAcceptEdits,
    description: t.chat.runtimeMode.autoApproveEditsAskBeforeOtherActions,
    icon: PenLineIcon,
  },
  auto: {
    label: t.chat.runtimeMode.auto,
    description: t.chat.runtimeMode.supportedProvidersApproveRoutineActionsOthersStill,
    icon: PixelSparkIcon,
  },
  "full-access": {
    label: t.chat.runtimeMode.fullAccess,
    description: t.chat.runtimeMode.allowCommandsAndEditsWithoutPrompts,
    icon: LockOpenIcon,
  },
};

export const runtimeModeOptions = Object.keys(runtimeModeConfig) as RuntimeMode[];

/** The modes a provider supports (all when it reports none) and the mode a thread really runs in. */
export function resolveCompatibleRuntimeMode(
  runtimeMode: RuntimeMode,
  supportedRuntimeModes: ReadonlyArray<RuntimeMode> | undefined,
) {
  const modes =
    supportedRuntimeModes && supportedRuntimeModes.length > 0
      ? runtimeModeOptions.filter((mode) => supportedRuntimeModes.includes(mode))
      : runtimeModeOptions;
  return { modes, mode: modes.includes(runtimeMode) ? runtimeMode : (modes[0] ?? runtimeMode) };
}
