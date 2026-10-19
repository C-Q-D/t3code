/** Shared F1 section headings, spacing and recessed dividers for thread details. */
import type { ComponentProps, ReactNode } from "react";

import { cn } from "../../lib/utils";

/**
 * Groups F1 detail content under one accessible heading in either card presentation.
 * @param props - Heading ID/title, optional actions and content; separated adds the F1 divider.
 * titleAccessory sits right after the heading (e.g. a live count) and is not part of its name.
 * @returns A section labelled by its visible heading, or directly by title when hidden.
 */
export function ThreadDetailsSection({
  headingId,
  title,
  titleAccessory,
  actions,
  separated = true,
  showHeading = true,
  children,
  ...props
}: Omit<ComponentProps<"section">, "className" | "style" | "title" | "aria-labelledby"> & {
  headingId: string;
  title: string;
  titleAccessory?: ReactNode;
  actions?: ReactNode;
  separated?: boolean;
  showHeading?: boolean;
}) {
  return (
    <section
      {...props}
      aria-labelledby={showHeading ? headingId : undefined}
      aria-label={showHeading ? undefined : title}
      className={cn("flex min-w-0 flex-col gap-3", separated && "thread-details-section-separated")}
    >
      <div
        className={cn("flex min-w-0 items-center justify-between gap-2", !showHeading && "hidden")}
      >
        <div className="flex min-w-0 items-center gap-2">
          <h3
            id={headingId}
            className="min-w-0 truncate font-serif text-card-title font-bold text-foreground select-none"
          >
            {title}
          </h3>
          {titleAccessory}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}
