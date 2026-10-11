/** Localized device UI and interactions; preserves user data, commands, and protocol values. */
import { t } from "~/i18n";
import type { DevicePlatformAvailability } from "@t3tools/contracts";
import { Check, Minus } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";

/**
 * Renders available platforms or their host-supplied unavailability reasons.
 * @param props View data, control flags, and callbacks defined by the component props type; optional fields retain their declared defaults.
 * @returns Rendered UI for the supplied props.
 */
export function DeviceHostAvailability({
  platforms,
}: {
  platforms: ReadonlyArray<DevicePlatformAvailability>;
}) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {platforms.map((platform) => (
        <Tooltip key={platform.platform}>
          <TooltipTrigger render={<span tabIndex={0} className="inline-flex items-center gap-1" />}>
            {platform.available ? <Check className="size-3" /> : <Minus className="size-3" />}
            {platform.platform === "ios" ? "iOS" : "Android"}{" "}
            {platform.available ? t.tools.device.available : t.tools.device.unavailable}
          </TooltipTrigger>
          <TooltipPopup>
            {platform.reason ??
              (platform.platform === "ios"
                ? t.tools.device.iosAvailable
                : t.tools.device.androidAvailable)}
          </TooltipPopup>
        </Tooltip>
      ))}
    </div>
  );
}
