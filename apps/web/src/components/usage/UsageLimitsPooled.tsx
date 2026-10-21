/** Account identity and quota details shared by the fader popovers; no quota-card rendering. */
import { t } from "~/i18n";
import {
  formatResetsIn,
  remainingPercent,
  type LimitAccount,
  type LimitPoolMember,
  type LimitPoolWindow,
} from "@t3tools/shared/usageLimits";
import type { ReactNode } from "react";
import { usePrimarySettings } from "../../hooks/useSettings";
import { cn } from "../../lib/utils";
import { formatUpcomingTimestamp } from "../../timestampFormat";
import { ProviderInstanceIcon } from "../chat/ProviderInstanceIcon";
import { providerClients } from "../settings/providerDriverMeta";
import { RedactedSensitiveText } from "../settings/RedactedSensitiveText";
import { Button } from "../ui/button";
import { resetCreditsSummary, type useResetCredit } from "./UsageLimits";
/** `someone@example.com` → `SE`: enough to tell accounts apart, too little to identify one. */
function accountInitials(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  return `${local[0] ?? ""}${domain[0] ?? ""}`.toUpperCase() || "?";
}

function accountHue(email: string): number {
  let hash = 0;
  for (let index = 0; index < email.length; index += 1) {
    hash = (hash * 31 + email.charCodeAt(index)) | 0;
  }
  return Math.abs(hash) % 360;
}

function AccountChip({ email }: { readonly email: string }) {
  const hue = accountHue(email);
  return (
    <span
      role="img"
      aria-label={t.tools.usage.accountInitials(accountInitials(email))}
      className="inline-flex size-4 shrink-0 items-center justify-center rounded-full text-3xs leading-none font-semibold"
      style={{ backgroundColor: `oklch(0.85 0.08 ${hue})`, color: `oklch(0.35 0.1 ${hue})` }}
    >
      {accountInitials(email)}
    </span>
  );
}

function AccountAvatar({
  account,
  className,
}: {
  readonly account: LimitAccount;
  readonly className?: string;
}) {
  if (account.redeem) {
    return (
      <ProviderInstanceIcon
        driverKind={account.driver}
        displayName={
          account.displayName ??
          providerClients.get(account.driver)?.label ??
          String(account.driver)
        }
        accentColor={account.accentColor}
        showBadge={Boolean(account.displayName)}
        indicatorBackground="var(--popover)"
        className={cn("size-5", className)}
        iconClassName="size-4 text-foreground/80"
      />
    );
  }
  return account.email ? <AccountChip email={account.email} /> : null;
}

/**
 * Who an account is, without printing the email: the instance name when there
 * is one, else a two-letter chip. The address itself is revealed on demand in
 * the segment's popover.
 */
export function AccountName({
  account,
  className,
}: {
  readonly account: LimitAccount;
  readonly className?: string;
}) {
  if (account.displayName) return <span className={className}>{account.displayName}</span>;
  if (account.email) {
    return (
      <span className={cn("inline-flex min-w-0 items-center", className)}>
        <AccountChip email={account.email} />
      </span>
    );
  }
  return (
    <span className={className}>
      {providerClients.get(account.driver)?.label ?? String(account.driver)}
    </span>
  );
}

function Row({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 text-foreground tabular-nums">{children}</span>
    </div>
  );
}

/**
 * Everything about one account in one window: plan, where it is signed in,
 * the email on request, reset time and share of the pool it restores, and the
 * reset-credit action. The caller owns selection and opens the confirmation outside the popup.
 */
export function SegmentPopover({
  account,
  window,
  reset,
  now,
  redeem,
  onRedeem,
}: {
  readonly account: LimitAccount;
  readonly window: LimitPoolMember["window"];
  readonly reset: LimitPoolWindow["resets"][number] | undefined;
  readonly now: number;
  readonly redeem: ReturnType<typeof useResetCredit> | null;
  readonly onRedeem: () => void;
}) {
  const timestampFormat = usePrimarySettings((settings) => settings.timestampFormat);
  const remaining = remainingPercent(window);
  const resetsIn = formatResetsIn(window, now, t.chat.workLog.shared.usageLimits, "relative");
  const where =
    account.environments.length > 0
      ? account.environments.map((environment) => environment.label).join(", ")
      : account.sourceLabel;
  const credits =
    redeem && account.limits.resetCredits?.availableCount ? account.limits.resetCredits : null;
  return (
    <div className="flex w-72 max-w-[calc(100vw-3rem)] flex-col gap-2.5 text-xs">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="flex items-center gap-2 text-sm font-medium text-foreground">
          <AccountAvatar account={account} />
          <span className="truncate">
            {account.displayName ?? providerClients.get(account.driver)?.label ?? account.driver}
          </span>
        </span>
        {account.email ? (
          <RedactedSensitiveText
            value={account.email}
            ariaLabel={t.tools.usage.toggleEmail}
            revealTooltip={t.tools.usage.revealEmail}
            hideTooltip={t.tools.usage.hideEmail}
            className="w-fit"
          />
        ) : null}
      </div>
      <div className="flex flex-col gap-1 border-t border-border/60 pt-2.5">
        {account.plan ? <Row label={t.tools.usage.plan}>{account.plan}</Row> : null}
        {where ? (
          <Row label={account.environments.length > 0 ? t.tools.usage.signedIn : t.tools.usage.via}>
            {where}
          </Row>
        ) : null}
      </div>
      <div className="flex flex-col gap-1 border-t border-border/60 pt-2.5">
        <Row label={t.tools.usage.left}>{remaining}%</Row>
        {window.resetsAt ? (
          <Row label={t.tools.usage.resets}>
            {formatUpcomingTimestamp(window.resetsAt, timestampFormat, now)}
            {resetsIn ? ` · ${resetsIn}` : ""}
          </Row>
        ) : null}
        {reset && reset.restoresPercent > 0 ? (
          <Row label={t.tools.usage.restores}>
            +{reset.restoresPercent}
            {t.tools.usage.ofPool}
          </Row>
        ) : null}
      </div>
      {credits && redeem ? (
        <div className="border-t border-border/60 pt-2.5 text-muted-foreground">
          <span className="flex items-center gap-3">
            <span className="tabular-nums">{resetCreditsSummary(credits, now, true)}</span>
            <Button
              size="xs"
              variant="outline"
              disabled={redeem.busy || !redeem.canManageProviders}
              className="ms-auto"
              onClick={onRedeem}
            >
              {redeem.busy ? t.tools.usage.using : t.tools.usage.redeemReset}
            </Button>
          </span>
        </div>
      ) : null}
    </div>
  );
}
