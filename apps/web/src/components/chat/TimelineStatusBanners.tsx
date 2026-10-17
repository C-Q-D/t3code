/** Renders T2 notices in one measured overlay while leaving visibility and actions with their callers. */
import { memo, type ReactNode, type ComponentProps } from "react";
import { XIcon } from "lucide-react";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "../ui/alert";
import type { ComposerBannerStackContent, ComposerBannerStackItem } from "./ComposerBannerStack";

/** Uses T2's inverse or text-only recovery key on sand, forwarding the existing native action. */
export function TimelineBannerAction({
  quiet = false,
  ...props
}: ComponentProps<"button"> & { quiet?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      className={quiet ? "timeline-status-link" : "timeline-provider-setup"}
    />
  );
}

/** The feature's 28px close key preserves its caller's accessible name and dismissal callback. */
export function TimelineBannerDismiss({
  label,
  onDismiss,
}: {
  label: string;
  onDismiss: () => void;
}) {
  return (
    <button
      type="button"
      className="timeline-status-dismiss"
      aria-label={label}
      onClick={onDismiss}
    >
      <XIcon aria-hidden="true" className="size-3.5" />
    </button>
  );
}

/** Displays caller-owned recovery actions in a shared sand status bar, including unpictured states. */
export const TimelineStatusBanner = memo(function TimelineStatusBanner({
  item,
}: {
  item: ComposerBannerStackItem;
}) {
  return (
    <div className="pointer-events-auto" data-timeline-state={item.id}>
      <Alert variant="sand" surface="glass" size="status-bar" role="status">
        {item.icon}
        <AlertTitle>{item.title}</AlertTitle>
        {item.description || item.children ? (
          <AlertDescription>
            {" "}
            {item.description}
            {item.children}
          </AlertDescription>
        ) : null}
        {item.actions || item.onDismiss ? (
          <AlertAction>
            {item.actions}
            {item.onDismiss && item.dismissLabel ? (
              <TimelineBannerDismiss label={item.dismissLabel} onDismiss={item.onDismiss} />
            ) : null}
          </AlertAction>
        ) : null}
      </Alert>
    </div>
  );
});

/** Stacks overlays outside list layout; its bounds cover Provider, thread, and routed notices together. */
export const TimelineStatusBanners = memo(function TimelineStatusBanners({
  children,
  items,
}: {
  children: ReactNode;
  items: readonly (ComposerBannerStackItem | ComposerBannerStackContent)[];
}) {
  return (
    <div data-timeline-status-banners className="timeline-status-stack">
      {children}
      {items.map((item) =>
        "content" in item ? (
          <div key={item.id} className="pointer-events-auto">
            {item.content}
          </div>
        ) : (
          <TimelineStatusBanner key={item.id} item={item} />
        ),
      )}
    </div>
  );
});
