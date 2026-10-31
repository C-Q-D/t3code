/** Device screen, quick controls and drawer share one device session. */
import { t } from "~/i18n";
import type { DeviceHostSummary, DeviceSummary, EnvironmentId } from "@t3tools/contracts";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  captureDeviceScreenshot,
  DeviceScreenshotError,
} from "@t3tools/client-runtime/device/screenshot";
import { refreshDeviceHubAccess, useDeviceHubAccess } from "~/state/device";
import { DeviceControlsRail } from "./DeviceControlsRail";
import { DeviceStreamView } from "./DeviceStreamView";
import { DeviceToolsPanel } from "./DeviceToolsPanel";
import { useDeviceControls } from "./useDeviceControls";

/** Keyed by environment and device; the screen, quick controls and drawer share the same session.
 * @param props Component properties and callbacks defined by the parameter type.
 * @returns Rendered UI for the supplied props.
 */
export function DeviceWorkspace(props: {
  environmentId: EnvironmentId;
  device: DeviceSummary;
  hostLabel: string;
  hostKind: DeviceHostSummary["kind"] | undefined;
  hostDiagnostics: string | undefined;
  visible: boolean;
  onFloat: () => void;
  onClose: () => void;
  onPowerOff: () => void;
  devicePicker: ReactNode;
}) {
  const [toolsOpen, setToolsOpen] = useState(true);
  const [toolsExpanded, setToolsExpanded] = useState(false);
  const [axOverlay, setAxOverlay] = useState(false);
  const [screenshotPending, setScreenshotPending] = useState(false);
  const [screenshotError, setScreenshotError] = useState<string | null>(null);
  const captureRef = useRef<AbortController | null>(null);
  const downloadRef = useRef<string | null>(null);
  const access = useDeviceHubAccess(props.environmentId, props.device.hostId);
  const runsHostCommands = props.hostKind === "local" || props.hostKind === "ssh";
  const controls = useDeviceControls({
    ...props,
    access,
    visible: props.visible && runsHostCommands,
  });
  useEffect(() => {
    if (!access || !props.visible) captureRef.current?.abort();
    return () => {
      captureRef.current?.abort();
      if (downloadRef.current) URL.revokeObjectURL(downloadRef.current);
      downloadRef.current = null;
    };
  }, [access, props.visible]);
  const saveScreenshot = () => {
    if (!access || captureRef.current || !props.visible) return;
    const controller = new AbortController();
    captureRef.current = controller;
    setScreenshotPending(true);
    setScreenshotError(null);
    return captureDeviceScreenshot(
      { access, platform: props.device.platform, deviceId: props.device.id },
      controller.signal,
    )
      .then((image) => {
        if (controller.signal.aborted) return;
        if (downloadRef.current) URL.revokeObjectURL(downloadRef.current);
        const url = URL.createObjectURL(image);
        downloadRef.current = url;
        const link = document.createElement("a");
        link.href = url;
        link.download = `${props.device.name.replace(/[^a-z0-9-]/gi, "-")}-${Date.now()}.png`;
        document.body.append(link);
        link.click();
        link.remove();
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          if (cause instanceof DeviceScreenshotError && cause.status === 401)
            refreshDeviceHubAccess(props.environmentId);
          setScreenshotError(
            cause instanceof Error ? cause.message : t.tools.device.screenshotFailed,
          );
        }
      })
      .finally(() => {
        if (captureRef.current === controller) {
          captureRef.current = null;
          setScreenshotPending(false);
        }
      });
  };
  return (
    <>
      <div className="device-workspace relative flex min-h-0 min-w-0 flex-1 flex-col">
        {screenshotError || (controls.error && !toolsOpen) ? (
          <p role="alert" className="px-3 py-2 text-xs text-destructive">
            {screenshotError ?? controls.error}
          </p>
        ) : null}
        <div className="min-h-0 flex-1">
          <DeviceStreamView
            environmentId={props.environmentId}
            platform={props.device.platform}
            deviceName={props.device.name}
            deviceDescription={`${props.hostLabel} · ${props.device.version}`}
            deviceId={props.device.id}
            hostId={props.device.hostId}
            visible={props.visible}
            serveSimOnly={props.hostKind === "simlock"}
            axOverlay={axOverlay}
            allowPhoneView
            renderControls={(view) => (
              <DeviceControlsRail
                platform={props.device.platform}
                hostKind={props.hostKind}
                handle={view.handle}
                view={view}
                controls={controls}
                screenshotPending={screenshotPending}
                onScreenshot={() => void saveScreenshot()}
                tools={
                  toolsOpen && runsHostCommands ? (toolsExpanded ? "expanded" : "open") : "closed"
                }
                onTools={() => setToolsOpen(!toolsOpen)}
                onFloat={props.onFloat}
                onClose={props.onClose}
                onPowerOff={props.onPowerOff}
                devicePicker={props.devicePicker}
              />
            )}
          />
        </div>
      </div>
      {toolsOpen && runsHostCommands ? (
        <DeviceToolsPanel
          device={props.device}
          controls={controls}
          hostDiagnostics={props.hostDiagnostics}
          access={access}
          axOverlay={axOverlay}
          onAxOverlayChange={setAxOverlay}
          onExpandedChange={setToolsExpanded}
          onClose={() => setToolsOpen(false)}
          className="device-tools-drawer"
        />
      ) : null}
    </>
  );
}
