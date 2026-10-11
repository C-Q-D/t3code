/** Localized device UI and interactions; preserves user data, commands, and protocol values. */
import { t } from "~/i18n";
import { DeviceHostUpdates } from "./DeviceHostUpdates";
import type { DevicePlatform, DeviceServiceState, EnvironmentId } from "@t3tools/contracts";
import { Check } from "lucide-react";
import { Check as CheckGlyph, CircleAlert } from "lucide";
import { AuthSettingsWriteScope } from "@t3tools/contracts";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import { DialogClose } from "~/components/ui/dialog";
import { MorphIcon } from "~/components/MorphIcon";
import { WizardHeader, WizardPanel, WizardSteps, WizardFooter } from "~/components/ui/wizard";
import { Spinner } from "~/components/ui/spinner";
import { Switch } from "~/components/ui/switch";
import { deviceEnvironment } from "~/state/device";
import { useAtomCommand } from "~/state/use-atom-command";
import { readEnvironmentScope, useEnvironmentScope } from "~/state/session";
import { cn } from "~/lib/utils";

const platformName = (platform: DevicePlatform) => (platform === "ios" ? "iOS" : "Android");

export const deviceHubDescription = t.tools.device.hubDescription;
export const agentDeviceDescription = t.tools.device.agentDescription;

/**
 * Returns platform readiness and setup guidance from host capabilities and discovered devices.
 * @param state Current device service snapshot, including host status and platform availability.
 * @param platform Original platform identifier used to select UI guidance.
 * @returns The value described above, without changing user data or protocol identifiers.
 */
export function platformSetupStatus(state: DeviceServiceState, platform: DevicePlatform) {
  const availability = state.hosts
    .flatMap((host) => host.platforms)
    .find((candidate) => candidate.platform === platform);
  if (!availability?.available) {
    return {
      ready: false,
      message: availability?.reason ?? t.tools.device.supportNotDetected(platformName(platform)),
    };
  }
  if (
    state.hostStatus === "ready" &&
    !state.devices.some((device) => device.platform === platform)
  ) {
    return {
      ready: false,
      message: platform === "ios" ? t.tools.device.noIosRuntime : t.tools.device.noAndroidRuntime,
    };
  }
  return {
    ready: true,
    message: platform === "ios" ? t.tools.device.iosReady : t.tools.device.androidReady,
  };
}

/**
 * Renders the device setup wizard; configuration writes use the owning environment permissions.
 * @param props Component properties and callbacks defined by the parameter type.
 * @returns Rendered UI for the supplied props.
 */
export function DeviceSetup(props: {
  readonly environmentId: EnvironmentId;
  readonly state: DeviceServiceState;
  readonly onComplete?: () => void;
}) {
  const canConfigure = useEnvironmentScope(props.environmentId, AuthSettingsWriteScope);
  const configure = useAtomCommand(deviceEnvironment.configure);
  const list = useAtomCommand(deviceEnvironment.list, { reportFailure: false });
  const [pending, setPending] = useState<"hub" | "check" | "agent" | "complete" | null>(null);
  const [step, setStep] = useState(0);
  const enabled = props.state.hostStatus !== "disabled";
  const busy = props.state.hostStatus === "installing" || props.state.hostStatus === "starting";
  const localPlatformsUnavailable = props.state.hosts.some(
    (host) => host.kind === "local" && !host.platforms.some((platform) => platform.available),
  );

  const update = async (
    kind: NonNullable<typeof pending>,
    input: { enabled?: boolean; agentAccessEnabled?: boolean; onboardingCompleted?: boolean },
  ) => {
    if (!readEnvironmentScope(props.environmentId, AuthSettingsWriteScope)) return;
    setPending(kind);
    try {
      const result = await configure({ environmentId: props.environmentId, input });
      if (kind === "complete" && result._tag === "Success") props.onComplete?.();
    } finally {
      setPending(null);
    }
  };

  return (
    <>
      <WizardHeader title={t.tools.device.setup} description={t.tools.device.setupHint}>
        <WizardSteps
          steps={[t.tools.device.hub, t.tools.device.simulators, t.tools.device.agentAccess]}
          currentStep={step}
          onStepChange={setStep}
          isStepDisabled={(requested) => busy || pending !== null || requested > step}
        />
      </WizardHeader>

      <WizardPanel>
        <DeviceHostUpdates state={props.state} environmentId={props.environmentId} />
        {step === 0 ? (
          <section className="space-y-3 text-sm">
            <h3 className="font-medium">{t.tools.device.enableHubHeading}</h3>
            <div className="flex items-start justify-between gap-4">
              <p className="text-muted-foreground">{deviceHubDescription}</p>
              <Switch
                checked={enabled}
                disabled={!canConfigure || busy || pending !== null}
                aria-label={t.tools.device.enableHub}
                onCheckedChange={(checked) =>
                  void update("hub", {
                    enabled: Boolean(checked),
                    ...(checked ? {} : { agentAccessEnabled: false }),
                  })
                }
              />
            </div>
            <DeviceHubSetupStatus
              state={props.state}
              pending={pending === "hub" || (busy && pending !== "agent")}
            />
          </section>
        ) : null}

        {step === 1 || (step === 0 && enabled && localPlatformsUnavailable) ? (
          <section className={cn("space-y-3 text-sm", step === 0 && "mt-4")}>
            <h3 className="font-medium">{t.tools.device.checkSupport}</h3>
            <DevicePlatformSetup
              state={props.state}
              checking={pending === "check"}
              disabled={!enabled || busy || pending !== null}
              onCheck={() => {
                setPending("check");
                void list({ environmentId: props.environmentId, input: {} }).finally(() =>
                  setPending(null),
                );
              }}
            />
          </section>
        ) : null}

        {step === 2 ? (
          <section className="space-y-3 text-sm">
            <h3 className="font-medium">{t.tools.device.allowAgentControl}</h3>
            <div className="flex items-start justify-between gap-4">
              <p className="text-muted-foreground">{agentDeviceDescription}</p>
              <Switch
                checked={props.state.agentAccessEnabled}
                disabled={!canConfigure || !enabled || busy || pending !== null}
                aria-label={t.tools.device.allowAgents}
                onCheckedChange={(checked) =>
                  void update("agent", { agentAccessEnabled: Boolean(checked) })
                }
              />
            </div>
            <AgentDeviceSetupStatus state={props.state} pending={pending === "agent"} />
            <p className="text-xs text-muted-foreground">{t.tools.device.manualOnlyHint}</p>
          </section>
        ) : null}
        {props.state.hostStatus === "failed" && props.state.hostStatusDetail ? (
          <p role="alert" className="mt-3 text-xs text-destructive">
            {props.state.hostStatusDetail}
          </p>
        ) : null}
      </WizardPanel>

      <WizardFooter>
        {step === 0 ? (
          <DialogClose render={<Button variant="outline" />}>{t.common.confirm.cancel}</DialogClose>
        ) : (
          <Button
            variant="outline"
            disabled={busy || pending !== null}
            onClick={() => setStep(step - 1)}
          >
            {t.tools.device.back}
          </Button>
        )}
        {step < 2 ? (
          <Button
            disabled={props.state.hostStatus !== "ready" || pending !== null}
            onClick={() => setStep(step + 1)}
          >
            {t.tools.device.continue}
          </Button>
        ) : (
          <Button
            disabled={!canConfigure || props.state.hostStatus !== "ready" || pending !== null}
            onClick={() => void update("complete", { onboardingCompleted: true })}
          >
            {pending === "complete" ? t.tools.device.saving : t.tools.device.done}
          </Button>
        )}
      </WizardFooter>
    </>
  );
}

/**
 * Renders pending hub progress or confirmed readiness; returns null otherwise.
 * @param props View data, control flags, and callbacks defined by the component props type; optional fields retain their declared defaults.
 * @returns Status UI, or null when neither pending nor ready.
 */
export function DeviceHubSetupStatus({
  state,
  pending,
  compact = false,
}: {
  readonly state: DeviceServiceState;
  readonly pending: boolean;
  readonly compact?: boolean;
}) {
  if (!pending && state.hostStatus !== "ready") return null;
  return (
    <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
      {pending ? <Spinner size="xs" /> : <Check className="size-3 text-success" />}
      {pending
        ? state.hostStatus === "installing"
          ? compact
            ? t.tools.device.installing
            : t.tools.device.installingHub
          : state.hostStatus === "starting"
            ? compact
              ? t.tools.device.startingProgress
              : t.tools.device.startingHub
            : compact
              ? t.tools.device.updating
              : t.tools.device.updatingHub
        : t.tools.device.hubReady}
    </p>
  );
}

/**
 * Renders both platform checks and invokes the supplied refresh action when requested.
 * @param props Component properties and callbacks defined by the parameter type.
 * @returns Rendered UI for the supplied props.
 */
function DevicePlatformSetup(props: {
  readonly state: DeviceServiceState;
  readonly checking: boolean;
  readonly disabled: boolean;
  readonly onCheck: () => void;
}) {
  return (
    <div className="space-y-3">
      <PlatformStatus platform="iOS" status={platformSetupStatus(props.state, "ios")} />
      <PlatformStatus platform="Android" status={platformSetupStatus(props.state, "android")} />
      <p className="text-xs text-muted-foreground">{t.tools.device.platformHint}</p>
      <Button size="compact" variant="outline" disabled={props.disabled} onClick={props.onCheck}>
        {props.checking ? <Spinner size="xs" /> : null}
        {props.checking ? t.tools.device.checking : t.tools.device.checkAgain}
      </Button>
    </div>
  );
}

/**
 * Renders pending agent tool progress or confirmed readiness; returns null otherwise.
 * @param props Component properties and callbacks defined by the parameter type.
 * @returns Progress or readiness UI; null unless pending, or agent access is enabled and installed on a ready host.
 */
export function AgentDeviceSetupStatus(props: {
  readonly state: DeviceServiceState;
  readonly pending: boolean;
  readonly compact?: boolean;
}) {
  if (props.pending) {
    const label =
      props.state.hostStatus === "installing"
        ? props.compact
          ? t.tools.device.installing
          : t.tools.device.installingAgentTools
        : props.state.hostStatus === "starting"
          ? props.compact
            ? t.tools.device.startingProgress
            : t.tools.device.startingAgentTools
          : props.compact
            ? t.tools.device.updating
            : t.tools.device.updatingAgentAccess;
    return (
      <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
        <Spinner size="xs" />
        {label}
      </p>
    );
  }
  if (
    props.state.agentAccessEnabled &&
    props.state.hostStatus === "ready" &&
    props.state.hosts.some((host) => host.agentDeviceInstalled)
  ) {
    return (
      <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
        <Check className="size-3 text-success" />
        {t.tools.device.agentToolsReady}
      </p>
    );
  }
  return null;
}

/**
 * Renders one platform readiness indicator and its supplied setup message.
 * @param props Component properties and callbacks defined by the parameter type.
 * @returns Rendered UI for the supplied props.
 */
export function PlatformStatus(props: {
  readonly platform: string;
  readonly status: { readonly ready: boolean; readonly message: string };
  readonly compact?: boolean;
}) {
  return (
    <div
      className={cn("flex gap-2", !props.compact && "rounded-md border border-border/60 px-3 py-2")}
    >
      <MorphIcon
        className={cn(
          "mt-0.5 size-4 shrink-0",
          props.status.ready ? "text-success" : "text-muted-foreground",
        )}
        icon={props.status.ready ? CheckGlyph : CircleAlert}
      />
      <div className={cn(props.compact && props.status.ready && "flex items-center gap-2")}>
        <p className="font-medium">{props.platform}</p>
        <p className="text-xs text-muted-foreground">
          {props.compact && props.status.ready ? t.tools.device.ready : props.status.message}
        </p>
      </div>
    </div>
  );
}
