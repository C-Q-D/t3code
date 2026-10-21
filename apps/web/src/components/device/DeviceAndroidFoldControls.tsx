/** Localized device UI and interactions; preserves user data, commands, and protocol values. */
import { t } from "~/i18n";
import type { DeviceHubAccess } from "@t3tools/client-runtime/state/deviceHubAccess";
import { useEffect, useRef, useState } from "react";
import { Button } from "~/components/ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import {
  AndroidFoldError,
  readAndroidFold,
  setAndroidFold,
  type AndroidFoldPosture,
  type AndroidFoldState,
} from "./deviceFold";
import { DeviceDuoGlyph } from "./DeviceDuoGlyph";

/** Capability comes from the emulator, not its AVD name or screen dimensions.
 * @param props Component properties and callbacks defined by the parameter type.
 * @returns Rendered UI for the supplied props.
 */
export function DeviceAndroidFoldControls(props: {
  readonly access: DeviceHubAccess;
  readonly deviceId: string;
  readonly visible: boolean;
  readonly enabled: boolean;
  readonly screenWidth: number | undefined;
  readonly screenHeight: number | undefined;
  readonly onFoldAngle: (angle: number | null) => void;
  readonly renewAccess: () => Promise<DeviceHubAccess | null>;
}) {
  const [fold, setFold] = useState<AndroidFoldState | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const mounted = useRef(true);
  const { access, deviceId, visible, enabled, screenWidth, screenHeight, onFoldAngle } = props;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!visible || !enabled || pending || !screenWidth || !screenHeight) return;
    const controller = new AbortController();
    let retry: number | undefined;
    const read = () => {
      void readAndroidFold(access, deviceId, controller.signal)
        .then((next) => {
          if (!controller.signal.aborted) {
            setFold(next);
            onFoldAngle(
              next.supported ? (next.hingeAngle ?? (next.posture === "closed" ? 0 : 180)) : null,
            );
          }
        })
        .catch((cause: unknown) => {
          // Retrying an expired ticket cannot succeed. New access re-runs this effect.
          const expired = cause instanceof AndroidFoldError && cause.status === 401;
          if (!controller.signal.aborted && !expired) retry = window.setTimeout(read, 3_000);
        });
    };
    read();
    return () => {
      controller.abort();
      window.clearTimeout(retry);
    };
  }, [access, deviceId, visible, enabled, screenWidth, screenHeight, pending, onFoldAngle]);

  if (!fold?.supported || !props.visible) return null;

  const change = (posture: AndroidFoldPosture) => {
    if (busy.current || !props.enabled) return;
    busy.current = true;
    setPending(true);
    setError(null);
    props.onFoldAngle(posture === "closed" ? 0 : 180);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 12_000);
    const send = (access: DeviceHubAccess) =>
      setAndroidFold(access, props.deviceId, posture, controller.signal);
    void send(props.access)
      .catch(async (cause: unknown) => {
        // Hub tickets expire after a few minutes, while the panel stays open much longer.
        if (!(cause instanceof AndroidFoldError && cause.status === 401)) throw cause;
        const renewed = await props.renewAccess();
        if (!renewed || controller.signal.aborted) throw cause;
        return send(renewed);
      })
      .then((next) => {
        if (mounted.current) {
          setFold(next);
          props.onFoldAngle(next.hingeAngle ?? (next.posture === "closed" ? 0 : 180));
        }
      })
      .catch((cause: unknown) => {
        if (mounted.current) {
          props.onFoldAngle(fold.hingeAngle ?? (fold.posture === "closed" ? 0 : 180));
          setError(
            controller.signal.aborted
              ? t.tools.device.foldTimeout
              : cause instanceof Error
                ? cause.message
                : t.tools.device.foldFailed,
          );
        }
      })
      .finally(() => {
        window.clearTimeout(timeout);
        busy.current = false;
        if (mounted.current) setPending(false);
      });
  };

  return (
    <div aria-label={t.tools.device.foldControls} className="device-fold-controls">
      <div className="device-controls-bar">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="icon"
                variant={fold.posture === "closed" ? "secondary" : "ghost"}
                aria-label={t.tools.device.fold}
                aria-pressed={fold.posture === "closed"}
                disabled={pending || !props.enabled}
                onClick={() => change("closed")}
              />
            }
          >
            <DeviceDuoGlyph pose="closed" />
          </TooltipTrigger>
          <TooltipPopup side="left">{t.tools.device.fold}</TooltipPopup>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="icon"
                variant={fold.posture === "opened" ? "secondary" : "ghost"}
                aria-label={t.tools.device.unfold}
                aria-pressed={fold.posture === "opened"}
                disabled={pending || !props.enabled}
                onClick={() => change("opened")}
              />
            }
          >
            <DeviceDuoGlyph pose="open" />
          </TooltipTrigger>
          <TooltipPopup side="left">{t.tools.device.unfold}</TooltipPopup>
        </Tooltip>
      </div>
      {error ? (
        <Tooltip>
          <TooltipTrigger
            render={
              <span
                tabIndex={0}
                role="alert"
                aria-label={error}
                className="pointer-events-auto text-xs text-destructive"
              >
                !
              </span>
            }
          />
          <TooltipPopup side="left">{error}</TooltipPopup>
        </Tooltip>
      ) : null}
    </div>
  );
}
