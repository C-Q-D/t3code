/** Presents composer notices without owning their priority, visibility, or actions. */
import { t } from "~/i18n";
import { ChevronDownIcon, InfoIcon, LayersIcon } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "~/lib/utils";
import { Button } from "../ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { BannerDockRegistry, ComposerBanner, type ComposerBannerVariant } from "./ComposerBanner";
import { observeResize } from "~/lib/observeResize";

// Match the duration-220 exit transition before removing a dismissed notice.
const DISMISS_TRANSITION_MS = 220;

/** A caller-owned notice, including its existing recovery and dismissal actions. */
export interface ComposerBannerStackItem {
  readonly id: string;
  readonly variant: ComposerBannerVariant;
  readonly priority?: "urgent" | "activity" | "notice";
  readonly icon: ReactNode;
  readonly title: ReactNode;
  readonly description?: ReactNode;
  /** Current run's real task counts; omitted when no current plan reports progress. */
  readonly progress?: { readonly completedSteps: number; readonly totalSteps: number } | null;
  readonly children?: ReactNode;
  readonly actions?: ReactNode;
  readonly dismissLabel?: string;
  readonly onDismiss?: () => void;
}

/** A notice whose caller renders custom content, such as provider activity. */
export type ComposerBannerStackContent = Pick<
  ComposerBannerStackItem,
  "id" | "variant" | "priority"
> & {
  readonly content: ReactNode;
  /** Identifies custom surfaces whose padding is owned by their content. */
  readonly kind?: "tasks" | "limit-recovery";
};

type ComposerBannerStackEntry = ComposerBannerStackItem | ComposerBannerStackContent;

/** Orders urgent/warning notices first, activity next, then ordinary notices; ties retain input order. */
function bannerPriority(item: ComposerBannerStackEntry) {
  if (item.priority === "urgent" || item.variant === "error" || item.variant === "warning") {
    return 0;
  }
  if (item.priority === "activity") {
    return 1;
  }
  return 2;
}

interface ComposerBannerStackProps {
  readonly className?: string;
  readonly items: ReadonlyArray<ComposerBannerStackEntry>;
  readonly attachedAbove?: ReactNode;
}

/** Displays ordered notices; expansion keeps keyboard focus and dismissal waits for the exit transition. */
export function ComposerBannerStack({ className, items, attachedAbove }: ComposerBannerStackProps) {
  const [stackExpanded, setStackExpanded] = useState(false);
  const noticesRef = useRef<HTMLDivElement>(null);
  const peekRef = useRef<HTMLButtonElement>(null);
  const expandedItemsRef = useRef<HTMLDivElement>(null);
  const pendingFocusRef = useRef<"peek" | "notice" | null>(null);
  const expandedItemsId = useId();
  const [requestedExitingItemId, setExitingItemId] = useState<string | null>(null);
  const dismissTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitingItemId =
    requestedExitingItemId !== null && items.some((item) => item.id === requestedExitingItemId)
      ? requestedExitingItemId
      : null;

  useEffect(() => {
    return () => {
      if (dismissTimeoutRef.current) {
        clearTimeout(dismissTimeoutRef.current);
      }
    };
  }, []);

  // A stack that shrinks to one banner collapses, so the next stack starts collapsed.
  if (items.length < 2 && stackExpanded) {
    setStackExpanded(false);
  }

  useLayoutEffect(() => {
    if (stackExpanded && pendingFocusRef.current === "notice") {
      pendingFocusRef.current = null;
      const firstControl = expandedItemsRef.current?.querySelector<HTMLElement>(
        'button:not(:disabled), a[href], input:not(:disabled), [tabindex="0"]',
      );
      (firstControl ?? expandedItemsRef.current)?.focus({ preventScroll: true });
    } else if (!stackExpanded && pendingFocusRef.current === "peek") {
      pendingFocusRef.current = null;
      peekRef.current?.focus({ preventScroll: true });
    }
  }, [stackExpanded]);

  const orderedItems = items.toSorted((a, b) => bannerPriority(a) - bannerPriority(b));
  const frontItem = orderedItems[0];
  if (!frontItem) {
    return (
      <>
        {null}
        {attachedAbove}
        {null}
      </>
    );
  }
  const stackedItems = orderedItems.slice(1);
  const hasStack = stackedItems.length > 0;
  const showCollapsedStackCap = hasStack && exitingItemId !== frontItem.id;
  const firstStackedItem = stackedItems[0];

  const requestDismiss = (item: ComposerBannerStackEntry) => {
    if (!("onDismiss" in item) || !item.onDismiss || exitingItemId) {
      return;
    }
    setExitingItemId(item.id);
    if (dismissTimeoutRef.current) {
      clearTimeout(dismissTimeoutRef.current);
    }
    dismissTimeoutRef.current = setTimeout(() => {
      dismissTimeoutRef.current = null;
      item.onDismiss?.();
    }, DISMISS_TRANSITION_MS);
  };

  return (
    <>
      {hasStack ? (
        <div
          ref={noticesRef}
          data-composer-banner-stack="true"
          data-chat-composer-collapsed-controls="true"
          className={cn("composer-notices relative z-20", stackExpanded && "z-50")}
          onPointerEnter={(event) => {
            if (event.pointerType === "touch") return;
            if (document.activeElement === peekRef.current) {
              pendingFocusRef.current = "notice";
            }
            setStackExpanded(true);
          }}
          onPointerLeave={(event) => {
            if (!event.currentTarget.contains(document.activeElement)) setStackExpanded(false);
          }}
          onBlurCapture={(event) => {
            if (
              !event.currentTarget.contains(event.relatedTarget) &&
              !event.currentTarget.matches(":hover")
            ) {
              setStackExpanded(false);
            }
          }}
          onKeyDown={(event) => {
            if (event.key !== "Escape" || !stackExpanded) return;
            event.preventDefault();
            event.stopPropagation();
            pendingFocusRef.current = "peek";
            setStackExpanded(false);
          }}
        >
          {showCollapsedStackCap && firstStackedItem ? (
            <button
              type="button"
              ref={peekRef}
              data-slot="composer-banner-peek"
              aria-label={t.composer.bannerStack.showOtherNotices}
              aria-expanded={stackExpanded}
              aria-controls={expandedItemsId}
              aria-hidden={stackExpanded || undefined}
              tabIndex={stackExpanded ? -1 : 0}
              onClick={(event) => {
                event.currentTarget.focus({ preventScroll: true });
                pendingFocusRef.current = "notice";
                setStackExpanded(true);
              }}
              className={cn(
                "composer-notices-toggle absolute inset-x-0 bottom-0 cursor-pointer focus-visible:inset-shadow-focus",
                stackExpanded && "pointer-events-none invisible opacity-0",
              )}
            >
              <LayersIcon aria-hidden />
              <span className="min-w-0 flex-1 truncate text-start">
                {t.composer.bannerStack.otherNotices}
              </span>
              <span className="composer-notices-count">{stackedItems.length}</span>
              <ChevronDownIcon aria-hidden />
            </button>
          ) : null}
          <div
            id={expandedItemsId}
            ref={expandedItemsRef}
            role="group"
            aria-label={t.composer.bannerStack.otherNotices}
            tabIndex={-1}
            data-composer-banner-stack-expanded-items="true"
            className={cn("focus-visible:inset-shadow-focus", !stackExpanded && "hidden")}
          >
            {/* Clip only the collapsing axis: at fractional widths a horizontal clip
                shaves the notice's right border. */}
            <div className="min-h-0 overflow-y-clip">
              <div
                className={cn(
                  "space-y-2 pb-2 transition-opacity duration-150 ease-out",
                  stackExpanded
                    ? "pointer-events-auto visible translate-y-0 opacity-100"
                    : "pointer-events-none invisible translate-y-1 opacity-0",
                )}
              >
                {stackedItems.map((item) => (
                  <div
                    key={item.id}
                    className={cn(
                      "transition-opacity duration-220 ease-in",
                      exitingItemId === item.id
                        ? "pointer-events-none translate-y-28 opacity-0"
                        : "opacity-100",
                    )}
                  >
                    <ComposerBannerStackAlert
                      item={item}
                      attached={false}
                      exiting={exitingItemId === item.id}
                      onDismissRequest={() => requestDismiss(item)}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {attachedAbove}
      <ComposerBanner.Attachment
        data-composer-attachment="notice"
        className={cn("composer-notice-attachment", className)}
        data-composer-banner-drawer="true"
        data-chat-composer-collapsed-controls="true"
      >
        <div
          key={frontItem.id}
          className={cn(
            "relative z-10 transition-opacity duration-220 ease-in",
            exitingItemId === frontItem.id
              ? "pointer-events-none translate-y-16 opacity-0"
              : "opacity-100",
          )}
          onPointerDownCapture={() => {
            setStackExpanded(false);
            const activeElement = document.activeElement;
            if (
              activeElement instanceof HTMLElement &&
              noticesRef.current?.contains(activeElement)
            ) {
              activeElement.blur();
            }
          }}
        >
          <ComposerBannerStackAlert
            item={frontItem}
            attached
            exiting={exitingItemId === frontItem.id}
            onDismissRequest={() => requestDismiss(frontItem)}
          />
        </div>
      </ComposerBanner.Attachment>
    </>
  );
}

/** Makes clipped notice text recoverable while keeping description-only CSS off titles.
 * @param children Full title or description content retained in the details popover.
 * @param className Layout and truncation rules for the inline text.
 * @param detailsLabel Accessible label for the overflow action.
 * @param description Marks description text only; false by default for titles.
 * @returns Inline text and an overflow action when measurement detects hidden content. */
function NoticeText({
  children,
  className,
  detailsLabel,
  description = false,
}: {
  readonly children: ReactNode;
  readonly className: string;
  readonly detailsLabel: string;
  readonly description?: boolean;
}) {
  const textRef = useRef<HTMLSpanElement>(null);
  const detailsRef = useRef<HTMLButtonElement>(null);
  const [showDetails, setShowDetails] = useState(false);

  useLayoutEffect(() => {
    const text = textRef.current;
    if (!text) return;
    const measure = () => {
      // Ignore the space taken by the details button itself so it cannot
      // sustain its own overflow after the text would otherwise fit.
      const recoveredWidth = detailsRef.current ? detailsRef.current.offsetWidth + 4 : 0;
      const hidden = getComputedStyle(text).position === "absolute";
      setShowDetails(
        hidden ||
          [text, ...text.querySelectorAll("*")].some(
            (element) => element.scrollWidth > element.clientWidth + recoveredWidth,
          ),
      );
    };
    measure();
    const stopObserving = observeResize(text, measure);
    const mutations = new MutationObserver(measure);
    mutations.observe(text, { childList: true, subtree: true, characterData: true });
    return () => {
      stopObserving();
      mutations.disconnect();
    };
  }, []);

  return (
    <span className="contents">
      <span
        ref={textRef}
        data-composer-notice-description={description ? "true" : undefined}
        className={className}
      >
        {children}
      </span>
      {showDetails ? (
        <Popover>
          <PopoverTrigger
            openOnHover
            render={
              <Button
                ref={detailsRef}
                size="icon-xs"
                variant="ghost-muted"
                aria-label={detailsLabel}
                className="flex-none"
              />
            }
          >
            <InfoIcon />
          </PopoverTrigger>
          <PopoverPopup
            aria-label={t.composer.bannerStack.details}
            tooltipStyle
            side="top"
            className="max-w-[min(30rem,calc(100vw-2rem))] whitespace-normal wrap-anywhere [--inline-button-text-align:start] [--inline-button-white-space:normal] [&_[data-slot=inline-button]]:max-w-full"
          >
            <ComposerBanner.Scroll className="max-h-[min(var(--available-height),24rem,40dvh)]">
              {children}
            </ComposerBanner.Scroll>
          </PopoverPopup>
        </Popover>
      ) : null}
    </span>
  );
}

/** Renders supplied content or a standard notice, forwarding dismissals to the stack's transition. */
function ComposerBannerStackAlert({
  item,
  attached,
  exiting,
  onDismissRequest,
}: {
  readonly item: ComposerBannerStackEntry;
  readonly attached: boolean;
  readonly exiting: boolean;
  readonly onDismissRequest: () => void;
}) {
  BannerDockRegistry.useRegister("notice");
  if ("content" in item) {
    return (
      <ComposerBanner.Root
        density="comfortable"
        placement={attached ? "attached" : "floating"}
        variant={item.variant}
        className="composer-notice surface-glass"
        data-composer-notice-id={item.id}
        data-composer-notice-kind={item.kind}
      >
        {item.content}
      </ComposerBanner.Root>
    );
  }
  return (
    <ComposerBanner.Root
      role="alert"
      placement={attached ? "attached" : "floating"}
      variant={item.variant}
      density="comfortable"
      className="composer-notice surface-glass"
      data-composer-notice-id={item.id}
    >
      <ComposerBanner.Row layout={item.priority === "activity" ? "inline" : "wrap-actions"}>
        <ComposerBanner.Icon className="h-(--composer-banner-icon-column) self-start">
          {item.icon}
        </ComposerBanner.Icon>
        <ComposerBanner.Content className="whitespace-nowrap">
          <NoticeText
            detailsLabel={t.composer.bannerStack.showTitleDetails}
            className="min-w-0 truncate font-medium leading-7 sm:leading-6"
          >
            {item.title}
          </NoticeText>
          {item.description ? (
            <NoticeText
              description
              detailsLabel={t.composer.bannerStack.showDetails}
              className="w-0 min-w-0 grow truncate text-muted-foreground @max-[400px]:sr-only"
            >
              {item.description}
            </NoticeText>
          ) : null}
        </ComposerBanner.Content>
        {item.progress && item.progress.totalSteps > 0 ? (
          <span className="composer-goal-progress">
            <progress
              className="composer-goal-progress-track"
              aria-label={t.composer.bannerStack.goalProgress}
              value={item.progress.completedSteps}
              max={item.progress.totalSteps}
            />
            <span className="font-mono text-meta-large text-secondary-label tabular-nums">
              {item.progress.completedSteps}/{item.progress.totalSteps}
            </span>
          </span>
        ) : null}
        {item.actions || item.onDismiss ? (
          <ComposerBanner.Actions>
            {item.actions}
            {item.onDismiss ? (
              <ComposerBanner.Dismiss
                aria-label={item.dismissLabel ?? t.composer.bannerStack.dismissWarning}
                disabled={exiting}
                onClick={onDismissRequest}
              />
            ) : null}
          </ComposerBanner.Actions>
        ) : null}
      </ComposerBanner.Row>
      {item.children ? <ComposerBanner.Children>{item.children}</ComposerBanner.Children> : null}
    </ComposerBanner.Root>
  );
}
