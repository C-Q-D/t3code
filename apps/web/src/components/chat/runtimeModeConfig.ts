/** Defines runtime mode display labels independently of protocol values. */
import { t } from "~/i18n";
import type { RuntimeMode } from "@t3tools/contracts";
import { type LucideIcon, LockIcon, LockOpenIcon, PenLineIcon, SparklesIcon } from "lucide-react";

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
    icon: SparklesIcon,
  },
  "full-access": {
    label: t.chat.runtimeMode.fullAccess,
    description: t.chat.runtimeMode.allowCommandsAndEditsWithoutPrompts,
    icon: LockOpenIcon,
  },
};

export const runtimeModeOptions = Object.keys(runtimeModeConfig) as RuntimeMode[];
