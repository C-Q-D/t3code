/** Q1–Q3 onboarding surfaces; flow state and cloud mutations remain with their callers. */
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { CheckIcon, CircleCheckIcon, CircleXIcon, CloudIcon, HourglassIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { t } from "~/i18n";
import { cn } from "~/lib/utils";

/** Gives standalone pairing and authorization routes the Q3 stone surface without introducing modal behavior. */
export function OnboardingPage({ children }: { readonly children: ReactNode }) {
  return (
    <main className="flex h-full min-h-0 items-center justify-center overflow-y-auto scrollbar-gutter-both stone-base p-5 text-control text-foreground">
      <section className="dialog-glass my-auto flex w-full max-w-110 flex-col gap-3.5 rounded-ov5-panel px-7 pt-6.5 pb-5.5">
        {children}
      </section>
    </main>
  );
}

/** Announces the supplied real pairing outcome with Q3's compact status row; it performs no requests. */
export function OnboardingStatus({
  tone,
  children,
}: {
  readonly tone: "pending" | "success" | "error";
  readonly children: ReactNode;
}) {
  const Icon =
    tone === "success" ? CircleCheckIcon : tone === "error" ? CircleXIcon : HourglassIcon;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "flex min-h-10 items-center gap-2.5 rounded-ov5-row px-3.5 py-2 text-secondary-copy-large font-semibold",
        tone === "success"
          ? "bg-status-success text-success-foreground"
          : tone === "error"
            ? "bg-error-surface text-error-foreground"
            : "bg-ov5-row text-code-foreground",
      )}
    >
      <Icon className="size-3.75 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

/** Keeps modal focus handling while giving first-run setup an opaque, chrome-safe backdrop. */
export function OnboardingPopup({
  children,
  welcome = false,
  ...props
}: ComponentProps<typeof DialogPrimitive.Popup> & { readonly welcome?: boolean }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop
        className={
          welcome
            ? "ov5-welcome-backdrop fixed inset-0 z-50 stone-base"
            : "dialog-backdrop fixed inset-0 z-50"
        }
      />
      <DialogPrimitive.Viewport
        data-slot="onboarding-viewport"
        className={cn(
          "fixed inset-0 z-50 flex items-center justify-center overflow-y-auto scrollbar-gutter-both p-5",
          welcome && "ov5-welcome-viewport",
        )}
      >
        <DialogPrimitive.Popup
          {...props}
          className={cn(
            "dialog-glass relative my-auto flex max-h-full min-h-0 w-full flex-col gap-4.5 overflow-y-auto rounded-ov5-panel px-7 pt-6.5 pb-5.5 text-control text-foreground outline-none",
            welcome ? "max-w-150" : "max-w-110",
          )}
        >
          {children}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Viewport>
    </DialogPrimitive.Portal>
  );
}

/** Presents the design's title and optional cloud emblem; description stays available to assistive technology. */
export function OnboardingHeader({
  title,
  description,
  children,
  cloud = false,
}: {
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly children?: ReactNode;
  readonly cloud?: boolean;
}) {
  return (
    <header className="flex flex-col gap-3.5">
      <div className="flex items-center gap-2.5">
        {cloud ? (
          <span className="flex size-8.5 items-center justify-center rounded-ov5-cloud bg-ov5-well shadow-well-pressed">
            <CloudIcon className="size-4.25" />
          </span>
        ) : null}
        <DialogPrimitive.Title
          className={cn(
            "font-serif font-bold",
            cloud ? "text-ov5-connect-title" : "text-ov5-title",
          )}
        >
          {title}
        </DialogPrimitive.Title>
      </div>
      {description ? (
        <DialogPrimitive.Description className="sr-only">{description}</DialogPrimitive.Description>
      ) : null}
      {children}
    </header>
  );
}

/** Shows ordered stages; only caller-enabled earlier stages can navigate backwards. */
export function OnboardingSteps({
  steps,
  currentStep,
  isStepDisabled,
  onStepChange,
}: {
  readonly steps: readonly string[];
  readonly currentStep: number;
  readonly isStepDisabled?: (index: number) => boolean;
  readonly onStepChange?: (index: number) => void;
}) {
  return (
    <ol className="flex flex-wrap items-center gap-2.5" aria-label={t.app.wizard.progress}>
      {steps.map((label, index) => (
        <li key={label} className="flex items-center gap-2">
          <button
            type="button"
            disabled={!onStepChange || isStepDisabled?.(index)}
            onClick={() => onStepChange?.(index)}
            aria-current={index === currentStep ? "step" : undefined}
            aria-label={t.app.wizard.step(label, index + 1, "")}
            className="flex items-center gap-2 rounded-full outline-none focus-visible:inset-shadow-focus"
          >
            <span
              aria-hidden
              className={cn(
                "flex size-6 items-center justify-center rounded-full font-mono text-secondary-copy font-medium",
                index === currentStep
                  ? "bg-primary text-primary-foreground shadow-primary-edge"
                  : "text-code-foreground shadow-ov5-step",
                index < currentStep ? "bg-ov5-complete" : index > currentStep && "bg-ov5-well",
              )}
            >
              {index < currentStep ? <CheckIcon className="size-3" /> : index + 1}
            </span>
            <span
              className={cn(
                "whitespace-nowrap text-secondary-copy-medium",
                index === currentStep
                  ? "font-bold text-foreground"
                  : index < currentStep
                    ? "font-medium text-code-foreground"
                    : "font-medium text-placeholder",
              )}
            >
              {label}
            </span>
          </button>
          {index < steps.length - 1 ? <span aria-hidden className="h-0.25 w-7 bg-border" /> : null}
        </li>
      ))}
    </ol>
  );
}

/** Keeps the panel unanimated so terminal and project updates do not animate layout height. */
export function OnboardingPanel({
  children,
}: {
  readonly children: ReactNode;
  readonly holdHeight?: boolean;
}) {
  return <div className="min-h-0 min-w-0">{children}</div>;
}

/** Places opt-out beside the existing completion actions without changing their callbacks. */
export function OnboardingFooter({
  children,
  leading,
}: {
  readonly children: ReactNode;
  readonly leading?: ReactNode;
}) {
  return (
    <footer className="mt-1 flex flex-wrap items-center gap-2">
      {leading}
      <div className="ml-auto flex items-center gap-2">{children}</div>
    </footer>
  );
}
