/** Provider update notices retain their status, settings action, and dismissal lifecycle. */
import { t } from "~/i18n";
import { useNavigate } from "@tanstack/react-router";
import { useAtomValue } from "@effect/atom-react";
import type { ServerProvider } from "@t3tools/contracts";
import { BotIcon, CircleCheckIcon, HourglassIcon, TriangleAlertIcon, XIcon } from "lucide-react";
import { useEffectEvent, useEffect, useState, type CSSProperties } from "react";

import { primaryServerProvidersAtom } from "../../state/server";
import {
  getProviderUpdateSidebarPillView,
  type ProviderUpdateSidebarPillView,
} from "../ProviderUpdateLaunchNotification.logic";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { sidebarNoticeRegistry } from "./SidebarChrome";

// Matches the duration-180 transition in styles/sidebar.css.
const PROVIDER_UPDATE_PILL_EXIT_MS = 180;

/** Return the latest ISO check timestamp, or undefined when there are no providers. */
function latestProviderCheckedAt(
  providers: ReadonlyArray<Pick<ServerProvider, "checkedAt">>,
): string | undefined {
  return providers.reduce<string | undefined>(
    (latest, provider) =>
      latest === undefined || provider.checkedAt > latest ? provider.checkedAt : latest,
    undefined,
  );
}

/** Show provider update status; pressing the notice opens settings and closing dismisses its key. */
export function SidebarProviderUpdatePill() {
  const navigate = useNavigate();
  const providers = useAtomValue(primaryServerProvidersAtom);
  const [dismissedKeys, setDismissedKeys] = useState<ReadonlySet<string>>(() => new Set());
  const [renderedView, setRenderedView] = useState<ProviderUpdateSidebarPillView | null>(null);
  const [pendingView, setPendingView] = useState<ProviderUpdateSidebarPillView | null>(null);
  const [exitingKey, setExitingKey] = useState<string | null>(null);
  const [dismissAfterExitKey, setDismissAfterExitKey] = useState<string | null>(null);
  const [visibleAfterIso, setVisibleAfterIso] = useState<string | undefined>();
  const effectiveVisibleAfterIso = visibleAfterIso ?? latestProviderCheckedAt(providers);
  const view = getProviderUpdateSidebarPillView(providers, {
    ...(effectiveVisibleAfterIso !== undefined
      ? { visibleAfterIso: effectiveVisibleAfterIso }
      : {}),
    dismissedKeys,
  });

  if (visibleAfterIso === undefined && effectiveVisibleAfterIso !== undefined) {
    setVisibleAfterIso(effectiveVisibleAfterIso);
  }

  const openProviderSettings = () => {
    void navigate({ to: "/settings/providers" });
  };
  const displayedView = renderedView ?? view;
  const dismissAfterVisibleMs = displayedView?.dismissAfterVisibleMs;
  const viewKey = displayedView?.key ?? null;
  const showDismissProgress =
    dismissAfterVisibleMs !== undefined &&
    displayedView?.tone !== "loading" &&
    exitingKey !== viewKey;

  const startExit = (
    key: string,
    nextView: ProviderUpdateSidebarPillView | null,
    dismissKey?: string,
  ) => {
    if (exitingKey === key) {
      return;
    }
    setPendingView(nextView);
    setExitingKey(key);
    setDismissAfterExitKey(dismissKey ?? null);
  };

  if (exitingKey === null) {
    if (!renderedView) {
      if (view) {
        setRenderedView(view);
      }
    } else if (!view) {
      startExit(renderedView.key, null);
    } else if (view.key !== renderedView.key) {
      startExit(renderedView.key, view);
    }
  }

  const exitAfterVisible = useEffectEvent((key: string) => startExit(key, null, key));

  const finishExit = useEffectEvent(() => {
    if (dismissAfterExitKey !== null) {
      setDismissedKeys((previous) => new Set(previous).add(dismissAfterExitKey));
    }
    setRenderedView(pendingView);
    setPendingView(null);
    setExitingKey(null);
    setDismissAfterExitKey(null);
  });

  useEffect(() => {
    if (exitingKey === null) return;
    // A cancelled or skipped CSS transition must not keep a hidden spinner mounted.
    const timeoutId = window.setTimeout(finishExit, PROVIDER_UPDATE_PILL_EXIT_MS);
    return () => window.clearTimeout(timeoutId);
  }, [exitingKey]);

  useEffect(() => {
    if (!dismissAfterVisibleMs || !viewKey) {
      return;
    }
    if (exitingKey === viewKey) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      exitAfterVisible(viewKey);
    }, dismissAfterVisibleMs);

    return () => window.clearTimeout(timeoutId);
  }, [dismissAfterVisibleMs, exitingKey, viewKey]);

  const visible = displayedView !== null;
  sidebarNoticeRegistry.useRegister("provider", visible);
  if (!displayedView) {
    return null;
  }

  return (
    <div
      className={`sidebar-provider-update ${
        exitingKey === displayedView.key ? "sidebar-provider-update-exiting" : ""
      }`}
      data-tone={displayedView.tone}
    >
      {showDismissProgress ? (
        <div
          key={displayedView.key}
          aria-hidden="true"
          className="sidebar-provider-update-progress"
          style={
            {
              "--provider-update-pill-dismiss-ms": `${dismissAfterVisibleMs}ms`,
            } as CSSProperties
          }
        />
      ) : null}
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              aria-label={displayedView.description}
              data-provider-update-main
              className="sidebar-provider-update-main"
              onClick={openProviderSettings}
            >
              {displayedView.tone === "loading" ? (
                <HourglassIcon className="size-3.5 shrink-0" aria-label={t.app.actions.loading} />
              ) : displayedView.tone === "success" ? (
                <CircleCheckIcon className="size-3.5 shrink-0" />
              ) : displayedView.tone === "error" ? (
                <TriangleAlertIcon className="size-3.5 shrink-0" />
              ) : (
                <BotIcon className="size-3.5 shrink-0" />
              )}
              <span className="min-w-0 wrap-break-word">{displayedView.title}</span>
            </button>
          }
        />
        <TooltipPopup side="top">{displayedView.description}</TooltipPopup>
      </Tooltip>
      {displayedView.dismissible && (
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                aria-label={t.sidebar.providerUpdates.dismissAriaLabel}
                className="sidebar-provider-update-dismiss"
                onClick={() => startExit(displayedView.key, null, displayedView.key)}
              >
                <XIcon className="size-3.25 shrink-0" />
              </button>
            }
          />
          <TooltipPopup side="top">{t.sidebar.providerUpdates.dismissTooltip}</TooltipPopup>
        </Tooltip>
      )}
    </div>
  );
}
