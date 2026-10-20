/** Keeps Cursor keychain opt-in explicit; reports successful activation to the page. */
import { t } from "~/i18n";
import { ProviderDriverKind, type EnvironmentId } from "@t3tools/contracts";
import { useState } from "react";
import type { EnvironmentUsageStatus } from "../../state/usage";
import { useAtomCommand } from "../../state/use-atom-command";
import { serverEnvironment } from "../../state/server";
import { Button, InlineButton } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { ProviderInstanceIcon } from "../chat/ProviderInstanceIcon";

const CURSOR_KEYCHAIN_COPY = t.tools.usage.keychainHint;

/** Enables Cursor keychain usage for environmentId on click; label identifies the environment, tooltip selects presentation, and onEnabled refreshes successful changes. */
export function CursorEnableButton({
  environmentId,
  label,
  onEnabled,
  tooltip,
  buttonText = t.tools.usage.enable,
}: {
  readonly environmentId: EnvironmentId;
  readonly label: string;
  readonly onEnabled: () => void;
  readonly tooltip: boolean;
  readonly buttonText?: string;
}) {
  const updateSettings = useAtomCommand(serverEnvironment.updateSettings, {
    label: "enable Cursor account usage",
  });
  const [pending, setPending] = useState(false);
  const enable = async () => {
    setPending(true);
    try {
      const result = await updateSettings({
        environmentId,
        input: { patch: { cursorKeychainUsageEnabled: true } },
      });
      if (result._tag === "Success") onEnabled();
    } finally {
      setPending(false);
    }
  };
  const button = tooltip ? (
    <InlineButton
      disabled={pending}
      aria-busy={pending}
      aria-label={t.tools.usage.enableCursorUsage(label)}
      onClick={() => void enable()}
    >
      {buttonText}
    </InlineButton>
  ) : (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      aria-busy={pending}
      aria-label={t.tools.usage.enableCursorUsage(label)}
      onClick={() => void enable()}
    >
      {buttonText}
    </Button>
  );
  if (!tooltip) return button;
  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipPopup>{CURSOR_KEYCHAIN_COPY}</TooltipPopup>
    </Tooltip>
  );
}

/** Renders Cursor usage enable controls for the supplied environments and invokes onEnabled after successful activation. */
export function CursorEnableLimits({
  environments,
  onEnabled,
}: {
  readonly environments: readonly EnvironmentUsageStatus[];
  readonly onEnabled: () => void;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 text-sm font-medium text-foreground">
        <ProviderInstanceIcon
          driverKind={ProviderDriverKind.make("cursor")}
          displayName="Cursor"
          indicatorBackground="var(--background)"
          className="size-5"
          iconClassName="size-4 text-foreground/80"
        />
        Cursor
      </h2>
      <div className="flex flex-col items-start gap-3 rounded-lg border border-border/60 p-4">
        <p className="text-xs text-muted-foreground">{CURSOR_KEYCHAIN_COPY}</p>
        <div className="flex flex-wrap gap-2">
          {environments.map((environment) => (
            <CursorEnableButton
              key={environment.environmentId}
              environmentId={environment.environmentId}
              label={environment.label}
              buttonText={
                environments.length > 1
                  ? t.tools.usage.enableOn(environment.label)
                  : t.tools.usage.enable
              }
              onEnabled={onEnabled}
              tooltip={false}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
