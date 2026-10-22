/** Renders provider model-picker navigation with shared pixel artwork. */
import { PixelSparkIcon } from "../icons/PixelLucideIcon";
import { t } from "~/i18n";
import { Toolbar } from "@base-ui/react/toolbar";
import { type ProviderInstanceId } from "@t3tools/contracts";
import { memo, useLayoutEffect, useRef, useState } from "react";
import { StarIcon } from "lucide-react";
import { ProviderInstanceIcon } from "./ProviderInstanceIcon";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { cn } from "~/lib/utils";
import { createSpringIndicator } from "~/lib/motion/springIndicator";
import { observeResize } from "~/lib/observeResize";
import {
  isProviderInstancePickerReady,
  shouldShowInstanceBadge,
  type ProviderInstanceEntry,
} from "../../providerInstances";

function describeUnavailableInstance(entry: ProviderInstanceEntry): string {
  const label = entry.displayName;
  if (!entry.enabled || entry.status === "disabled") {
    return t.composer.modelPicker.disabledHint(label);
  }
  if (entry.status === "ready" && entry.isAvailable) {
    return label;
  }
  const kind =
    entry.status === "error"
      ? t.composer.modelPicker.unavailable
      : entry.status === "warning"
        ? t.composer.modelPicker.limited
        : t.composer.modelPicker.notReady;
  const msg = entry.snapshot.message?.trim();
  return t.composer.modelPicker.statusHint(label, kind, msg);
}

const BADGE_BASE_CLASS =
  "pointer-events-none absolute -right-0.5 top-0.5 z-10 flex size-3.5 items-center justify-center rounded-full bg-transparent shadow-sm ";
const NEW_BADGE_CLASS = `${BADGE_BASE_CLASS} text-update-foreground `;

const PICKER_TOOLTIP_SIDE = "left" as const;
const PICKER_TOOLTIP_SIDE_OFFSET = 8;

/** Keeps provider navigation controlled; the decorative layer follows selection without taking focus. */
export const ModelPickerSidebar = memo(function ModelPickerSidebar(props: {
  selectedInstanceId: ProviderInstanceId | "favorites";
  onSelectInstance: (instanceId: ProviderInstanceId | "favorites") => void;
  onFocusSearch: () => void;
  instanceEntries: ReadonlyArray<ProviderInstanceEntry>;
  showFavorites?: boolean;
  disabledInstanceIds?: ReadonlySet<ProviderInstanceId>;
  selectableUnavailableInstanceIds?: ReadonlySet<ProviderInstanceId>;
  getDisabledInstanceTooltip?: (entry: ProviderInstanceEntry) => string;
  newBadgeInstanceIds?: ReadonlySet<ProviderInstanceId>;
}) {
  const handleSelect = (instanceId: ProviderInstanceId | "favorites") => {
    props.onSelectInstance(instanceId);
  };
  const showFavorites = props.showFavorites ?? true;
  const [hoveredInstanceId, setHoveredInstanceId] = useState<ProviderInstanceId | null>(null);
  const sidebarContentRef = useRef<HTMLDivElement>(null);
  const selectionRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const content = sidebarContentRef.current;
    const selection = selectionRef.current;
    if (!content || !selection) return;
    const motion = createSpringIndicator(selection, content, "y");
    let hasSelection = false;
    let previousButton: HTMLElement | null = null;
    let previousTargets: { button: HTMLElement; top: number; bottom: number; inset: number }[] = [];
    const align = (animate: boolean, onlyIfMoved = false) => {
      const button = content.querySelector<HTMLElement>('button[aria-pressed="true"]');
      selection.hidden = !button;
      if (!button) {
        hasSelection = false;
        previousButton = null;
        previousTargets = [];
        return;
      }
      // Rect differences retain fractional pixels and share the scrolling content's coordinate space.
      const bounds = content.getBoundingClientRect();
      const target = button.getBoundingClientRect();
      const targets = Array.from(
        content.querySelectorAll<HTMLElement>("[data-model-picker-provider] button"),
        (candidate) => {
          const rect = candidate.getBoundingClientRect();
          return {
            button: candidate,
            top: rect.top - bounds.top,
            bottom: rect.bottom - bounds.top,
            inset: content.clientHeight - (rect.bottom - bounds.top),
          };
        },
      );
      const sameStructure =
        targets.length === previousTargets.length &&
        targets.every((entry, index) => entry.button === previousTargets[index]?.button);
      // Remember every destination so an icon update batched with selection still permits motion.
      // Retain near-equal measurements rather than accumulating ignored subpixel drift.
      // Compare the edge as well as its inset: rounded content heights can mask a real edge move.
      const stableTargets = targets.map((entry, index) => {
        const previous = previousTargets[index];
        return sameStructure &&
          previous &&
          Math.abs(entry.top - previous.top) <= 0.5 &&
          Math.abs(entry.bottom - previous.bottom) <= 0.5 &&
          Math.abs(entry.inset - previous.inset) <= 0.5
          ? previous
          : entry;
      });
      const index = targets.findIndex((entry) => entry.button === button);
      const sameTarget = sameStructure && stableTargets[index] === previousTargets[index];
      previousTargets = stableTargets;
      selection.style.left = `${target.left - bounds.left}px`;
      selection.style.right = `${bounds.right - target.right}px`;
      selection.style.setProperty(
        "--provider-selection-rail-gap",
        `${bounds.right - target.right}px`,
      );
      // Only observer notifications may be ignored; scrolling always lands on the selected button.
      if (onlyIfMoved && sameTarget && previousButton === button) return;
      motion.move(
        [target.top - bounds.top, target.bottom - bounds.top],
        animate && hasSelection && sameTarget,
      );
      hasSelection = true;
      previousButton = button;
    };
    align(false);
    let stopResize: (() => void) | undefined;
    const observeSizes = () => {
      stopResize?.();
      stopResize = observeResize(
        [content, ...content.querySelectorAll("[data-model-picker-provider] button")],
        () => align(false, true),
      );
    };
    observeSizes();
    const changes = new MutationObserver((records) => {
      const layoutChanged = records.some((record) => record.type === "childList");
      if (layoutChanged) observeSizes();
      align(
        records.some((record) => record.type === "attributes"),
        true,
      );
    });
    changes.observe(content, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["aria-pressed"],
    });
    // Scrolling during a spring lands on the target instead of leaving a moving marker behind.
    const scroller = content.parentElement;
    const onScroll = () => align(false);
    scroller?.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      changes.disconnect();
      stopResize?.();
      scroller?.removeEventListener("scroll", onScroll);
      motion.dispose();
    };
  }, []);

  return (
    <Toolbar.Root
      className="w-11 shrink-0 overflow-hidden bg-muted/30"
      data-model-picker-sidebar="true"
      aria-label={t.composer.modelPicker.providersAriaLabel}
      orientation="vertical"
      onKeyDown={(event) => {
        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
        if (event.key === "ArrowRight") {
          event.preventDefault();
          props.onFocusSearch();
          return;
        }
      }}
    >
      <div className="h-full overflow-y-auto overscroll-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div ref={sidebarContentRef} className="relative flex min-h-full flex-col gap-1 p-1">
          <div
            ref={selectionRef}
            data-model-picker-selection="true"
            className="composer-model-picker-selection pointer-events-none absolute rounded-md"
            aria-hidden="true"
          >
            <div
              data-model-picker-selected-indicator="true"
              className="absolute right-[calc(-1*var(--provider-selection-rail-gap))] top-1/2 h-5 w-0.75 -translate-y-1/2 rounded-l-full bg-primary"
            />
          </div>
          {showFavorites ? (
            <>
              <div className="relative w-full" data-model-picker-provider="favorites">
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Toolbar.Button
                        className={cn(
                          "relative isolate flex w-full cursor-pointer aspect-square items-center justify-center rounded-md transition-colors hover:bg-foreground/10 focus-visible:bg-foreground/10 focus-visible:outline-none",
                        )}
                        onClick={() => handleSelect("favorites")}
                        type="button"
                        aria-label={t.composer.modelPicker.favorites}
                        aria-pressed={props.selectedInstanceId === "favorites"}
                      >
                        <StarIcon className="size-5 fill-current shrink-0" aria-hidden />
                      </Toolbar.Button>
                    }
                  />
                  <TooltipPopup
                    side={PICKER_TOOLTIP_SIDE}
                    sideOffset={PICKER_TOOLTIP_SIDE_OFFSET}
                    align="center"
                  >
                    {t.composer.modelPicker.favorites}
                  </TooltipPopup>
                </Tooltip>
              </div>
              <div className="border-b border-border/70" aria-hidden="true" />
            </>
          ) : null}

          {props.instanceEntries.map((entry) => {
            const isUnavailable = !isProviderInstancePickerReady(entry);
            const isContextDisabled = props.disabledInstanceIds?.has(entry.instanceId) ?? false;
            const unavailableSelectionIsReachable =
              props.selectableUnavailableInstanceIds?.has(entry.instanceId) ?? false;
            const isDisabled =
              (isUnavailable && !unavailableSelectionIsReachable) || isContextDisabled;
            const isSelected = props.selectedInstanceId === entry.instanceId;
            const isHovered = hoveredInstanceId === entry.instanceId;
            const showNewBadge = props.newBadgeInstanceIds?.has(entry.instanceId) ?? false;
            const showInstanceBadge = shouldShowInstanceBadge(entry, props.instanceEntries);

            const tooltip = isUnavailable
              ? describeUnavailableInstance(entry)
              : isContextDisabled
                ? (props.getDisabledInstanceTooltip?.(entry) ?? entry.displayName)
                : showNewBadge
                  ? t.composer.modelPicker.newProviderTooltip(entry.displayName)
                  : entry.displayName;

            const button = (
              <Toolbar.Button
                className={cn(
                  "relative isolate flex w-full cursor-pointer aspect-square items-center justify-center rounded-md transition-colors hover:bg-foreground/10 focus-visible:bg-foreground/10 focus-visible:outline-none",
                  isDisabled && "opacity-50 cursor-not-allowed hover:bg-transparent",
                )}
                data-provider-accent-color={entry.accentColor}
                onClick={() => !isDisabled && handleSelect(entry.instanceId)}
                onMouseEnter={() => setHoveredInstanceId(entry.instanceId)}
                onMouseLeave={() =>
                  setHoveredInstanceId((current) => (current === entry.instanceId ? null : current))
                }
                onFocus={() => setHoveredInstanceId(entry.instanceId)}
                onBlur={() =>
                  setHoveredInstanceId((current) => (current === entry.instanceId ? null : current))
                }
                disabled={isDisabled}
                focusableWhenDisabled={!isDisabled}
                aria-pressed={isSelected}
                type="button"
                aria-label={
                  isUnavailable || isContextDisabled
                    ? tooltip
                    : showNewBadge
                      ? t.composer.modelPicker.newProviderAriaLabel(entry.displayName)
                      : entry.displayName
                }
              >
                <ProviderInstanceIcon
                  driverKind={entry.driverKind}
                  displayName={entry.displayName}
                  accentColor={entry.accentColor}
                  acpRegistryAgentId={entry.acpRegistryAgentId}
                  acpRegistryIconUrl={entry.acpRegistryIconUrl}
                  showBadge={showInstanceBadge}
                  className="size-6 z-30"
                  iconClassName="size-5"
                  indicatorBackground={
                    isHovered && !isDisabled
                      ? "var(--muted)"
                      : isSelected
                        ? "var(--background)"
                        : "color-mix(in oklab, var(--muted) 30%, transparent)"
                  }
                  {...(entry.accentColor ? { badgeClassName: "h-3 min-w-3 px-0.5 text-5xs" } : {})}
                />
                {showNewBadge ? (
                  <span className={NEW_BADGE_CLASS} aria-hidden>
                    <PixelSparkIcon className="size-2" />
                  </span>
                ) : null}
              </Toolbar.Button>
            );

            const trigger = isDisabled ? (
              <span className="relative block w-full">{button}</span>
            ) : (
              button
            );

            return (
              <div
                key={entry.instanceId}
                className="relative w-full"
                data-model-picker-provider={entry.instanceId}
              >
                <Tooltip>
                  <TooltipTrigger render={trigger} />
                  <TooltipPopup
                    side={PICKER_TOOLTIP_SIDE}
                    sideOffset={PICKER_TOOLTIP_SIDE_OFFSET}
                    align="center"
                  >
                    {tooltip}
                  </TooltipPopup>
                </Tooltip>
              </div>
            );
          })}
        </div>
      </div>
    </Toolbar.Root>
  );
});
