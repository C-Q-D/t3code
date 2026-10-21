/** Stash count feedback and the existing save fade share the same badge. */
import { t } from "~/i18n";
import { BookmarkIcon } from "lucide-react";
import { memo, useRef } from "react";

import { useCountPop } from "../../hooks/useCountPop";
import { cn } from "~/lib/utils";
import { ComposerBanner } from "./ComposerBanner";

export const ComposerStashBadge = memo(function ComposerStashBadge(props: {
  count: number;
  menuOpen: boolean;
  pulseKey: number;
  pulsing: boolean;
  onToggleMenu: () => void;
}) {
  const countRef = useRef<HTMLSpanElement>(null);
  useCountPop(countRef, props.count);
  if (props.count === 0) return null;
  const count = (
    <ComposerBanner.Count
      ref={countRef}
      key={props.pulseKey}
      className={cn(
        props.pulsing
          ? "text-primary transition-[opacity,translate] duration-180 ease-out starting:translate-y-0.5 starting:opacity-0 motion-reduce:transition-none"
          : "text-muted-foreground",
      )}
    >
      {props.count}
    </ComposerBanner.Count>
  );

  return (
    <ComposerBanner.Root density="comfortable" width="content" shoulderTab className="ml-auto">
      <ComposerBanner.Row
        render={<button type="button" />}
        data-prompt-stash-badge="true"
        aria-label={t.composer.stash.openAriaLabel(props.count)}
        aria-expanded={props.menuOpen}
        className={cn(
          "transition-colors duration-200",
          props.menuOpen && "pointer-events-none",
          props.menuOpen || props.pulsing
            ? "text-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
        onPointerDown={(event) => event.preventDefault()}
        onClick={props.onToggleMenu}
      >
        <ComposerBanner.Icon>
          <BookmarkIcon />
        </ComposerBanner.Icon>
        <ComposerBanner.Content>{t.composer.stash.title}</ComposerBanner.Content>
        <ComposerBanner.Actions>{count}</ComposerBanner.Actions>
      </ComposerBanner.Row>
    </ComposerBanner.Root>
  );
});
