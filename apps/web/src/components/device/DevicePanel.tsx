/** Localized device UI and interactions; preserves user data, commands, and protocol values. */
import { t } from "~/i18n";
import { DeviceHostUpdates } from "./DeviceHostUpdates";
import type {
  DevicePlatform,
  DeviceServiceState,
  DeviceSummary,
  ScopedThreadRef,
} from "@t3tools/contracts";
import { CircleAlert, Smartphone, X } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

import { usePreviewMiniPlayerStore } from "~/previewMiniPlayerStore";
import { useRightPanelStore, type RightPanelSurface } from "~/rightPanelStore";
import { Button } from "~/components/ui/button";
import { Dialog } from "~/components/ui/dialog";
import { WizardPopup } from "~/components/ui/wizard";
import { Spinner } from "~/components/ui/spinner";
import { cn } from "~/lib/utils";
import { deviceEnvironment, useDeviceState } from "~/state/device";
import { formatEnvironmentQueryError } from "~/state/query";
import { useAtomCommand } from "~/state/use-atom-command";
import { DeviceLoadingView } from "./DeviceLoadingView";
import { DeviceSetup, deviceHubReadiness, isAndroidDiscoveryUncertain } from "./DeviceSetup";
import { DeviceWorkspace } from "./DeviceWorkspace";
import { PreviewPanelShell, type PreviewPanelMode } from "../preview/PreviewPanelShell";
import {
  Menu,
  MenuTrigger,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuRadioItemIndicator,
} from "~/components/ui/menu";
import { ChevronDown } from "lucide-react";

/**
 * @param platform Device group's iOS or Android platform discriminator.
 * @returns The localized simulator or emulator heading used in the device picker.
 */
const platformLabel = (platform: DevicePlatform) =>
  platform === "ios" ? t.tools.device.iosSimulators : t.tools.device.androidEmulators;

const deviceKey = (device: Pick<DeviceSummary, "hostId" | "id">) =>
  `${device.hostId}\u0000${device.id}`;

/** Each surface owns one host/device; only the visible surface streams.
 * @param props Component properties and callbacks defined by the parameter type.
 * @returns Rendered UI for the supplied props.
 */
export function DevicePanel(props: {
  readonly mode: PreviewPanelMode;
  readonly threadRef: ScopedThreadRef;
  readonly surface: Extract<RightPanelSurface, { kind: "device" }>;
  readonly visible: boolean;
  readonly onDismissSetup: () => void;
}) {
  const { environmentId, threadId } = props.threadRef;
  const { state, loaded } = useDeviceState(environmentId);
  const list = useAtomCommand(deviceEnvironment.list, { reportFailure: false });
  const open = useAtomCommand(deviceEnvironment.open);
  const close = useAtomCommand(deviceEnvironment.close);
  // The panel stays mounted across thread switches, so an in-flight open or
  // power-off is tagged with the thread it belongs to and only shown there.
  const scope = `${environmentId}\u0000${threadId}`;
  const [operation, setOperation] = useState<{
    readonly scope: string;
    readonly pending: DeviceSummary | null;
    readonly error: string | null;
  } | null>(null);
  const pendingDevice = operation?.scope === scope ? operation.pending : null;
  const operationError = operation?.scope === scope ? operation.error : null;
  const pendingDeviceKey = pendingDevice ? deviceKey(pendingDevice) : null;

  const hostDisabled = state.hostStatus === "disabled";

  // Opening setup never grants permission to install or start helpers.
  useEffect(() => {
    if (!props.visible || !loaded || hostDisabled) return;
    void list({ environmentId, input: {} });
  }, [environmentId, list, loaded, props.visible, hostDisabled]);

  const sessions = state.sessions.filter((session) => session.threadId === threadId);
  const activeSession = props.surface.target
    ? sessions.find(
        (session) =>
          session.deviceId === props.surface.target?.deviceId &&
          session.hostId === props.surface.target.hostId,
      )
    : undefined;
  const activeDevice = activeSession
    ? state.devices.find(
        (device) => device.hostId === activeSession.hostId && device.id === activeSession.deviceId,
      )
    : undefined;

  const grouped = groupDevices(state);

  const startOperation = (pending: DeviceSummary | null) => {
    const started = { scope, pending, error: null };
    setOperation(started);
    // Returning to the same thread can start a newer operation before this one settles.
    return (error: string | null) =>
      setOperation((current) =>
        current === started ? { ...started, pending: null, error } : current,
      );
  };

  const selectDevice = async (value: string) => {
    const device = state.devices.find((candidate) => deviceKey(candidate) === value);
    if (!device) return;
    const settleOperation = startOperation(device);
    const result = await open({
      environmentId,
      input: {
        threadId,
        hostId: device.hostId,
        deviceId: device.id,
        platform: device.platform,
      },
    });
    if (result._tag === "Failure") settleOperation(formatEnvironmentQueryError(result.cause));
    else {
      // The server opened the device for the starting thread, so its tab opens there.
      useRightPanelStore.getState().openDevice(props.threadRef, {
        hostId: result.value.hostId,
        deviceId: result.value.deviceId,
        platform: device.platform,
        name: device.name,
      });
      settleOperation(null);
    }
  };

  const floatActive = () => {
    if (!activeDevice) return;
    usePreviewMiniPlayerStore.getState().open(props.threadRef, {
      kind: "device",
      hostId: activeDevice.hostId,
      deviceId: activeDevice.id,
      platform: activeDevice.platform,
      name: activeDevice.name,
    });
    useRightPanelStore.getState().close(props.threadRef);
  };

  const closeActive = (powerOff: boolean) => {
    if (!powerOff) {
      useRightPanelStore.getState().closeSurface(props.threadRef, props.surface.id);
      return;
    }
    if (!activeSession) return;
    const settleOperation = startOperation(null);
    void close({
      environmentId,
      input: {
        threadId,
        hostId: activeSession.hostId,
        deviceId: activeSession.deviceId,
        shutdown: powerOff,
      },
    }).then((result) => {
      if (result._tag === "Failure") settleOperation(formatEnvironmentQueryError(result.cause));
      else useRightPanelStore.getState().closeSurface(props.threadRef, props.surface.id);
    });
  };

  const bootingDevices =
    state.bootingDevices?.filter((device) => device.threadId === threadId) ?? [];
  const { ready: hostReady, busy: hostBusy } = deviceHubReadiness(state);
  const loading = !activeDevice && (pendingDevice !== null || hostBusy || !loaded);
  const diagnostics = state.hosts.flatMap((host) => {
    const status = state.hostStatuses[host.id];
    const detail = status?.detail ?? (host.kind === "local" ? state.hostStatusDetail : undefined);
    return detail && (status?.status ?? state.hostStatus) === "ready"
      ? [{ hostId: host.id, label: host.label, detail }]
      : [];
  });
  const unavailablePlatforms = state.hosts.flatMap((host) =>
    host.platforms
      .filter((platform) => !platform.available)
      .map((platform) => ({ ...platform, hostId: host.id, hostLabel: host.label })),
  );

  if (loaded && (!state.onboardingCompleted || hostDisabled)) {
    return (
      <Dialog
        open={props.visible}
        onOpenChange={(isOpen) => {
          if (!isOpen) props.onDismissSetup();
        }}
      >
        <WizardPopup>
          <DeviceSetup environmentId={environmentId} state={state} />
        </WizardPopup>
      </Dialog>
    );
  }

  return (
    <PreviewPanelShell mode={props.mode}>
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          className={cn(
            "shrink-0 bg-background",
            loading && "absolute inset-x-0 top-0 z-10 max-h-[40%] overflow-y-auto",
          )}
        >
          <div hidden={!!activeDevice}>
            {diagnostics.map((diagnostic) => (
              <DeviceDiscoveryWarning
                key={`${environmentId}\u0000${diagnostic.hostId}\u0000${diagnostic.detail}`}
                label={diagnostic.label}
                detail={diagnostic.detail}
              />
            ))}
          </div>
          <DeviceHostUpdates state={state} environmentId={environmentId} />
          {bootingDevices.length > 0 ? (
            <div role="status" className="border-b px-3 py-2 text-xs text-muted-foreground">
              {t.tools.device.starting} {bootingDevices.map((device) => device.name).join(", ")}
              {t.tools.device.startHint}
            </div>
          ) : null}
          {operationError ? (
            <DeviceNotice tone="error" onDismiss={() => setOperation(null)}>
              {operationError}
            </DeviceNotice>
          ) : null}
        </div>
        <div className="device-panel @container relative flex min-h-0 flex-1">
          {activeDevice && activeSession ? (
            <DeviceWorkspace
              key={`${environmentId}\u0000${deviceKey(activeDevice)}`}
              environmentId={environmentId}
              device={activeDevice}
              hostLabel={
                state.hosts.find((host) => host.id === activeDevice.hostId)?.label ??
                t.tools.device.host
              }
              hostDiagnostics={
                diagnostics.find(({ hostId }) => hostId === activeDevice.hostId)?.detail
              }
              visible={props.visible}
              onFloat={floatActive}
              onClose={() => closeActive(false)}
              onPowerOff={() => closeActive(true)}
              devicePicker={
                <Menu>
                  <MenuTrigger
                    render={
                      <Button size="md" variant="secondary" disabled={pendingDeviceKey !== null} />
                    }
                  >
                    <span className="truncate">
                      {activeDevice.name} · {activeDevice.version}
                    </span>
                    <ChevronDown className="size-3 shrink-0" />
                  </MenuTrigger>
                  <MenuPopup align="start">
                    <MenuRadioGroup
                      value={deviceKey(activeDevice)}
                      onValueChange={(value) => {
                        if (value !== deviceKey(activeDevice)) void selectDevice(value);
                      }}
                    >
                      {grouped.flatMap((group) =>
                        group.devices.map((device) => (
                          <MenuRadioItem key={deviceKey(device)} value={deviceKey(device)}>
                            <span className="flex min-w-0 flex-1 flex-col">
                              <span>{device.name}</span>
                              <span className="text-xs text-muted-foreground">
                                {state.hosts.find((host) => host.id === device.hostId)?.label} ·{" "}
                                {device.version} ·{" "}
                                {device.booted ? t.tools.device.running : t.tools.device.stopped}
                              </span>
                            </span>
                            <MenuRadioItemIndicator />
                          </MenuRadioItem>
                        )),
                      )}
                    </MenuRadioGroup>
                  </MenuPopup>
                </Menu>
              }
            />
          ) : loading ? (
            <DeviceLoadingView
              name={pendingDevice?.name ?? t.tools.device.devices}
              description={
                pendingDevice
                  ? `${state.hosts.find((host) => host.id === pendingDevice.hostId)?.label ?? t.tools.device.host} · ${pendingDevice.version}`
                  : ""
              }
              stage="opening"
              message={
                pendingDevice
                  ? pendingDevice.booted
                    ? t.tools.device.openingDevice
                    : t.tools.device.startingDevice
                  : state.hostStatus === "installing"
                    ? (state.hostStatusDetail ?? t.tools.device.installingSupport)
                    : t.tools.device.findingDevices
              }
            />
          ) : (
            <div className="device-picker scrollbar-gutter-both flex size-full flex-col overflow-y-auto px-5 py-8 text-sm text-muted-foreground">
              <div
                className={cn(
                  "mx-auto flex w-full max-w-xl flex-col gap-6",
                  grouped.length === 0 && "my-auto items-center text-center",
                )}
              >
                {grouped.length === 0 ? (
                  <>
                    <Smartphone className="size-6 opacity-60" />
                    <p
                      className="max-h-32 w-full max-w-sm overflow-y-auto whitespace-pre-line break-words"
                      tabIndex={state.hostStatus === "failed" ? 0 : undefined}
                    >
                      {state.hostStatus === "failed"
                        ? (state.hostStatusDetail ?? t.tools.device.hubFailed)
                        : t.tools.device.noDevices}
                    </p>
                  </>
                ) : null}
                {hostReady && grouped.length > 0 ? (
                  <div className="w-full space-y-6 text-left">
                    {grouped.map((group) => (
                      <section key={group.platform} className="space-y-3">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Smartphone className="size-4 shrink-0" />
                          <h3 className="font-medium">{platformLabel(group.platform)}</h3>
                        </div>
                        <div className="flex flex-col gap-1.5">
                          {group.devices.map((device) => (
                            <button
                              type="button"
                              key={deviceKey(device)}
                              className="device-picker-row"
                              disabled={pendingDeviceKey !== null}
                              aria-label={`${device.booted ? t.tools.device.open : t.tools.device.start} ${device.name}`}
                              onClick={() => void selectDevice(deviceKey(device))}
                            >
                              <Smartphone className="size-4.25 shrink-0" />
                              <span className="flex min-w-0 flex-1 flex-col">
                                <span className="truncate font-semibold text-foreground">
                                  {device.name}
                                </span>
                                <span className="truncate text-secondary-copy text-secondary-label">
                                  {state.hosts.find((host) => host.id === device.hostId)?.label} ·{" "}
                                  {device.version} ·{" "}
                                  {device.booted ? t.tools.device.running : t.tools.device.stopped}
                                </span>
                              </span>
                              {pendingDeviceKey === deviceKey(device) ? (
                                <Spinner size="xs" />
                              ) : (
                                <span className="text-secondary-copy text-secondary-label">
                                  {device.booted ? t.tools.device.open : t.tools.device.start}
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                ) : null}
                {hostReady &&
                !isAndroidDiscoveryUncertain(state) &&
                !state.devices.some((device) => device.platform === "android") &&
                !unavailablePlatforms.some((platform) => platform.platform === "android") ? (
                  <p className="max-w-sm text-xs">{t.tools.device.noAndroidDevices}</p>
                ) : null}
                {loaded && !hostBusy ? (
                  <Button
                    className={grouped.length > 0 ? "self-start" : "self-center"}
                    variant={grouped.length > 0 ? "ghost" : "outline"}
                    size="sm"
                    onClick={() => void list({ environmentId, input: {} })}
                  >
                    {t.tools.device.refreshDevices}
                  </Button>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>
    </PreviewPanelShell>
  );
}

function DeviceNotice(props: {
  readonly tone: "warning" | "error";
  readonly onDismiss: () => void;
  readonly children: ReactNode;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-2 border-b px-3 py-2 text-xs",
        props.tone === "warning"
          ? "bg-warning-surface text-warning-foreground"
          : "bg-destructive/5 text-destructive",
      )}
    >
      <CircleAlert className="mt-1 size-3.5 shrink-0" />
      <div
        className="max-h-32 min-w-0 flex-1 overflow-y-auto whitespace-pre-wrap break-words"
        tabIndex={0}
      >
        {props.children}
      </div>
      <Button
        size="icon-xs"
        variant="ghost"
        aria-label={
          props.tone === "warning" ? t.tools.deviceWarningUi.dismiss : t.tools.device.dismissError
        }
        onClick={props.onDismiss}
      >
        <X />
      </Button>
    </div>
  );
}

function DeviceDiscoveryWarning(props: { readonly label: string; readonly detail: string }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <DeviceNotice tone="warning" onDismiss={() => setDismissed(true)}>
      <p className="font-medium">
        {t.tools.deviceWarningUi.discovery} {props.label}
      </p>
      {props.detail}
    </DeviceNotice>
  );
}

function groupDevices(state: DeviceServiceState) {
  const groups: Array<{ platform: DevicePlatform; devices: DeviceSummary[] }> = [];
  for (const platform of ["ios", "android"] as const) {
    const devices = state.devices
      .filter((device) => device.platform === platform)
      .toSorted((a, b) => Number(b.booted) - Number(a.booted) || a.name.localeCompare(b.name));
    if (devices.length > 0) groups.push({ platform, devices });
  }
  return groups;
}
