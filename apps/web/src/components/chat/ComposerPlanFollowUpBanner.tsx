/** Identifies the ready plan while the existing primary actions own implementation and feedback. */
import { t } from "~/i18n";
import { memo } from "react";
import { ComposerBanner } from "./ComposerBanner";

/** Displays readiness and the optional plan title without dispatching plan actions. */
export const ComposerPlanFollowUpBanner = memo(function ComposerPlanFollowUpBanner({
  planTitle,
}: {
  planTitle: string | null;
}) {
  return (
    <ComposerBanner.Row className="composer-plan-ready">
      <ComposerBanner.Content>
        <span className="shrink-0 font-medium text-muted-foreground">
          {t.composer.planFollowUp.ready}
        </span>
        {planTitle ? (
          <span className="min-w-0 flex-1 truncate text-foreground/85">{planTitle}</span>
        ) : null}
      </ComposerBanner.Content>
    </ComposerBanner.Row>
  );
});
