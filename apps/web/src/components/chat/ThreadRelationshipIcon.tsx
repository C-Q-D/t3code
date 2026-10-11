/** Displays relationship status labels and icons without changing stored statuses. */
import { t } from "~/i18n";
import type { ProviderDriverKind, ServerProvider } from "@t3tools/contracts";
import { BotIcon, type LucideIcon } from "lucide-react";
import { cn } from "../../lib/utils";
import { ProviderInstanceIcon } from "./ProviderInstanceIcon";

/**
 * Formats the display status of a related thread without changing its stored discriminator.
 * @param status - Stored status string, or null when no status is available; unknown and empty
 * strings use the unknown label.
 * @returns The localized status label; never null or empty.
 */
export function threadRelationshipStatusLabel(status: string | null): string {
  switch (status) {
    case "preparing":
    case "starting":
      return t.chat.relationships.starting;
    case "running":
    case "in_progress":
      return t.chat.relationships.running;
    case "pending":
    case "queued":
      return t.chat.relationships.queued;
    case "waiting":
    case "blocked":
      return t.chat.relationships.waiting;
    case "completed":
      return t.chat.relationships.done;
    case "failed":
    case "error":
      return t.chat.relationships.failed;
    case "cancelled":
    case "interrupted":
      return t.chat.relationships.stopped;
    case "rolled_back":
      return t.chat.relationships.reverted;
    case "resolved_native":
      return t.chat.relationships.resolvedNative;
    case "resolved_portable":
      return t.chat.relationships.resolvedPortable;
    case "consumed":
      return t.chat.relationships.consumed;
    case "superseded":
      return t.chat.relationships.superseded;
    case "idle":
      return t.chat.relationships.idle;
    default:
      return t.chat.relationships.unknown;
  }
}

/** Shared by lineage and timeline links, including the provider glyph and status badge. */
export function ThreadRelationshipIcon({
  driver,
  provider,
  status,
  fallbackIcon: FallbackIcon = BotIcon,
}: {
  driver?: ProviderDriverKind | undefined;
  provider?: ServerProvider | undefined;
  status: string | null;
  fallbackIcon?: LucideIcon;
}) {
  const iconClassName = "size-4 shrink-0 text-muted-foreground";
  return (
    <span className="relative inline-flex size-4 shrink-0 items-center justify-center">
      {driver ? (
        <ProviderInstanceIcon
          driverKind={driver}
          displayName={provider?.displayName ?? driver}
          acpRegistryIconUrl={provider?.iconUrl}
          iconClassName={iconClassName}
          className="z-auto"
        />
      ) : (
        <FallbackIcon className={iconClassName} />
      )}
      <span
        className={cn(
          "absolute -bottom-1 -right-1 size-2 rounded-full border-2 border-card",
          status === "running" ||
            status === "in_progress" ||
            status === "pending" ||
            status === "waiting"
            ? "bg-info"
            : status === "failed" || status === "error"
              ? "bg-destructive"
              : status === "completed"
                ? "bg-success"
                : "bg-muted-foreground/45",
        )}
        aria-hidden="true"
      />
    </span>
  );
}
