/** Wraps the dialog primitive with shared layout and accessible dismissal controls. */
"use client";

import { t } from "~/i18n";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { XIcon } from "lucide-react";
import { createPresenceRegistry } from "~/lib/presenceRegistry";
import { type ComponentProps, createContext, type ReactNode, use, useState } from "react";
import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import {
  DIALOG_BACKDROP_CLASS,
  DIALOG_MEDIA_BACKDROP_CLASS,
  DIALOG_MEDIA_POPUP_CLASS,
  DIALOG_MOBILE_SHEET_CLASS,
  DIALOG_POPUP_CLASS,
} from "~/components/ui/dialog-styles";
import { ScrollArea } from "~/components/ui/scroll-area";

const ControlledOpenContext = createContext<boolean | undefined>(undefined);

function RetainedWhileClosed({ open, children }: { open: boolean; children: ReactNode }) {
  const controlledOpen = use(ControlledOpenContext);
  const isOpen = open && controlledOpen !== false;
  const [retained, setRetained] = useState(children);
  if (isOpen && retained !== children) {
    setRetained(children);
  }
  return isOpen ? children : retained;
}

function renderRetainedPopup(props: ComponentProps<"div">, state: { open: boolean }) {
  return (
    <div {...props}>
      <RetainedWhileClosed open={state.open}>{props.children}</RetainedWhileClosed>
    </div>
  );
}

function Dialog<Payload>(props: DialogPrimitive.Root.Props<Payload>) {
  return (
    <ControlledOpenContext value={props.open}>
      <DialogPrimitive.Root {...props} />
    </ControlledOpenContext>
  );
}

const DialogPortal = DialogPrimitive.Portal;

const DialogPresence = createPresenceRegistry<"header" | "footer">();

function DialogTrigger(props: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogClose(props: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogBackdrop({
  className,
  variant = "default",
  ...props
}: DialogPrimitive.Backdrop.Props & { variant?: "default" | "media" }) {
  return (
    <DialogPrimitive.Backdrop
      forceRender
      className={cn(
        variant === "media" ? DIALOG_MEDIA_BACKDROP_CLASS : DIALOG_BACKDROP_CLASS,
        className,
      )}
      data-slot="dialog-backdrop"
      {...props}
    />
  );
}

function DialogViewport({ className, ...props }: DialogPrimitive.Viewport.Props) {
  return (
    <DialogPrimitive.Viewport
      className={cn(
        "fixed inset-0 z-50 grid grid-rows-[1fr_auto_1fr] justify-items-center p-4",
        className,
      )}
      data-slot="dialog-viewport"
      {...props}
    />
  );
}

/** Renders dialog children with the requested variant and layout; showCloseButton controls its accessible dismiss action and remaining props go to the dialog primitive. Slot counts stay in this wrapper so header/footer changes update spacing before paint. */
function DialogPopup({
  className,
  size,
  children,
  showCloseButton = true,
  bottomStickOnMobile = true,
  variant = "default",
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean;
  bottomStickOnMobile?: boolean;
  /** H4/H5: explicit 440px and 400px confirmation widths, without changing the default. */
  size?: "default" | "wide" | "compact";
  variant?: "default" | "media";
}) {
  const { counts, onChange } = DialogPresence.usePresence();
  return (
    <DialogPresence.Provider onChange={onChange}>
      <DialogPortal>
        {/* Media opens from inside other overlays (a composer chip, a popover), so it sits above them. */}
        <DialogBackdrop className={variant === "media" ? "z-[60]" : undefined} variant={variant} />
        <DialogViewport
          className={cn(
            bottomStickOnMobile && "max-sm:grid-rows-[1fr_auto] max-sm:p-0 max-sm:pt-12",
            variant === "media" &&
              "z-[60] grid-rows-1 place-items-center px-4 pb-6 pt-[calc(var(--native-titlebar-height,0px)+1.5rem)] [-webkit-app-region:no-drag]",
          )}
        >
          <DialogPrimitive.Popup
            className={cn(
              variant === "media" ? DIALOG_MEDIA_POPUP_CLASS : DIALOG_POPUP_CLASS,
              "row-start-2 text-popover-foreground",
              variant === "default" && "max-h-full",
              bottomStickOnMobile && DIALOG_MOBILE_SHEET_CLASS,
              size === "wide" && "max-w-110",
              size === "compact" && "max-w-100",
              className,
            )}
            render={renderRetainedPopup}
            data-slot="dialog-popup"
            {...props}
            data-has-header={String((counts.header ?? 0) > 0)}
            data-has-footer={String((counts.footer ?? 0) > 0)}
          >
            {children}
            {showCloseButton && (
              <DialogPrimitive.Close
                aria-label={t.app.actions.close}
                className="absolute end-2 top-2"
                render={<Button size="icon" variant="ghost" />}
              >
                <XIcon />
              </DialogPrimitive.Close>
            )}
          </DialogPrimitive.Popup>
        </DialogViewport>
      </DialogPortal>
    </DialogPresence.Provider>
  );
}

/** Insets the title and optional description using the H4 shell spacing and registers header presence for panel spacing. */
function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  DialogPresence.useRegister("header");
  return (
    <div
      className={cn("flex min-w-0 flex-col gap-2.5 px-5.5 pt-5.5", className)}
      data-slot="dialog-header"
      {...props}
    />
  );
}

/** Aligns caller-ordered secondary and primary actions to the right; bare keeps a compact top gap. Registers footer presence so panels can adjust their bottom inset. */
function DialogFooter({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"div"> & {
  variant?: "default" | "bare";
}) {
  DialogPresence.useRegister("footer");
  return (
    <div
      className={cn(
        "flex flex-row justify-end gap-2 px-5.5 pb-4.5",
        variant === "default" && "pt-4.5",
        variant === "bare" && "pt-2",
        className,
      )}
      data-slot="dialog-footer"
      {...props}
    />
  );
}

/** Keeps the accessible title intact and exposes rich title text through the native hover hint. */
function DialogTitle({
  className,
  size,
  title,
  onMouseEnter,
  ...props
}: DialogPrimitive.Title.Props & { size?: "lg" }) {
  return (
    <DialogPrimitive.Title
      className={cn(
        "min-w-0 truncate font-serif text-dialog-title font-bold",
        size === "lg" && "text-discussion-dialog-heading",
        className,
      )}
      data-slot="dialog-title"
      title={title}
      onMouseEnter={(event) => {
        if (title === undefined) event.currentTarget.title = event.currentTarget.textContent ?? "";
        onMouseEnter?.(event);
      }}
      {...props}
    />
  );
}

function DialogDescription({ className, ...props }: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      className={cn("text-muted-foreground text-sm", className)}
      data-slot="dialog-description"
      {...props}
    />
  );
}

/** Provides scrolling content with H4 horizontal insets; scrollFade defaults to true. */
function DialogPanel({
  className,
  scrollFade = true,
  ...props
}: React.ComponentProps<"div"> & { scrollFade?: boolean }) {
  return (
    <ScrollArea scrollFade={scrollFade}>
      <div
        className={cn(
          "space-y-4 p-5.5 in-data-[has-header=true]:pt-1 in-data-[has-footer=true]:pb-1",
          className,
        )}
        data-slot="dialog-panel"
        {...props}
      />
    </ScrollArea>
  );
}

export {
  ControlledOpenContext,
  renderRetainedPopup,
  Dialog,
  DialogTrigger,
  DialogPortal,
  DialogClose,
  DialogBackdrop,
  DialogBackdrop as DialogOverlay,
  DialogPopup,
  DialogPopup as DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogPanel,
  DialogViewport,
};
