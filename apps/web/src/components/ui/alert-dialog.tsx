/** Confirmation dialog shell; shares material with dialogs and defaults focus to the trailing action. */
"use client";

import { AlertDialog as AlertDialogPrimitive } from "@base-ui/react/alert-dialog";
import { useRef } from "react";

import { cn } from "~/lib/utils";
import {
  DIALOG_BACKDROP_CLASS,
  DIALOG_MOBILE_SHEET_CLASS,
  DIALOG_POPUP_CLASS,
} from "~/components/ui/dialog-styles";
import { ControlledOpenContext, renderRetainedPopup } from "~/components/ui/dialog";

function AlertDialog<Payload>(props: AlertDialogPrimitive.Root.Props<Payload>) {
  return (
    <ControlledOpenContext value={props.open}>
      <AlertDialogPrimitive.Root {...props} />
    </ControlledOpenContext>
  );
}

const AlertDialogPortal = AlertDialogPrimitive.Portal;

function AlertDialogBackdrop({ className, ...props }: AlertDialogPrimitive.Backdrop.Props) {
  return (
    <AlertDialogPrimitive.Backdrop
      forceRender
      className={cn(DIALOG_BACKDROP_CLASS, className)}
      data-slot="alert-dialog-backdrop"
      {...props}
    />
  );
}

function AlertDialogViewport({ className, ...props }: AlertDialogPrimitive.Viewport.Props) {
  return (
    <AlertDialogPrimitive.Viewport
      className={cn(
        "fixed inset-0 z-50 grid grid-rows-[1fr_auto_1fr] justify-items-center p-4",
        className,
      )}
      data-slot="alert-dialog-viewport"
      {...props}
    />
  );
}

/** Uses the last available footer button as the primary action unless initialFocus is supplied; forwards popup refs and all primitive props. */
function AlertDialogPopup({
  className,
  size,
  bottomStickOnMobile = true,
  portalContainer,
  initialFocus,
  ref,
  ...props
}: AlertDialogPrimitive.Popup.Props & {
  bottomStickOnMobile?: boolean;
  /** H4/H5: explicit 440px and 400px confirmation widths, without changing the default. */
  size?: "default" | "wide" | "compact";
  portalContainer?: AlertDialogPrimitive.Portal.Props["container"];
}) {
  const popupRef = useRef<HTMLDivElement | null>(null);
  const setPopupRef = (element: HTMLDivElement | null) => {
    popupRef.current = element;
    const cleanup = typeof ref === "function" ? ref(element) : undefined;
    if (ref && typeof ref !== "function") ref.current = element;
    return () => {
      popupRef.current = null;
      if (typeof cleanup === "function") cleanup();
      else if (typeof ref === "function") ref(null);
      else if (ref) ref.current = null;
    };
  };

  /** Returns the trailing available action, or true to delegate an empty footer to Base UI. */
  const focusPrimaryAction = () => {
    // The shell's action order is secondary first, primary last. Ignore unavailable actions
    // and descendants of another dialog/alertdialog, including ordinary dialog popups.
    const buttons = popupRef.current?.querySelectorAll<HTMLButtonElement>(
      '[data-slot="alert-dialog-footer"] button:not(:disabled):not([aria-disabled="true"]):not([tabindex="-1"])',
    );
    return (
      Array.from(buttons ?? []).findLast((button) => {
        if (button.closest('[role="dialog"], [role="alertdialog"]') !== popupRef.current)
          return false;
        for (let element: HTMLElement | null = button; element; element = element.parentElement) {
          const style = element.ownerDocument.defaultView?.getComputedStyle(element);
          if (
            element.matches("[hidden], [inert]") ||
            style?.display === "none" ||
            style?.visibility === "hidden" ||
            style?.visibility === "collapse"
          )
            return false;
        }
        return true;
      }) ?? true
    );
  };

  return (
    <AlertDialogPortal container={portalContainer}>
      <AlertDialogBackdrop />
      <AlertDialogViewport
        className={cn(bottomStickOnMobile && "max-sm:grid-rows-[1fr_auto] max-sm:p-0 max-sm:pt-12")}
      >
        <AlertDialogPrimitive.Popup
          className={cn(
            DIALOG_POPUP_CLASS,
            "row-start-2 max-h-full text-popover-foreground",
            bottomStickOnMobile && DIALOG_MOBILE_SHEET_CLASS,
            size === "wide" && "max-w-110",
            size === "compact" && "max-w-100",
            className,
          )}
          data-slot="alert-dialog-popup"
          ref={setPopupRef}
          initialFocus={initialFocus === undefined ? focusPrimaryAction : initialFocus}
          render={renderRetainedPopup}
          {...props}
        />
      </AlertDialogViewport>
    </AlertDialogPortal>
  );
}

/** Insets title and description using H4 spacing; permits long descriptions to shrink and scroll. */
function AlertDialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex min-h-0 min-w-0 flex-col gap-2.5 px-5.5 pt-5.5 text-left", className)}
      data-slot="alert-dialog-header"
      {...props}
    />
  );
}

/** Aligns caller-ordered secondary and primary actions to the right; bare keeps a compact top gap. */
function AlertDialogFooter({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"div"> & {
  variant?: "default" | "bare";
}) {
  return (
    <div
      className={cn(
        "flex flex-row justify-end gap-2 px-5.5 pb-4.5",
        variant === "default" && "pt-4.5",
        variant === "bare" && "pt-2",
        className,
      )}
      data-slot="alert-dialog-footer"
      {...props}
    />
  );
}

/** Preserves the full accessible title while exposing truncated rich text in the native hover hint. */
function AlertDialogTitle({
  className,
  size,
  title,
  onMouseEnter,
  ...props
}: AlertDialogPrimitive.Title.Props & { size?: "lg" }) {
  return (
    <AlertDialogPrimitive.Title
      className={cn(
        "min-w-0 shrink-0 truncate font-serif text-dialog-title font-bold",
        size === "lg" && "text-discussion-dialog-heading",
        className,
      )}
      data-slot="alert-dialog-title"
      title={title}
      onMouseEnter={(event) => {
        if (title === undefined) event.currentTarget.title = event.currentTarget.textContent ?? "";
        onMouseEnter?.(event);
      }}
      {...props}
    />
  );
}

/** Preserves accessible description semantics; confirmation uses the H5 body-copy treatment. */
function AlertDialogDescription({
  className,
  variant,
  ...props
}: AlertDialogPrimitive.Description.Props & { variant?: "confirmation" }) {
  return (
    <AlertDialogPrimitive.Description
      className={cn(
        "wrap-anywhere max-h-[min(24rem,60dvh)] min-h-0 overflow-y-auto overscroll-contain text-muted-foreground text-sm select-text",
        variant === "confirmation" && "text-body text-code-foreground",
        className,
      )}
      data-slot="alert-dialog-description"
      {...props}
    />
  );
}

function AlertDialogClose(props: AlertDialogPrimitive.Close.Props) {
  return <AlertDialogPrimitive.Close data-slot="alert-dialog-close" {...props} />;
}

export {
  AlertDialog,
  AlertDialogPortal,
  AlertDialogBackdrop,
  AlertDialogBackdrop as AlertDialogOverlay,
  AlertDialogPopup,
  AlertDialogPopup as AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogClose,
  AlertDialogViewport,
};
