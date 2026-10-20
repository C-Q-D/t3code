/** Renders managed and anchored notifications, their actions, and expandable details. */
"use client";

import { t } from "~/i18n";

import { Toast } from "@base-ui/react/toast";
import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ComponentPropsWithoutRef,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useParams } from "@tanstack/react-router";
import { type ScopedThreadRef, type ThreadId } from "@t3tools/contracts";
import {
  CircleAlertIcon,
  CircleXIcon,
  CircleCheckIcon,
  HourglassIcon,
  MessageCircleQuestionIcon,
  ShieldAlertIcon,
  XIcon,
} from "lucide-react";
import { Check, ChevronDown, ChevronUp, Copy } from "lucide";

import { cn } from "~/lib/utils";
import { Button, buttonVariants } from "~/components/ui/button";
import { MorphIcon } from "~/components/MorphIcon";
import { useComposerDraftStore } from "~/composerDraftStore";
import { useCopyToClipboard } from "~/hooks/useCopyToClipboard";
import { resolveThreadRouteTarget } from "~/threadRoutes";
import {
  buildVisibleToastLayout,
  countStoneToastRemaining,
  getStoneToastLayer,
  hasVisibleToastAction,
  resolveToastProgressPercent,
  shouldHideCollapsedToastContent,
  shouldRenderThreadScopedToast,
} from "./toast.logic";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./tooltip";

/** Optional notification context and presentation; omitted appearance retains the standard H3 card. */
export type ThreadToastData = {
  /** Opt-in compact error or keybindings warning card; omitted uses the default notification. */
  appearance?: "error-stripe" | "keybindings-warning";
  threadRef?: ScopedThreadRef | null;
  threadId?: ThreadId | null;
  leadingIcon?: ReactNode;
  /** S1/S2 icon tile treatment, independent of notification priority and lifecycle. */
  iconTone?: "neutral" | "update" | "attention" | "success" | undefined;
  /** Loading progress in percent; finite values are rounded and clamped to 0–100. Omit or use null when unknown. */
  progressPercent?: number | null;
  tooltipStyle?: boolean;
  onClose?: (() => void) | undefined;
  dismissAfterVisibleMs?: number;
  hideCopyButton?: boolean;
  additionalActions?: ReadonlyArray<{
    id: string;
    props: ComponentPropsWithoutRef<"button">;
  }>;
  secondaryActionProps?: ComponentPropsWithoutRef<"button">;
  secondaryActionVariant?:
    | "default"
    | "destructive"
    | "destructive-outline"
    | "ghost"
    | "link"
    | "outline"
    | "secondary";
  /** Optional extra body shown after toggling “Show details” (e.g. a list of pending RPCs). */
  expandableContent?: ReactNode;
  expandableLabels?: { expand?: string; collapse?: string };
  /** When set with `expandableContent`, the summary + label act as one text disclosure (no separate chevron row). */
  expandableDescriptionTrigger?: boolean;
  actionLayout?: "inline" | "stacked-end";
  actionVariant?:
    | "default"
    | "destructive"
    | "destructive-outline"
    | "ghost"
    | "link"
    | "outline"
    | "secondary";
};

const toastManager = Toast.createToastManager<ThreadToastData>();
const anchoredToastManager = Toast.createToastManager<ThreadToastData>();
type ToastId = ReturnType<typeof toastManager.add>;
const threadToastVisibleTimeoutRemainingMs = new Map<ToastId, number>();

const TOAST_ICONS = {
  error: CircleXIcon,
  info: MessageCircleQuestionIcon,
  loading: HourglassIcon,
  success: CircleCheckIcon,
  warning: ShieldAlertIcon,
} as const;

/** Keep dismissal inside the H3 card; body padding reserves its 28px target and 10px gap. */
const toastCornerDismissClass = "absolute z-20 top-3 right-2";
const toastCornerOrbClass = cn(
  "inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full text-icon-muted outline-none [--lucide-hue-override:currentColor]",
  "transition-colors hover:text-foreground focus-visible:inset-shadow-focus",
);

function handleToastDismissClick(
  manager: typeof toastManager | typeof anchoredToastManager,
  toastId: ToastId,
  onClose: (() => void) | undefined,
) {
  onClose?.();
  manager.close(toastId);
}

/** Copies the supplied error text and reports copied state through its accessible action label. */
function CopyErrorButton({ text }: { text: string }) {
  const { copyToClipboard, isCopied } = useCopyToClipboard({ target: "error-message" });
  const label = isCopied ? t.app.clipboard.copiedError : t.app.clipboard.copyError;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            size="icon-micro"
            variant="ghost-muted"
            aria-label={label}
            onClick={() => copyToClipboard(text)}
          />
        }
      >
        <MorphIcon className="size-3" icon={isCopied ? Check : Copy} />
      </TooltipTrigger>
      <TooltipPopup side="top">{label}</TooltipPopup>
    </Tooltip>
  );
}

/** Scrollable cap for long expandable lists (~10rem); keeps the toast from growing without bound. */
const toastExpandablePanelClassName =
  "mt-2 max-h-40 min-h-0 overflow-y-auto overscroll-contain pr-0.5 select-text";

/** Renders children behind a details toggle, using optional labels overrides for the collapsed and expanded actions. */
function ToastExpandableSection({
  children,
  labels,
}: {
  children: ReactNode;
  labels: { expand?: string; collapse?: string };
}) {
  const [open, setOpen] = useState(false);
  const expandLabel = labels.expand ?? t.app.details.show;
  const collapseLabel = labels.collapse ?? t.app.details.hide;

  return (
    <div className="min-w-0">
      <button
        aria-expanded={open}
        className="inline-flex cursor-pointer items-center gap-1 rounded-full py-0.5 text-left text-secondary-copy font-medium text-secondary-label transition-colors hover:text-foreground"
        onClick={() => setOpen((prev) => !prev)}
        type="button"
      >
        <MorphIcon
          className="size-3.5 shrink-0 opacity-80"
          icon={open ? ChevronUp : ChevronDown}
          strokeWidth={2.25}
        />
        {open ? collapseLabel : expandLabel}
      </button>
      {open ? <div className={toastExpandablePanelClassName}>{children}</div> : null}
    </div>
  );
}

/** Keeps the summary on one line while preserving optional details and localized disclosure labels. */
function ToastDescriptionAndExpandable({ toastData }: { toastData: ThreadToastData | undefined }) {
  const expandableContent = toastData?.expandableContent;
  const labels = toastData?.expandableLabels ?? {};
  const descriptionTrigger = toastData?.expandableDescriptionTrigger ?? false;
  // Truncate only the summary: full error text remains available to the copy action.
  const descriptionClassName = "min-w-0 truncate select-text text-secondary-label";
  const [open, setOpen] = useState(false);

  if (!expandableContent) {
    return <Toast.Description className={descriptionClassName} data-slot="toast-description" />;
  }

  if (!descriptionTrigger) {
    return (
      <>
        <Toast.Description className={descriptionClassName} data-slot="toast-description" />
        <ToastExpandableSection labels={labels}>{expandableContent}</ToastExpandableSection>
      </>
    );
  }

  const expandLabel = labels.expand ?? t.app.details.show;
  const collapseLabel = labels.collapse ?? t.app.details.hide;

  const toggle = () => setOpen((v) => !v);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggle();
    }
  };

  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <div
              aria-label={open ? collapseLabel : expandLabel}
              aria-expanded={open}
              className={cn(
                "group flex min-w-0 w-full cursor-pointer select-none items-start gap-1.5 rounded-keycap text-left outline-none ring-offset-background",
                "transition-colors hover:bg-muted/40",
                "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
              )}
              onClick={toggle}
              onKeyDown={onKeyDown}
              role="button"
              tabIndex={0}
            />
          }
        >
          <div className="min-w-0 flex-1">
            <Toast.Description
              className={cn(
                "min-w-0 truncate select-none text-secondary-label",
                "underline-offset-2 decoration-muted-foreground/60 group-hover:underline",
              )}
              data-slot="toast-description"
            />
          </div>
          <MorphIcon
            aria-hidden
            className="mt-0.5 size-3.5 shrink-0 text-muted-foreground opacity-80"
            icon={open ? ChevronUp : ChevronDown}
            strokeWidth={2.25}
          />
        </TooltipTrigger>
        <TooltipPopup side="top">{open ? collapseLabel : expandLabel}</TooltipPopup>
      </Tooltip>
      {open ? <div className={toastExpandablePanelClassName}>{expandableContent}</div> : null}
    </>
  );
}

type ToastIconComponent = (typeof TOAST_ICONS)[keyof typeof TOAST_ICONS];

/** Shared presentation and control availability for viewport and anchored notifications. */
interface ToastBodyDescriptor {
  readonly Icon: ToastIconComponent | null | undefined;
  readonly stackedActionLayout: boolean;
  readonly actionVariant: NonNullable<ThreadToastData["actionVariant"]>;
  readonly secondaryActionVariant: NonNullable<ThreadToastData["secondaryActionVariant"]>;
  readonly copyErrorText: string | null;
  readonly hasTrailingControls: boolean;
}

/** Derives H3 controls by default; L4 keeps raw description text without the extra copy action. */
function deriveToastBodyDescriptor(toast: {
  readonly type?: string | undefined;
  readonly description?: unknown;
  readonly actionProps?: unknown;
  readonly data?: ThreadToastData | undefined;
}): ToastBodyDescriptor {
  const Icon =
    toast.data?.appearance === "error-stripe"
      ? CircleAlertIcon
      : toast.type
        ? TOAST_ICONS[toast.type as keyof typeof TOAST_ICONS]
        : null;
  const stackedActionLayout =
    hasVisibleToastAction(toast.actionProps) && toast.data?.actionLayout === "stacked-end";
  const actionVariant: NonNullable<ThreadToastData["actionVariant"]> =
    toast.data?.actionVariant ?? (toast.type === "warning" ? "default" : "secondary");
  const secondaryActionVariant: NonNullable<ThreadToastData["secondaryActionVariant"]> =
    toast.data?.secondaryActionVariant ?? "outline";
  const copyErrorText =
    toast.type === "error" &&
    typeof toast.description === "string" &&
    !toast.data?.hideCopyButton &&
    toast.data?.appearance !== "error-stripe"
      ? toast.description
      : null;
  const hasAdditionalActions = (toast.data?.additionalActions?.length ?? 0) > 0;
  const hasSecondaryAction = toast.data?.secondaryActionProps !== undefined;
  const hasTrailingControls =
    copyErrorText !== null ||
    hasVisibleToastAction(toast.actionProps) ||
    hasAdditionalActions ||
    hasSecondaryAction;
  return {
    Icon,
    stackedActionLayout,
    actionVariant,
    secondaryActionVariant,
    copyErrorText,
    hasTrailingControls,
  };
}

/** Combines derived presentation with caller content; leadingIcon keeps precedence over the default. */
interface ToastBodyContentProps extends ToastBodyDescriptor {
  readonly actionProps: { readonly children?: ReactNode } | undefined;
  readonly toastData: ThreadToastData | undefined;
  readonly toastType: unknown;
}

/** Uses H3 key geometry and elevation for standard actions; explicit semantic variants stay available. */
function toastActionClassName(variant: NonNullable<ThreadToastData["actionVariant"]>) {
  return cn(
    buttonVariants({ size: "xs", variant }),
    "h-7 rounded-full px-2.5 text-secondary-copy-medium sm:h-7 sm:text-secondary-copy-medium",
    variant === "default" &&
      "border-0 font-bold text-shadow-none shadow-primary-edge not-disabled:inset-shadow-none",
    variant === "secondary" &&
      "border-0 bg-accent font-semibold text-foreground shadow-(--shadow-toast-action)",
  );
}

/** Renders the H3 icon, summary and actions while retaining caller icons and stacked action layouts. */
function ToastBodyContent({
  stackedActionLayout,
  Icon,
  copyErrorText,
  actionProps,
  actionVariant,
  secondaryActionVariant,
  hasTrailingControls,
  toastData,
  toastType,
}: ToastBodyContentProps) {
  const additionalActions = toastData?.additionalActions ?? [];
  const secondaryActionProps = toastData?.secondaryActionProps;
  const leadingIcon = toastData?.leadingIcon;
  const progressPercent = resolveToastProgressPercent(toastType, toastData?.progressPercent);
  const { className: secondaryActionClassName, ...secondaryActionRest } =
    secondaryActionProps ?? {};

  return (
    <>
      <div
        className={cn("flex min-h-0 min-w-0 gap-2.5", stackedActionLayout ? "w-full" : "flex-1")}
      >
        {leadingIcon || Icon ? (
          <div
            className={cn(
              "flex size-7 shrink-0 items-center justify-center rounded-(--radius-toast-icon) [&_svg]:pointer-events-none [&_svg]:size-3.75 [&_svg]:shrink-0",
              toastType === "success" && "bg-status-success",
              toastType === "warning" && "bg-warning-surface text-shadow-none",
              toastType === "error" && "bg-error-surface",
              toastType === "info" && "bg-update-surface",
              toastType === "loading" &&
                "bg-(--color-toast-loading-tile) shadow-(--shadow-toast-loading-tile)",
            )}
            data-slot="toast-icon"
            data-tone={toastData?.iconTone}
          >
            {leadingIcon || (Icon ? <Icon className="size-3.75" /> : null)}
          </div>
        ) : null}
        <div
          className={cn(
            "flex min-w-0 flex-1 flex-col",
            progressPercent !== null ? "gap-2" : "gap-0.5",
          )}
        >
          <div
            data-slot="toast-title-row"
            className={cn(
              "flex min-w-0 items-center gap-2.5",
              toastType === "loading" && "min-h-7",
            )}
          >
            <Toast.Title
              className="min-w-0 flex-1 wrap-break-word font-bold"
              data-slot="toast-title"
            />
            {progressPercent !== null ? (
              <span
                aria-hidden
                className="shrink-0 font-mono text-secondary-copy text-secondary-label"
                data-slot="toast-progress-label"
              >
                {progressPercent}%
              </span>
            ) : null}
          </div>
          <ToastDescriptionAndExpandable toastData={toastData} />
          {progressPercent !== null ? (
            <div
              aria-label={t.app.actions.loading}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progressPercent}
              className="-mr-0.5 h-1.5 overflow-hidden rounded-full bg-input shadow-well-progress"
              data-slot="toast-progress"
              role="progressbar"
            >
              <div
                className="h-full w-full origin-left rounded-full bg-code-foreground transition-transform duration-200 motion-reduce:transition-none"
                style={{ transform: `scaleX(${progressPercent / 100})` }}
              />
            </div>
          ) : null}
        </div>
      </div>
      {hasTrailingControls ? (
        <div
          className={cn(
            "flex items-center gap-1.5",
            stackedActionLayout ? "w-full justify-end" : "shrink-0",
          )}
        >
          {copyErrorText !== null ? <CopyErrorButton text={copyErrorText} /> : null}
          {additionalActions.map(({ id, props: { className, ...props } }) => (
            <Button
              {...props}
              className={cn(toastActionClassName(secondaryActionVariant), className)}
              key={id}
              size="xs"
              type="button"
              variant={secondaryActionVariant}
            />
          ))}
          {secondaryActionProps ? (
            <Button
              {...secondaryActionRest}
              className={cn(toastActionClassName(secondaryActionVariant), secondaryActionClassName)}
              size="xs"
              type="button"
              variant={secondaryActionVariant}
            />
          ) : null}
          {hasVisibleToastAction(actionProps) ? (
            <Toast.Action className={toastActionClassName(actionVariant)} data-slot="toast-action">
              {actionProps?.children}
            </Toast.Action>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

type ToastPosition =
  | "top-left"
  | "top-center"
  | "top-right"
  | "bottom-left"
  | "bottom-center"
  | "bottom-right";

interface ToastProviderProps extends Toast.Provider.Props {
  position?: ToastPosition;
  /** Opt-in S1 geometry; omitted retains the existing stack and viewport defaults. */
  stack?: "stone" | undefined;
}

function useActiveThreadRefFromRoute(): ScopedThreadRef | null {
  const routeTarget = useParams({
    strict: false,
    select: (params) => resolveThreadRouteTarget(params),
  });
  const activeDraftSession = useComposerDraftStore((store) =>
    routeTarget?.kind === "draft" ? store.getDraftSession(routeTarget.draftId) : null,
  );

  return useMemo(() => {
    if (routeTarget?.kind === "server") {
      return routeTarget.threadRef;
    }
    if (routeTarget?.kind === "draft" && activeDraftSession) {
      return {
        environmentId: activeDraftSession.environmentId,
        threadId: activeDraftSession.threadId,
      };
    }
    return null;
  }, [activeDraftSession, routeTarget]);
}

function ThreadToastVisibleAutoDismiss({
  toastId,
  dismissAfterVisibleMs,
}: {
  toastId: ToastId;
  dismissAfterVisibleMs: number | undefined;
}) {
  useEffect(() => {
    if (!dismissAfterVisibleMs || dismissAfterVisibleMs <= 0) return;
    if (typeof window === "undefined" || typeof document === "undefined") return;

    let remainingMs = threadToastVisibleTimeoutRemainingMs.get(toastId) ?? dismissAfterVisibleMs;
    let startedAtMs: number | null = null;
    let timeoutId: number | null = null;
    let closed = false;

    const clearTimer = () => {
      if (timeoutId === null) return;
      window.clearTimeout(timeoutId);
      timeoutId = null;
    };

    const closeToast = () => {
      if (closed) return;
      closed = true;
      threadToastVisibleTimeoutRemainingMs.delete(toastId);
      toastManager.close(toastId);
    };

    const pause = () => {
      if (startedAtMs === null) return;
      remainingMs = Math.max(0, remainingMs - (Date.now() - startedAtMs));
      startedAtMs = null;
      clearTimer();
      threadToastVisibleTimeoutRemainingMs.set(toastId, remainingMs);
    };

    const start = () => {
      if (closed || startedAtMs !== null) return;
      if (remainingMs <= 0) {
        closeToast();
        return;
      }
      startedAtMs = Date.now();
      clearTimer();
      timeoutId = window.setTimeout(() => {
        remainingMs = 0;
        startedAtMs = null;
        closeToast();
      }, remainingMs);
    };

    const syncTimer = () => {
      const shouldRun = document.visibilityState === "visible" && document.hasFocus();
      if (shouldRun) {
        start();
        return;
      }
      pause();
    };

    syncTimer();
    document.addEventListener("visibilitychange", syncTimer);
    window.addEventListener("focus", syncTimer);
    window.addEventListener("blur", syncTimer);

    return () => {
      document.removeEventListener("visibilitychange", syncTimer);
      window.removeEventListener("focus", syncTimer);
      window.removeEventListener("blur", syncTimer);
      pause();
      clearTimer();
    };
  }, [dismissAfterVisibleMs, toastId]);

  return null;
}

/** Keeps all appearances in one viewport so interaction and announcement state have one owner. */
function ToastProvider({ children, position = "top-right", stack, ...props }: ToastProviderProps) {
  return (
    <Toast.Provider toastManager={toastManager} {...props}>
      {children}
      <Toasts position={position} stack={stack} />
    </Toast.Provider>
  );
}

/** Renders managed toasts at position; appearance is opt-in and dismissal remains keyboard accessible. */
function Toasts({ position, stack }: { position: ToastPosition; stack?: "stone" | undefined }) {
  const { toasts } = Toast.useToastManager<ThreadToastData>();
  const activeThreadRef = useActiveThreadRefFromRoute();
  const isTop = position.startsWith("top");
  const visibleToasts = toasts.filter((toast) =>
    shouldRenderThreadScopedToast(toast.data, activeThreadRef),
  );
  const visibleToastLayout = buildVisibleToastLayout(visibleToasts);

  useEffect(() => {
    const activeToastIds = new Set(toasts.map((toast) => toast.id));
    for (const toastId of threadToastVisibleTimeoutRemainingMs.keys()) {
      if (!activeToastIds.has(toastId)) {
        threadToastVisibleTimeoutRemainingMs.delete(toastId);
      }
    }
  }, [toasts]);

  return (
    <Toast.Portal data-slot="toast-portal">
      <Toast.Viewport
        className={cn(
          "fixed z-100 mx-auto flex w-[calc(100%-var(--toast-inset)*2)] max-w-90 [--toast-header-offset:var(--workspace-topbar-height)] [--toast-inset:--spacing(4)] sm:[--toast-inset:--spacing(8)]",
          // Vertical positioning
          "data-[position*=top]:top-[calc(var(--toast-inset)+var(--toast-header-offset))]",
          "data-[position*=bottom]:bottom-(--toast-inset)",
          // Horizontal positioning
          "data-[position*=left]:left-(--toast-inset)",
          "data-[position*=right]:right-(--toast-inset)",
          "data-[position*=center]:-translate-x-1/2 data-[position*=center]:left-1/2",
        )}
        data-position={position}
        data-stack={stack}
        data-slot="toast-viewport"
        render={
          stack === "stone"
            ? (viewportProps, { expanded }) => {
                const remainingCount = countStoneToastRemaining(visibleToastLayout.items, expanded);
                return (
                  <div {...viewportProps}>
                    {remainingCount > 0 ? (
                      <span
                        aria-hidden
                        className="ov2-toast-count pointer-events-none absolute right-2.5 z-10000 flex h-5.5 items-center rounded-full bg-accent px-2.25 font-mono text-meta text-code-foreground shadow-ov2-count"
                      >
                        +{remainingCount}
                      </span>
                    ) : null}
                    {viewportProps.children}
                  </div>
                );
              }
            : undefined
        }
        style={
          {
            "--toast-frontmost-height": `${visibleToastLayout.frontmostHeight}px`,
          } as CSSProperties
        }
      >
        {visibleToastLayout.items.map(({ toast, visibleIndex, offsetY }) => {
          const stoneLayer = stack === "stone" ? getStoneToastLayer(visibleIndex) : undefined;
          const hideCollapsedContent = shouldHideCollapsedToastContent(
            visibleIndex,
            visibleToastLayout.items.length,
          );
          const bodyDescriptor = deriveToastBodyDescriptor(toast);
          const { stackedActionLayout } = bodyDescriptor;

          return (
            <Toast.Root
              data-appearance={toast.data?.appearance}
              data-stack={stack}
              data-stack-layer={stoneLayer ? visibleIndex : undefined}
              data-stack-behind={stack === "stone" && visibleIndex > 0 ? "" : undefined}
              render={
                stack === "stone"
                  ? (rootProps, state) => {
                      const { hidden } = getStoneToastLayer(visibleIndex, state);
                      // Base UI hides unfocused high-priority roots while its separate alert announces them.
                      // Stone may add access restrictions, but must not remove the provider's restrictions.
                      return (
                        <div
                          {...rootProps}
                          data-stack-hidden={hidden ? "" : undefined}
                          inert={hidden ? true : rootProps.inert}
                          aria-hidden={hidden ? true : rootProps["aria-hidden"]}
                        />
                      );
                    }
                  : undefined
              }
              className={cn(
                "dropdown-glass absolute z-[calc(9999-var(--toast-index))] w-full overflow-visible select-none rounded-overlay text-foreground text-shadow-stone legacy:[transition:transform_.5s_cubic-bezier(.22,1,.36,1),opacity_.5s,height_.15s] physics:transition-[transform,opacity,height] physics:duration-(--toast-motion-duration) physics:ease-(--toast-motion-ease) physics:data-ending-style:data-swipe-direction:duration-(--toast-exit-motion-duration) physics:data-ending-style:data-swipe-direction:ease-(--toast-exit-motion-ease)",
                // Base positioning using data-position
                "data-[position*=right]:right-0 data-[position*=right]:left-auto",
                "data-[position*=left]:right-auto data-[position*=left]:left-0",
                "data-[position*=center]:right-0 data-[position*=center]:left-0",
                "data-[position*=top]:top-0 data-[position*=top]:bottom-auto data-[position*=top]:origin-top",
                "data-[position*=bottom]:top-auto data-[position*=bottom]:bottom-0 data-[position*=bottom]:origin-bottom",
                // Gap fill for hover
                "after:absolute after:left-0 after:h-[calc(var(--toast-gap)+1px)] after:w-full",
                "data-[position*=top]:after:top-full",
                "data-[position*=bottom]:after:bottom-full",
                // `--toast-calc-height`: behind + collapsed = peek height only (content `opacity-0`);
                // max(front, own) there produced a tall empty shell for long bodies.
                visibleIndex > 0
                  ? "not-data-expanded:[--toast-calc-height:var(--toast-frontmost-height)] data-expanded:[--toast-calc-height:max(var(--toast-frontmost-height,var(--toast-height)),var(--toast-height))]"
                  : "[--toast-calc-height:max(var(--toast-frontmost-height,var(--toast-height)),var(--toast-height))]",
                "[--toast-gap:--spacing(3)] [--toast-peek:--spacing(3)] [--toast-scale:calc(max(0,1-(var(--toast-index)*.1)))] [--toast-shrink:calc(1-var(--toast-scale))]",
                // Root height: never `min-h-(--toast-height)` — Base UI measures height by briefly forcing
                // `height: auto` on this node; an old `min-height` from `--toast-height` blocks shrinking,
                // so `recalculateHeight` keeps the inflated value after an expandable closes.
                // Behind + collapsed: fixed peek. Otherwise natural height (expand/collapse, hover stack).
                visibleIndex > 0
                  ? "not-data-expanded:h-(--toast-calc-height) data-expanded:h-auto"
                  : "h-auto",
                // Define offset-y variable
                "data-[position*=top]:[--toast-calc-offset-y:calc(var(--toast-offset-y)+var(--toast-index)*var(--toast-gap)+var(--toast-swipe-movement-y))]",
                "data-[position*=bottom]:[--toast-calc-offset-y:calc(var(--toast-offset-y)*-1+var(--toast-index)*var(--toast-gap)*-1+var(--toast-swipe-movement-y))]",
                // Default state transform
                "data-[position*=top]:transform-[translateX(var(--toast-swipe-movement-x))_translateY(calc(var(--toast-swipe-movement-y)+(var(--toast-index)*var(--toast-peek))+(var(--toast-shrink)*var(--toast-calc-height))))_scale(var(--toast-scale))]",
                "data-[position*=bottom]:transform-[translateX(var(--toast-swipe-movement-x))_translateY(calc(var(--toast-swipe-movement-y)-(var(--toast-index)*var(--toast-peek))-(var(--toast-shrink)*var(--toast-calc-height))))_scale(var(--toast-scale))]",
                // Limited state
                "data-limited:opacity-0",
                // Expanded stack
                "data-position:data-expanded:transform-[translateX(var(--toast-swipe-movement-x))_translateY(var(--toast-calc-offset-y))]",
                // Starting and ending animations
                "data-[position*=top]:data-starting-style:transform-[translateY(calc(-100%-var(--toast-inset)))]",
                "data-[position*=bottom]:data-starting-style:transform-[translateY(calc(100%+var(--toast-inset)))]",
                "data-[position*=top]:data-[position*=right]:data-starting-style:transform-[translateX(calc(100%+var(--toast-inset)))_translateY(var(--toast-calc-offset-y))]",
                "data-ending-style:opacity-0",
                // Ending animations (direction-aware)
                "data-ending-style:not-data-limited:not-data-swipe-direction:transform-[translateY(calc(100%+var(--toast-inset)))]",
                "data-[position*=top]:data-[position*=right]:data-ending-style:not-data-limited:not-data-swipe-direction:transform-[translateX(calc(100%+var(--toast-inset)))_translateY(var(--toast-calc-offset-y))]",
                "data-ending-style:data-[swipe-direction=left]:transform-[translateX(calc(var(--toast-swipe-movement-x)-100%-var(--toast-inset)))_translateY(var(--toast-calc-offset-y))]",
                "data-ending-style:data-[swipe-direction=right]:transform-[translateX(calc(var(--toast-swipe-movement-x)+100%+var(--toast-inset)))_translateY(var(--toast-calc-offset-y))]",
                "data-ending-style:data-[swipe-direction=up]:transform-[translateY(calc(var(--toast-swipe-movement-y)-100%-var(--toast-inset)))]",
                "data-ending-style:data-[swipe-direction=down]:transform-[translateY(calc(var(--toast-swipe-movement-y)+100%+var(--toast-inset)))]",
                // Ending animations (expanded)
                "data-expanded:data-ending-style:data-[swipe-direction=left]:transform-[translateX(calc(var(--toast-swipe-movement-x)-100%-var(--toast-inset)))_translateY(var(--toast-calc-offset-y))]",
                "data-expanded:data-ending-style:data-[swipe-direction=right]:transform-[translateX(calc(var(--toast-swipe-movement-x)+100%+var(--toast-inset)))_translateY(var(--toast-calc-offset-y))]",
                "data-expanded:data-ending-style:data-[swipe-direction=up]:transform-[translateY(calc(var(--toast-swipe-movement-y)-100%-var(--toast-inset)))]",
                "data-expanded:data-ending-style:data-[swipe-direction=down]:transform-[translateY(calc(var(--toast-swipe-movement-y)+100%+var(--toast-inset)))]",
              )}
              data-position={position}
              key={toast.id}
              style={
                {
                  "--toast-index": visibleIndex,
                  "--toast-offset-y": `${offsetY}px`,
                  ...(stoneLayer
                    ? {
                        "--ov2-inset-x": `${stoneLayer.inset}px`,
                        "--ov2-offset-y": `${stoneLayer.offset}px`,
                      }
                    : {}),
                } as CSSProperties
              }
              swipeDirection={
                position.includes("center")
                  ? [isTop ? "up" : "down"]
                  : position.includes("left")
                    ? ["left", isTop ? "up" : "down"]
                    : ["right", isTop ? "up" : "down"]
              }
              toast={toast}
            >
              <ThreadToastVisibleAutoDismiss
                dismissAfterVisibleMs={toast.data?.dismissAfterVisibleMs}
                toastId={toast.id}
              />
              <div className={toastCornerDismissClass} data-slot="toast-close-corner">
                <button
                  aria-label={t.app.notifications.dismiss}
                  className={toastCornerOrbClass}
                  data-slot="toast-close"
                  onClick={() =>
                    handleToastDismissClick(toastManager, toast.id, toast.data?.onClose)
                  }
                  type="button"
                >
                  <XIcon className="size-3.5" strokeWidth={2} />
                </button>
              </div>
              <Toast.Content
                data-slot="toast-content"
                className={cn(
                  // `overflow-x: clip` avoids the CSS quirk where pairing `hidden` + `y: visible`
                  // forces `y` to `auto`. Expandable detail panels can extend below without being cut off.
                  "pointer-events-auto min-h-0 overflow-y-visible py-3 pr-11.5 pl-3 text-secondary-copy-large transition-opacity duration-250 [overflow-x:clip] data-expanded:opacity-100",
                  stackedActionLayout
                    ? "flex flex-col gap-2"
                    : "flex items-start justify-between gap-2.5",
                  hideCollapsedContent &&
                    "not-data-expanded:pointer-events-none not-data-expanded:opacity-0",
                )}
              >
                <ToastBodyContent
                  {...bodyDescriptor}
                  actionProps={toast.actionProps}
                  toastData={toast.data}
                  toastType={toast.type}
                />
              </Toast.Content>
            </Toast.Root>
          );
        })}
      </Toast.Viewport>
    </Toast.Portal>
  );
}

function AnchoredToastProvider({ children, ...props }: Toast.Provider.Props) {
  return (
    <Toast.Provider toastManager={anchoredToastManager} {...props}>
      {children}
      <AnchoredToasts />
    </Toast.Provider>
  );
}

/** Renders managed anchored toasts with their reference positions, content, and accessible dismiss actions. */
function AnchoredToasts() {
  const { toasts } = Toast.useToastManager<ThreadToastData>();
  const activeThreadRef = useActiveThreadRefFromRoute();

  return (
    <Toast.Portal data-slot="toast-portal-anchored">
      <Toast.Viewport className="outline-none" data-slot="toast-viewport-anchored">
        {toasts
          .filter((toast) => shouldRenderThreadScopedToast(toast.data, activeThreadRef))
          .map((toast) => {
            const tooltipStyle = toast.data?.tooltipStyle ?? false;
            const positionerProps = toast.positionerProps;
            const bodyDescriptor = deriveToastBodyDescriptor(toast);
            const { stackedActionLayout } = bodyDescriptor;

            if (!positionerProps?.anchor) {
              return null;
            }

            return (
              <Toast.Positioner
                className="z-100 max-w-[min(--spacing(64),var(--available-width))]"
                data-slot="toast-positioner"
                key={toast.id}
                sideOffset={positionerProps.sideOffset ?? 4}
                toast={toast}
              >
                <Toast.Root
                  data-appearance={toast.data?.appearance}
                  className={cn(
                    "dropdown-glass relative overflow-visible rounded-overlay text-foreground text-shadow-stone transition-[scale,opacity] physics:transition-[width,height,scale,opacity] physics:duration-(--popup-motion-duration) physics:ease-(--popup-motion-ease) data-ending-style:scale-98 data-starting-style:scale-98 data-ending-style:opacity-0 data-starting-style:opacity-0",
                  )}
                  data-slot="toast-popup"
                  toast={toast}
                >
                  {tooltipStyle ? (
                    <Toast.Content className="pointer-events-auto px-2 py-1 text-secondary-copy">
                      <Toast.Title data-slot="toast-title" />
                    </Toast.Content>
                  ) : (
                    <>
                      <div className={toastCornerDismissClass}>
                        <button
                          aria-label={t.app.notifications.dismiss}
                          className={toastCornerOrbClass}
                          data-slot="toast-close"
                          onClick={() =>
                            handleToastDismissClick(
                              anchoredToastManager,
                              toast.id,
                              toast.data?.onClose,
                            )
                          }
                          type="button"
                        >
                          <XIcon className="size-3.5" strokeWidth={2} />
                        </button>
                      </div>
                      <Toast.Content
                        data-slot="toast-content"
                        className={cn(
                          "pointer-events-auto min-h-0 overflow-y-visible py-3 pr-11.5 pl-3 text-secondary-copy-large [overflow-x:clip]",
                          stackedActionLayout
                            ? "flex flex-col gap-2"
                            : "flex items-start justify-between gap-2.5",
                        )}
                      >
                        <ToastBodyContent
                          {...bodyDescriptor}
                          actionProps={toast.actionProps}
                          toastData={toast.data}
                          toastType={toast.type}
                        />
                      </Toast.Content>
                    </>
                  )}
                </Toast.Root>
              </Toast.Positioner>
            );
          })}
      </Toast.Viewport>
    </Toast.Portal>
  );
}

export { hiddenToastActionProps, stackedThreadToast } from "./toastHelpers";
export type { StackedThreadToastOptions } from "./toastHelpers";

export {
  ToastProvider,
  type ToastPosition,
  toastManager,
  AnchoredToastProvider,
  anchoredToastManager,
};
