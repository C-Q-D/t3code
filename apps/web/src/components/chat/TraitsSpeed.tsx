/** Displays provider speed traits while retaining provider option identifiers. */
import { t } from "~/i18n";
import type { ProviderDriverKind, ProviderOptionDescriptor } from "@t3tools/contracts";
import { getProviderOptionCurrentValue } from "@t3tools/shared/model";
import { ZapIcon } from "lucide-react";
import { UltrafastIcon } from "../Icons";
import { cn } from "~/lib/utils";
import { ComposerControlIcon, type ComposerControlSize } from "./ComposerControl";

/**
 * Resolves the display label and icon for a recognized provider speed option.
 * @param provider - Required provider driver discriminator.
 * @param descriptor - Required option descriptor with its current value and available options.
 * @returns A label and speed icon, or null for an unsupported option. speedIcon is null for normal
 * speed; provider-supplied labels are retained.
 */
export function getTraitsSpeedDisplay(
  provider: ProviderDriverKind,
  descriptor: ProviderOptionDescriptor,
): { label: string; speedIcon: "fast" | "ultrafast" | null } | null {
  if (descriptor.id === "fastMode" && descriptor.type === "boolean") {
    return {
      label: descriptor.currentValue === true ? t.chat.speed.fast : t.chat.speed.normal,
      speedIcon: descriptor.currentValue === true ? "fast" : null,
    };
  }
  if (provider !== "codex" || descriptor.id !== "serviceTier" || descriptor.type !== "select") {
    return null;
  }
  const currentValue = getProviderOptionCurrentValue(descriptor);
  const fastTier = descriptor.options.find(({ label }) => label === "Fast");
  const ultrafastTier = descriptor.options.find(({ label }) => label === "Ultrafast");
  if (
    ((fastTier || ultrafastTier) && currentValue === "default") ||
    (fastTier && currentValue === fastTier.id) ||
    (ultrafastTier && currentValue === ultrafastTier.id)
  ) {
    return {
      label: descriptor.options.find(({ id }) => id === currentValue)?.label ?? t.chat.speed.normal,
      speedIcon:
        ultrafastTier && currentValue === ultrafastTier.id
          ? "ultrafast"
          : fastTier && currentValue === fastTier.id
            ? "fast"
            : null,
    };
  }
  return null;
}

/**
 * Renders the selected provider speed icon with an accessible mode label.
 * @param props - Required provider and fast/ultrafast speedIcon; optional size defaults to sm.
 * Required fields are non-null.
 * @returns The icon and accessible label; never null.
 */
export function TraitsSpeedIcon({
  provider,
  speedIcon,
  size = "sm",
}: {
  provider: ProviderDriverKind;
  speedIcon: "fast" | "ultrafast";
  size?: ComposerControlSize;
}) {
  return (
    <>
      <ComposerControlIcon
        icon={speedIcon === "ultrafast" ? UltrafastIcon : ZapIcon}
        size={size}
        className={cn(
          "fill-current opacity-80",
          size === "xs"
            ? "text-current"
            : provider === "claudeAgent"
              ? "text-[#d97757]"
              : "text-foreground",
        )}
      />
      <span className="sr-only">
        {speedIcon === "ultrafast" ? t.chat.speed.ultrafastModeOn : t.chat.speed.fastModeOn}
      </span>
    </>
  );
}
