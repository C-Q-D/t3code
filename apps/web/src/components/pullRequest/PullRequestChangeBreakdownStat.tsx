import { t } from "~/i18n";
import { formatDiffCount } from "@t3tools/client-runtime/diff-count";
import type { EnvironmentId, PullRequestChangeBreakdown, PullRequestRef } from "@t3tools/contracts";
import { useState } from "react";

import { pullRequestEnvironment } from "~/state/pullRequests";
import { useEnvironmentQuery } from "~/state/query";

import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { PullRequestDiffStat } from "./pullRequestPresentation";

/** Reads the current dictionary on each call so labels follow language changes. */
const kindLabels = () =>
  ({
    code: t.git.pullRequest.code,
    tests: t.git.breakdownUi.tests,
    mocks: t.git.breakdownUi.mocks,
    generated: t.git.breakdownUi.generated,
    docs: t.git.breakdownUi.docs,
  }) satisfies Record<keyof NonNullable<PullRequestChangeBreakdown>, string>;

type DiffTotals = { additions: number; deletions: number };

/**
 * The pull request's diff stat, with a hover split into code, tests, mocks, and generated files.
 * In lists the split is read on first pointer or focus intent, so rows nobody hovers cost the
 * host nothing. A view of one pull request passes `eager` so the split is ready before the hover.
 */
export function PullRequestChangeBreakdownStat({
  environmentId,
  reference,
  additions,
  deletions,
  className,
  eager = false,
}: {
  environmentId: EnvironmentId;
  reference: PullRequestRef;
  additions: number;
  deletions: number;
  className: string;
  eager?: boolean;
}) {
  const [requested, setRequested] = useState(eager);
  const query = useEnvironmentQuery(
    requested ? pullRequestEnvironment.changeBreakdown({ environmentId, input: reference }) : null,
  );
  const breakdown = query.data;
  if (additions === 0 && deletions === 0) return null;
  return (
    <Tooltip>
      <TooltipTrigger
        onPointerEnter={() => setRequested(true)}
        onFocus={() => setRequested(true)}
        render={
          <span className="inline-flex">
            <PullRequestDiffStat
              additions={additions}
              deletions={deletions}
              className={className}
            />
          </span>
        }
      />
      {breakdown ? (
        <TooltipPopup side="bottom">
          <ChangeBreakdownGrid breakdown={breakdown} total={{ additions, deletions }} />
        </TooltipPopup>
      ) : query.isPending ? (
        <TooltipPopup side="bottom">{t.git.breakdownUi.loading}</TooltipPopup>
      ) : null}
    </Tooltip>
  );
}

function ChangeBreakdownGrid({
  breakdown,
  total,
}: {
  breakdown: NonNullable<PullRequestChangeBreakdown>;
  total?: DiffTotals;
}) {
  return (
    <div className="grid grid-cols-[auto_auto_auto] justify-start gap-x-4 gap-y-1 py-0.5 font-mono tabular-nums">
      {(Object.keys(kindLabels()) as Array<keyof ReturnType<typeof kindLabels>>).map((kind) => {
        const { additions, deletions } = breakdown[kind];
        return additions === 0 && deletions === 0 ? null : (
          <BreakdownRow
            key={kind}
            label={kindLabels()[kind]}
            additions={additions}
            deletions={deletions}
          />
        );
      })}
      {total ? (
        <>
          <div className="col-span-3 border-t border-border" />
          <BreakdownRow
            label={t.git.breakdownUi.total}
            additions={total.additions}
            deletions={total.deletions}
          />
        </>
      ) : null}
    </div>
  );
}

function BreakdownRow({ label, additions, deletions }: DiffTotals & { label: string }) {
  return (
    <>
      <span className="font-sans">{label}</span>
      <span className="text-right text-diff-addition-foreground">
        +{formatDiffCount(additions)}
      </span>
      <span className="text-right text-diff-deletion">-{formatDiffCount(deletions)}</span>
    </>
  );
}
