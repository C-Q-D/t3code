/** Shared settings sections, rows, inheritance affordances and search destinations; routes own page scrolling. */
import { SettingsGroup } from "./SettingsGroup";
import { t } from "~/i18n";
import { AuthSettingsWriteScope } from "@t3tools/contracts";
import { usePrimaryEnvironmentId, usePrimaryEnvironment } from "../../state/environments";
import { useEnvironmentScope, useEnvironmentsWithScope } from "../../state/session";
import { InfoIcon, Undo2Icon } from "lucide-react";
import { DEFAULT_SERVER_SETTINGS, type ServerSettings } from "@t3tools/contracts";
import * as Equal from "effect/Equal";
import { useLocation, useNavigate } from "@tanstack/react-router";
import {
  createContext,
  type ComponentPropsWithoutRef,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";

import { usePrimarySettingsAvailable } from "../../hooks/useSettings";
import { cn } from "../../lib/utils";
import type { WorkspacePageWidth } from "../WorkspacePageContainer";
import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { useOptionalSettingsScope } from "./SettingsScopeContext";
import {
  isProjectScopedSettingKey,
  listProjectOverrides,
  type ProjectOverrideEntry,
  scopedSettingsAreMixed,
  scopedSettingsSource,
} from "./scopedSettings";
import { useClearProjectOverrides, useClearScopedSettings } from "./useScopedSettings";
import {
  SettingInheritance,
  type SettingInheritanceState,
  type SettingOverridingProject,
} from "./SettingInheritance";

const EMPTY_SETTING_KEYS: readonly (keyof ServerSettings)[] = [];

declare module "@tanstack/react-router" {
  interface HistoryState {
    settingsTargetHighlight?: boolean;
  }
}

interface SettingsSearchTargetContextValue {
  readonly targetId: string | null;
  readonly highlightTarget: boolean;
  readonly onTargetHandled: () => void;
}

const noop = () => undefined;
const SettingsSearchTargetContext = createContext<SettingsSearchTargetContextValue>({
  targetId: null,
  highlightTarget: true,
  onTargetHandled: noop,
});

function SettingsSearchTargetProvider({
  targetId,
  highlightTarget = true,
  onTargetHandled = noop,
  children,
}: {
  targetId: string | null;
  highlightTarget?: boolean;
  onTargetHandled?: () => void;
  children: ReactNode;
}) {
  const value = { targetId, highlightTarget, onTargetHandled };
  return <SettingsSearchTargetContext value={value}>{children}</SettingsSearchTargetContext>;
}

let pendingTargetScroll: AbortController | undefined;

function scrollAndFocusSettingsTarget(target: HTMLElement, highlight = true): void {
  pendingTargetScroll?.abort();
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const markedScrollTarget =
    typeof target.querySelector === "function"
      ? target.querySelector<HTMLElement>(":scope > [data-settings-scroll-target]")
      : null;
  const scrollTarget =
    markedScrollTarget ??
    (target.tagName === "SECTION" && target.firstElementChild
      ? (target.firstElementChild as HTMLElement)
      : target);

  const scroll = () =>
    scrollTarget.scrollIntoView({
      behavior: prefersReducedMotion ? "auto" : "smooth",
      block: "center",
    });
  scroll();
  const panel = target.parentElement?.closest<HTMLElement>(
    '[data-slot="collapsible-panel"][data-open]',
  );
  const heightTransition = () =>
    panel
      ?.getAnimations()
      .find(
        (animation) =>
          animation instanceof CSSTransition && animation.transitionProperty === "height",
      );
  if (panel && (panel.hasAttribute("data-starting-style") || heightTransition())) {
    const controller = new AbortController();
    pendingTargetScroll = controller;
    const { signal } = controller;
    const finishScroll = () => {
      if (signal.aborted) return;
      controller.abort();
      if (
        panel.hasAttribute("data-open") &&
        target.isConnected &&
        document.activeElement === target
      ) {
        scroll();
      }
    };
    const waitForHeight = () => {
      const transition = heightTransition();
      if (transition) {
        void transition.finished.then(finishScroll, () => controller.abort());
      } else {
        finishScroll();
      }
    };
    // Base UI clears the starting style before the height transition finishes.
    if (panel.hasAttribute("data-starting-style")) {
      const observer = new MutationObserver(() => {
        if (!panel.hasAttribute("data-starting-style")) {
          observer.disconnect();
          waitForHeight();
        }
      });
      observer.observe(panel, { attributes: true, attributeFilter: ["data-starting-style"] });
      signal.addEventListener("abort", () => observer.disconnect(), { once: true });
    } else {
      waitForHeight();
    }
    target.addEventListener("blur", () => controller.abort(), { once: true, signal });
  }
  target.focus({ preventScroll: true });
  target.classList.remove("settings-search-target-pulse");
  if (!highlight || prefersReducedMotion) return;
  void target.offsetWidth;
  target.classList.add("settings-search-target-pulse");
  target.addEventListener("blur", () => target.classList.remove("settings-search-target-pulse"), {
    once: true,
  });
}

export function useSettingsSearchTargetId(): string | null {
  return useContext(SettingsSearchTargetContext).targetId;
}

export function useSettingsSearchTarget<T extends HTMLElement>(id: string | undefined) {
  const { targetId, highlightTarget, onTargetHandled } = useContext(SettingsSearchTargetContext);
  const isSearchTarget = id !== undefined && id === targetId;
  const targetRef = (target: T | null) => {
    if (target && isSearchTarget) {
      scrollAndFocusSettingsTarget(target, highlightTarget);
      onTargetHandled();
    }
  };

  return targetRef;
}

export function SettingsSearchTarget({
  children,
  ...targetProps
}: ComponentPropsWithoutRef<"div">) {
  const targetRef = useSettingsSearchTarget<HTMLDivElement>(targetProps.id);
  return (
    <div {...targetProps} ref={targetRef} tabIndex={targetProps.id ? -1 : targetProps.tabIndex}>
      {children}
    </div>
  );
}

export const SETTINGS_PICKER_TRIGGER_CLASSNAME = "min-w-0 max-w-none shrink-0";

export function PolicyTooltip({ children }: { readonly children: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        delay={200}
        render={
          <Button
            size="icon-micro"
            variant="ghost-muted"
            aria-label={t.settings.layout.backgroundPolicyAriaLabel}
          >
            <InfoIcon className="size-3.5" />
          </Button>
        }
      />
      <TooltipPopup side="top">{children}</TooltipPopup>
    </Tooltip>
  );
}

export function useRelativeTimeTick(intervalMs = 1_000) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return nowMs;
}

/** Serif section headings name each group; explanatory copy belongs to individual settings. */
export function SettingsSection({
  title,
  hideTitle = false,
  icon,
  titleAction,
  headerAction,
  variant = "grouped",
  children,
  className,
  ...sectionProps
}: ComponentPropsWithoutRef<"section"> & {
  title: string;
  hideTitle?: boolean;
  icon?: ReactNode;
  titleAction?: ReactNode;
  headerAction?: ReactNode;
  variant?: "grouped" | "plain";
  children: ReactNode;
}) {
  const targetRef = useSettingsSearchTarget<HTMLElement>(sectionProps.id);

  return (
    <section
      {...sectionProps}
      ref={targetRef}
      tabIndex={sectionProps.id ? -1 : sectionProps.tabIndex}
      className={cn(!hideTitle && "space-y-2", className)}
    >
      {hideTitle ? (
        <h2 className="sr-only">{title}</h2>
      ) : (
        <div
          data-settings-scroll-target
          className="flex min-h-7 items-start justify-between gap-4 px-1"
        >
          <div className="flex min-w-0 items-center gap-1">
            <h2 className="flex min-h-7 items-center gap-2 font-serif text-plan-title leading-normal font-bold text-foreground">
              {icon}
              {title}
            </h2>
            {titleAction}
          </div>
          <div className="flex min-h-7 min-w-7 items-center justify-end">{headerAction}</div>
        </div>
      )}
      <SettingsGroup data-settings-scroll-target={hideTitle ? "" : undefined} variant={variant}>
        {children}
      </SettingsGroup>
    </section>
  );
}

export function SettingsUnavailableGroup({
  children,
  message,
}: {
  children: ReactNode;
  message?: ReactNode;
}) {
  if (message === undefined) return children;

  return (
    <div className="border-border/60 bg-muted/20 py-1.5">
      <div className="flex items-start gap-2 px-3 py-2 text-xs leading-relaxed text-muted-foreground sm:px-4">
        <InfoIcon className="mt-0.5 size-3.5 shrink-0 text-warning" />
        <p>{message}</p>
      </div>
      <div className="[&_h3]:opacity-64 [&_p]:opacity-64">{children}</div>
    </div>
  );
}

/**
 * Lists only overrides whose projects can be resolved in the current scope, avoiding dead navigation targets.
 * @param context Optional scope context; null produces no overrides.
 * @param scopedKeys Settings to inspect; an empty list produces no overrides.
 * @returns Labeled overrides with actions that select their owning project checkout.
 */
function projectOverrides(
  context: ReturnType<typeof useOptionalSettingsScope>,
  scopedKeys: ReadonlyArray<keyof ServerSettings>,
): SettingOverridingProject[] {
  if (context === null || scopedKeys.length === 0) return [];
  return listProjectOverrides(context.connectedEnvironments, scopedKeys).flatMap((entry) => {
    const group = context.groups.find((candidate) =>
      candidate.memberProjects.some(
        (member) => member.environmentId === entry.environmentId && member.id === entry.projectId,
      ),
    );
    if (!group) return [];
    return [
      {
        ...entry,
        label: group.displayName,
        open: () =>
          context.selectScope({
            project: group.projectKey,
            ...(context.search.machine ? { machine: context.search.machine } : {}),
          }),
      },
    ];
  });
}

/**
 * One setting. `serverScoped` marks rows whose value lives in the primary
 * environment's settings.json; where there is no primary (the hosted app)
 * the control goes inert with a tooltip instead of showing an editable
 * default that would never save.
 *
 * Keep descriptions short enough for one line where possible. Allow wrapping
 * for clarity or narrow screens instead of truncating or forcing no-wrap.
 *
 * Control sizing across settings follows three tiers so rows share a baseline:
 * - `control` slot: `size="sm"` (Button, Select, Input, NumberField) or `icon-sm`.
 * - Section `headerAction`s and buttons inside list items, cards, toolbars: `xs` / `icon-xs`.
 * - Inline affordances: `icon-micro`, or `inline-label` for the labelled project inheritance reset.
 * Dialog footers keep the app-wide default button size.
 */
export function SettingsRow({
  title,
  description,
  status,
  resetAction,
  onResetOverride,
  control,
  controlLayout = "inline",
  serverScoped = false,
  settingKeys = EMPTY_SETTING_KEYS,
  mixed: mixedOverride,
  children,
  className,
  ...rowProps
}: Omit<ComponentPropsWithoutRef<"div">, "title"> & {
  title: ReactNode;
  description?: ReactNode;
  status?: ReactNode;
  resetAction?: ReactNode;
  onResetOverride?: () => void;
  control?: ReactNode;
  /** Inline controls align right; full controls occupy a separate row. Children always span the row. */
  controlLayout?: "inline" | "full";
  serverScoped?: boolean;
  settingKeys?: readonly (keyof ServerSettings)[];
  mixed?: boolean;
  children?: ReactNode;
}) {
  const targetRef = useSettingsSearchTarget<HTMLDivElement>(rowProps.id);
  const primarySettingsAvailable = usePrimarySettingsAvailable();
  const context = useOptionalSettingsScope();
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const primaryEnvironment = usePrimaryEnvironment();
  const primaryCanWrite = useEnvironmentScope(primaryEnvironmentId, AuthSettingsWriteScope);
  const writableIds = useEnvironmentsWithScope(
    context?.connectedEnvironments ?? [],
    AuthSettingsWriteScope,
  );
  const canWriteSettings = context
    ? context.connectedEnvironments.length > 0 &&
      context.connectedEnvironments.every((target) => writableIds.has(target.environmentId))
    : primaryCanWrite;
  const clearOverrides = useClearScopedSettings();
  const clearProjectOverrides = useClearProjectOverrides();
  const isProjectScope =
    context !== null && (context.scope.kind === "project" || context.scope.kind === "checkout");
  const scopedKeys = settingKeys.filter(isProjectScopedSettingKey);
  const environmentWide = isProjectScope && serverScoped && scopedKeys.length === 0;
  const mixed =
    mixedOverride ?? (context !== null && scopedSettingsAreMixed(context.targets, settingKeys));
  const source =
    context && isProjectScope ? scopedSettingsSource(context.targets, scopedKeys) : null;
  const unavailable =
    serverScoped &&
    (!canWriteSettings ||
      !(context ? context.connectedEnvironments.length > 0 : primarySettingsAvailable));
  const inheritedFrom =
    context && !context.search.machine && context.scope.kind !== "checkout"
      ? t.settings.scopeSentence.allEnvironments
      : source === "environment" && context?.scope.environmentIds.length === 1
        ? (context.environments.find(
            (environment) => environment.environmentId === context.scope.environmentIds[0],
          )?.label ?? t.settings.layout.environment)
        : t.settings.layout.environment;
  const environmentSettingsById = new Map(
    (context?.connectedEnvironments ?? []).flatMap((environment) =>
      environment.serverConfig
        ? [[environment.environmentId, environment.serverConfig.settings] as const]
        : [],
    ),
  );
  const overridingProjects = isProjectScope ? [] : projectOverrides(context, scopedKeys);
  const renderedReset = unavailable ? null : isProjectScope && scopedKeys.length > 0 ? (
    source === "project" || source === "mixed" ? (
      <SettingResetButton
        label={typeof title === "string" ? title : t.settings.layout.override}
        tooltip={t.settings.layout.resetToInherited}
        showLabel
        onClick={() => (onResetOverride ? onResetOverride() : clearOverrides(scopedKeys))}
      />
    ) : null
  ) : (
    resetAction
  );
  const inertControl = (message: string) => (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            tabIndex={0}
            className="flex max-w-full items-center rounded-menu-row outline-none focus-visible:inset-shadow-focus"
          />
        }
      >
        <div inert className="flex max-w-full items-center gap-2 opacity-50">
          {control}
        </div>
      </TooltipTrigger>
      <TooltipPopup side="top">{message}</TooltipPopup>
    </Tooltip>
  );
  const renderedControl =
    unavailable && control
      ? inertControl(
          !canWriteSettings
            ? t.settings.merge.permissionOn(
                context
                  ? context.connectedEnvironments
                      .filter((target) => !writableIds.has(target.environmentId))
                      .map((target) => target.label)
                      .join(", ") || t.settings.merge.selectedEnvironment
                  : (primaryEnvironment?.label ?? t.settings.merge.primaryEnvironment),
              )
            : context
              ? t.settings.layout.reconnectHint
              : t.settings.layout.primaryUnavailableHint,
        )
      : environmentWide && control
        ? inertControl(t.settings.layout.environmentWideHint)
        : control;
  // The text badge still opens the resolution chain; changing its presentation
  // must not remove the per-target values or project reset actions in that chain.
  const customized =
    context !== null &&
    settingKeys.some((key) =>
      context.targets.some((candidate) => {
        const environmentSettings = environmentSettingsById.get(candidate.environmentId);
        return (
          environmentSettings !== undefined &&
          !Equal.equals(environmentSettings[key], DEFAULT_SERVER_SETTINGS[key])
        );
      }),
    );
  const inheritance: { state: SettingInheritanceState; summary: string } = mixed
    ? { state: "mixed", summary: t.settings.layout.mixedHint }
    : source === "project"
      ? { state: "overridden", summary: t.settings.layout.projectOverrideHint }
      : source === "t3.json"
        ? { state: "inherited", summary: t.settings.layout.repositoryInheritanceHint }
        : source === "environment" && scopedKeys.length > 0
          ? { state: "inherited", summary: t.settings.layout.inheritedFromHint(inheritedFrom) }
          : customized
            ? { state: "environment", summary: t.settings.layout.environmentValueHint }
            : { state: "default", summary: t.settings.layout.builtInDefault };
  const renderedInheritance =
    context && serverScoped && settingKeys.length > 0 ? (
      <SettingInheritance
        state={inheritance.state}
        summary={inheritance.summary}
        targets={context.targets}
        environments={context.connectedEnvironments}
        keys={settingKeys}
        overridingProjects={overridingProjects}
        {...(canWriteSettings
          ? {
              onClearOverrides: (entries: readonly ProjectOverrideEntry[]) =>
                clearProjectOverrides(entries, scopedKeys),
            }
          : {})}
      />
    ) : null;
  const renderedStatus = status;

  return (
    <div
      {...rowProps}
      ref={targetRef}
      tabIndex={rowProps.id ? -1 : rowProps.tabIndex}
      data-slot="settings-row"
      className={cn(
        "@container/settings-row flex flex-col gap-3 rounded-settings-row-surface py-2.5 pr-3 pl-3.5 aria-disabled:opacity-64 aria-disabled:[&_*]:text-muted-foreground",
        className,
      )}
    >
      <div className="flex min-h-8 flex-wrap items-center gap-4">
        <div className="min-w-0 flex-1 basis-52 space-y-0.5">
          <div className="flex min-h-5 flex-wrap items-center gap-2">
            <h3 className="text-control leading-normal font-semibold text-foreground">{title}</h3>
            {renderedInheritance}
            {renderedReset}
          </div>
          {description ? (
            <p className="text-secondary-copy-medium leading-normal text-secondary-label">
              {description}
            </p>
          ) : null}
          {renderedStatus ? (
            <div className="pt-0.5 text-secondary-copy leading-normal text-muted-foreground">
              {renderedStatus}
            </div>
          ) : null}
        </div>
        {renderedControl ? (
          <div
            className={cn(
              "ml-auto flex min-w-0 max-w-full shrink-0 items-center justify-end gap-2",
              controlLayout === "full" && "w-full basis-full",
            )}
          >
            {renderedControl}
          </div>
        ) : null}
      </div>
      {unavailable && children ? (
        <div inert className="opacity-50">
          {children}
        </div>
      ) : (
        children
      )}
    </div>
  );
}

/**
 * Renders a reset button that stops click propagation and delegates the reset to onClick.
 * @param props.label Setting name used in the accessible action name.
 * @param props.tooltip Tooltip text; defaults to the localized reset text.
 * @param props.disabled Whether the button is disabled; defaults to false.
 * @param props.showLabel Whether to show the project inheritance reset label; defaults to false.
 * @param props.onClick Callback that performs the reset.
 */
export function SettingResetButton({
  label,
  tooltip = t.common.resetToDefault,
  disabled = false,
  showLabel = false,
  onClick,
}: {
  label: string;
  tooltip?: string;
  disabled?: boolean;
  /** Project override resets show their inheritance action; other existing callers retain an icon. */
  showLabel?: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            size={showLabel ? "inline-label" : "icon-micro"}
            variant={showLabel ? "outline" : "ghost-muted"}
            aria-label={t.common.resetLabelToDefault(label)}
            disabled={disabled}
            onClick={(event) => {
              event.stopPropagation();
              onClick();
            }}
          >
            <Undo2Icon className="size-3" />
            {showLabel ? t.settings.layout.resetToInherited : null}
          </Button>
        }
      />
      <TooltipPopup side="top">{tooltip}</TooltipPopup>
    </Tooltip>
  );
}

/**
 * Provides search destination context and aligned child content; the route owns scrolling and the header.
 * width retains existing wide/expanded layouts; the readable default follows the design's 820px frame.
 */
export function SettingsPageContainer({
  children,
  className,
  width = "readable",
}: {
  children: ReactNode;
  className?: string;
  width?: WorkspacePageWidth;
}) {
  const navigate = useNavigate();
  const hash = useLocation({ select: (location) => location.hash });
  const highlightTarget = useLocation({
    select: (location) => location.state.settingsTargetHighlight !== false,
  });
  const targetId = hash.replace(/^#/, "") || null;
  const clearTargetHash = () => {
    void navigate({
      hash: "",
      replace: true,
      resetScroll: false,
      hashScrollIntoView: false,
      state: { settingsTargetHighlight: true },
    });
  };

  return (
    <SettingsSearchTargetProvider
      targetId={targetId}
      highlightTarget={highlightTarget}
      onTargetHandled={clearTargetHash}
    >
      <div
        className={cn(
          "mx-auto flex w-full flex-col gap-5.5 px-7 pt-5.5 pb-12",
          width === "readable" ? "max-w-205" : width === "wide" ? "max-w-5xl" : "max-w-6xl",
          className,
        )}
      >
        {children}
      </div>
    </SettingsSearchTargetProvider>
  );
}

export function scrollToSettingsTarget(
  targetId: string,
  { highlight = true }: { readonly highlight?: boolean } = {},
): boolean {
  const target = document.getElementById(targetId);
  if (!target) return false;
  scrollAndFocusSettingsTarget(target, highlight);
  return true;
}
