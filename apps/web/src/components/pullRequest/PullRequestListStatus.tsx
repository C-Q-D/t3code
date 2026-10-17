/** List-only L6 status card; callers retain state selection and recovery actions. */
import type { ElementType, ReactNode } from "react";

/**
 * Draw the L6 150px status card, allowing diagnostic text to grow instead of clipping it.
 * @param props Localized status, optional diagnostics and existing recovery controls below the card.
 * @returns A status region; this component never fetches data or selects a recovery action.
 */
export function PullRequestListStatus({
  Icon,
  title,
  description,
  children,
}: {
  Icon: ElementType<{ className?: string }>;
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div
        role="status"
        className="flex min-h-37.5 flex-col items-center justify-center gap-2.5 rounded-card-surface bg-card p-3 text-center text-secondary-copy-large text-secondary-label shadow-pr-list-empty"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-compact-row shadow-pr-list-empty-mark">
          <Icon aria-hidden className="size-4.5" />
        </span>
        <h2 className="font-normal">{title}</h2>
        {description ? (
          <p className="max-w-full break-words text-secondary-copy text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {children ? <div className="flex flex-wrap justify-center gap-2">{children}</div> : null}
    </div>
  );
}
