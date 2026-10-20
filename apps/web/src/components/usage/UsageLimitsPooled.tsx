/** Localized usage presentation and existing interaction behavior. */
import { t } from "~/i18n";
import {
  CHATGPT_USAGE_URL,
  collectLimitAccounts,
  collectExternalUsageLinks,
  collectLimitNotices,
  collectLimitPools,
  cursorUsageWindowDetails,
  displayLimitWindows,
  formatResetsIn,
  type LimitAccount,
  type LimitPool,
  type LimitPoolMember,
  type LimitPoolWindow,
  remainingPercent,
} from "@t3tools/shared/usageLimits";
import { PixelIcon } from "../icons/PixelIcon";
import { Badge } from "../ui/badge";
import { quotaBarLayout } from "./usageOverview.logic";
import { AlertTriangleIcon, ExternalLinkIcon, TicketIcon } from "lucide-react";
import { Fragment, type ReactNode, useState } from "react";

import { ensureLocalApi } from "../../localApi";
import { usePrimarySettings } from "../../hooks/useSettings";
import { cn } from "../../lib/utils";
import { formatUpcomingTimestamp } from "../../timestampFormat";
import { ProviderInstanceIcon } from "../chat/ProviderInstanceIcon";
import { providerClients } from "../settings/providerDriverMeta";
import { RedactedSensitiveText } from "../settings/RedactedSensitiveText";
import { Button } from "../ui/button";
import { OpenAI } from "../Icons";
import { Alert, AlertTitle } from "../ui/alert";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import {
  ResetCredits,
  ResetCreditDialog,
  barColor,
  resetCreditsSummary,
  useResetCredit,
} from "./UsageLimits";

/** `someone@example.com` → `SE`: enough to tell accounts apart, too little to identify one. */
function accountInitials(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  return `${local[0] ?? ""}${domain[0] ?? ""}`.toUpperCase() || "?";
}

/** A stable hue per email, so the same account gets the same chip on every visit. */
function accountHue(email: string): number {
  let hash = 0;
  for (let index = 0; index < email.length; index += 1) {
    hash = (hash * 31 + email.charCodeAt(index)) | 0;
  }
  return Math.abs(hash) % 360;
}

/** The two-letter chip for an email, coloured by a stable hue per address. */
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

/**
 * The same mark the model picker uses for a native instance (provider glyph,
 * initials badge, accent); hub accounts have no instance, so they get the chip.
 */
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
 * reset-credit action. Opens on hover for a glance, on click to act.
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
  /** Redeem state owned by the segment, since the confirm lives outside this popover. */
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

/**
 * One account's share of one pooled window: the segment, its popover, and the
 * reset confirm. The confirm is a sibling of the popover, not a child: dialogs
 * stack under popovers, and the popover closes as the confirm opens.
 */
function PoolSegment({
  account,
  window,
  reset,
  color,
  now,
  index,
  showAccountName,
}: {
  readonly account: LimitAccount;
  readonly window: LimitPoolMember["window"];
  readonly reset: LimitPoolWindow["resets"][number] | undefined;
  readonly color: string;
  readonly now: number;
  /** 1-based position in the bar, shown on the strip and its legend row to tie them together. */
  readonly index: number;
  readonly showAccountName: boolean;
}) {
  const [open, setOpen] = useState(false);
  const remaining = remainingPercent(window);
  const layout = quotaBarLayout(window, now);
  const credits = account.limits.resetCredits?.availableCount ?? 0;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        openOnHover
        render={
          <button
            type="button"
            style={{ gridColumn: index, gridRow: 1 }}
            aria-label={t.tools.usage.pooledSummary(
              account.displayName ??
                (account.email ? accountInitials(account.email) : account.driver),
              remaining,
              formatResetsIn(window, now, t.chat.workLog.shared.usageLimits),
              credits,
            )}
            className="relative h-2 min-w-0 cursor-pointer rounded-full text-start outline-none focus-visible:inset-shadow-focus"
          />
        }
      >
        <span
          aria-hidden
          className="absolute inset-0 rounded-full bg-input shadow-usage-limit-track"
        />
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${layout.fillPercent}%`, backgroundColor: color }}
        />
        {layout.referencePercent !== null ? (
          <span
            aria-hidden
            className="absolute -inset-y-1 w-0.5 -translate-x-1/2 rounded-usage-limit-marker bg-foreground"
            style={{ left: `${layout.referencePercent}%` }}
          />
        ) : null}
      </PopoverTrigger>
      {showAccountName ? (
        <LegendRow account={account} window={window} color={color} now={now} index={index} />
      ) : null}
      {account.redeem ? (
        <RedeemableSegmentPopup
          account={account}
          window={window}
          reset={reset}
          now={now}
          redeemAt={account.redeem}
          closePopover={() => setOpen(false)}
        />
      ) : (
        <PopoverPopup side="top" sideOffset={6}>
          <SegmentPopover
            account={account}
            window={window}
            reset={reset}
            now={now}
            redeem={null}
            onRedeem={() => {}}
          />
        </PopoverPopup>
      )}
    </Popover>
  );
}

/**
 * Below a multi-account strip: one row per account in bar order, carrying
 * the text the segment has no room for. Tapping a row opens the same popover
 * as its segment, so the two are one control with two handles.
 */
function LegendRow({
  account,
  window,
  color,
  now,
  index,
}: {
  readonly account: LimitAccount;
  readonly window: LimitPoolMember["window"];
  readonly color: string;
  readonly now: number;
  readonly index: number;
}) {
  const remaining = remainingPercent(window);
  const resetsIn = formatResetsIn(window, now, t.chat.workLog.shared.usageLimits, "compact");
  const credits = account.limits.resetCredits?.availableCount ?? 0;
  return (
    <PopoverTrigger
      style={{ gridColumn: "1 / -1", gridRow: index + 1 }}
      render={<Button variant="ghost" size="compact" />}
      className="min-w-0"
    >
      <span className="relative inline-flex size-4 shrink-0 items-center justify-center rounded-sm text-3xs leading-none font-semibold text-foreground/80 tabular-nums">
        <span
          aria-hidden
          className="absolute inset-0 rounded-sm opacity-35"
          style={{ backgroundColor: color }}
        />
        <span className="sr-only">{t.tools.usage.segment}</span>
        <span className="relative">{index}</span>
      </span>
      <AccountName account={account} className="min-w-0 truncate font-medium text-foreground" />
      <span className="shrink-0 font-semibold text-foreground tabular-nums">{remaining}%</span>
      <span className="ms-auto flex shrink-0 items-center gap-1.5 text-2xs text-muted-foreground tabular-nums">
        {resetsIn ?? ""}
        {credits ? (
          <>
            {resetsIn ? <span aria-hidden>·</span> : null}
            <span
              aria-hidden
              className="inline-flex items-center gap-0.5 font-semibold text-foreground"
            >
              <TicketIcon className="size-3" aria-hidden />
              {credits}
            </span>
            <span className="sr-only">{t.tools.usage.bankedCredits(credits)}</span>
          </>
        ) : null}
      </span>
    </PopoverTrigger>
  );
}

/** Split out so the redeem hook only runs for accounts that can redeem. */
function RedeemableSegmentPopup({
  account,
  window,
  reset,
  now,
  redeemAt,
  closePopover,
}: {
  readonly account: LimitAccount;
  readonly window: LimitPoolMember["window"];
  readonly reset: LimitPoolWindow["resets"][number] | undefined;
  readonly now: number;
  readonly redeemAt: NonNullable<LimitAccount["redeem"]>;
  readonly closePopover: () => void;
}) {
  const redeem = useResetCredit(redeemAt.environmentId, redeemAt.input);
  return (
    <>
      <PopoverPopup side="top" sideOffset={6}>
        <SegmentPopover
          account={account}
          window={window}
          reset={reset}
          now={now}
          redeem={redeem}
          onRedeem={() => {
            closePopover();
            redeem.setConfirming(true);
          }}
        />
      </PopoverPopup>
      <ResetCreditDialog
        open={redeem.confirming}
        onOpenChange={redeem.setConfirming}
        onConfirm={() => void redeem.redeem()}
        disabled={!redeem.canManageProviders}
      />
      {/* The popover closed before the confirm, so the outcome needs a home outside it. */}
      {redeem.status ? (
        <span role="status" className="col-span-full text-xs text-muted-foreground">
          <AccountName account={account} className="font-medium text-foreground" /> {redeem.status}
        </span>
      ) : null}
    </>
  );
}

/**
 * One pooled window as equal-width segments, one per account, each filled by
 * the consumed share of that account's quota. Equal widths are honest: every
 * account contributes the same share of the pool, whatever its plan.
 *
 * A multi-account bar has a legend in the same order; both handles open the
 * same popover, leaving the slim strip available for M1's time reference.
 */
function PoolBar({
  pool,
  color,
  now,
}: {
  readonly pool: LimitPoolWindow;
  readonly color: string;
  readonly now: number;
}) {
  const restores = new Map(pool.resets.map((reset) => [reset.member.account.key, reset]));
  return (
    <div className="@container/pool min-w-0">
      <div
        className="grid gap-x-1 gap-y-1"
        style={{ gridTemplateColumns: `repeat(${pool.columns.length}, minmax(0, 1fr))` }}
      >
        {pool.columns.map((member, position) =>
          member.window ? (
            <PoolSegment
              key={member.account.key}
              account={member.account}
              window={member.window}
              reset={restores.get(member.account.key)}
              color={color}
              now={now}
              index={position + 1}
              showAccountName={pool.columns.length > 1}
            />
          ) : null,
        )}
      </div>
    </div>
  );
}

/** M1 raised card for one real pooled window; account/reset details retain the existing popovers and guarded commands. */
function PoolWindowCard({
  pool,
  driver,
  now,
  providerLabel,
  label,
  description,
}: {
  readonly pool: LimitPoolWindow;
  readonly driver: LimitPool["driver"];
  readonly now: number;
  readonly providerLabel: string;
  readonly label?: string;
  readonly description?: string;
}) {
  const timestampFormat = usePrimarySettings((settings) => settings.timestampFormat);
  const singleAccount = pool.members.length === 1 ? pool.members[0]?.account : undefined;
  const nextReset = pool.resets[0];
  const color =
    pool.pace === "ahead"
      ? "var(--color-usage-limit-ahead)"
      : pool.pace === "under"
        ? "var(--color-success)"
        : barColor(driver);
  const paceLabel =
    pool.pace === "ahead"
      ? t.tools.usage.paceAhead
      : pool.pace === "under"
        ? t.tools.usage.paceUnder
        : t.tools.usage.paceOn;
  return (
    <section className="flex min-w-0 flex-col gap-2.5 rounded-card-surface bg-surface-raised px-4 py-3.5 shadow-usage-limit">
      <div className="flex min-w-0 items-center gap-2">
        {driver === "claudeAgent" || driver === "codex" ? (
          <PixelIcon name={driver === "codex" ? "codex" : "claude"} size={20} />
        ) : (
          <ProviderInstanceIcon
            driverKind={driver}
            displayName={providerLabel}
            className="size-5"
          />
        )}
        <h3 className="text-secondary-copy-large font-bold">{providerLabel}</h3>
        {label ? (
          <span className="truncate text-secondary-copy text-muted-foreground">{label}</span>
        ) : null}
        {singleAccount?.email ? (
          <div className="min-w-0 truncate font-mono text-secondary-copy text-muted-foreground">
            <RedactedSensitiveText
              value={singleAccount.email}
              ariaLabel={t.tools.usage.toggleEmail}
              revealTooltip={t.tools.usage.revealEmail}
              hideTooltip={t.tools.usage.hideEmail}
            />
          </div>
        ) : null}
        <span
          className="ml-auto shrink-0 font-mono text-usage-limit-number tabular-nums"
          aria-label={`${pool.remainingPercent}${t.tools.usage.percentLeft}`}
        >
          {pool.remainingPercent}%
        </span>
      </div>
      <PoolBar pool={pool} color={color} now={now} />
      <div className="flex flex-wrap items-center gap-2 text-secondary-copy text-secondary-label">
        {pool.pace ? (
          <Badge
            variant={
              pool.pace === "ahead" ? "restricted" : pool.pace === "under" ? "success" : "neutral"
            }
          >
            {paceLabel}
          </Badge>
        ) : null}
        {nextReset ? (
          <span>
            {t.tools.usage.resetTimePrefix}
            {formatUpcomingTimestamp(new Date(nextReset.at).toISOString(), timestampFormat, now)}
          </span>
        ) : null}
        <span className="sr-only">
          {pool.members
            .map((member) => formatResetsIn(member.window, now, t.chat.workLog.shared.usageLimits))
            .filter(Boolean)
            .join(", ")}
        </span>
        {singleAccount?.redeem && singleAccount.limits.resetCredits ? (
          <div className="ml-auto">
            <ResetCredits
              environmentId={singleAccount.redeem.environmentId}
              input={singleAccount.redeem.input}
              credits={singleAccount.limits.resetCredits}
              now={now}
            />
          </div>
        ) : null}
      </div>
      {description ? (
        <p className="text-secondary-copy text-muted-foreground">{description}</p>
      ) : null}
    </section>
  );
}

/** Displays every actual provider window as an M1 card; additional providers and windows are never dropped. */
function PoolSection({ pool, now }: { readonly pool: LimitPool; readonly now: number }) {
  const providerLabel =
    pool.driver === "claudeAgent"
      ? "Claude"
      : (providerClients.get(pool.driver)?.label ?? String(pool.driver));
  const windows = displayLimitWindows(pool);
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {windows.map((window) => {
        const details =
          pool.driver === "cursor"
            ? cursorUsageWindowDetails(window.id, t.chat.workLog.shared.usageLimits)
            : undefined;
        return (
          <PoolWindowCard
            key={`${window.kind}:${window.id}`}
            pool={window}
            driver={pool.driver}
            now={now}
            providerLabel={providerLabel}
            {...(windows.length > 1 ? { label: details?.label ?? window.label } : {})}
            {...(details ? { description: details.description } : {})}
          />
        );
      })}
    </div>
  );
}

/**
 * Accounts pooled per provider: what is open across all of them, who resets
 * next, and how much of the pool that hands back. Answers "can I keep going"
 * before "on which account".
 */
export function UsageLimitsPooled({
  presentations,
  now,
  cursorPrompt,
}: {
  readonly presentations: Parameters<typeof collectLimitAccounts>[0];
  readonly now: number;
  readonly cursorPrompt?: ReactNode;
}) {
  const pools = collectLimitPools(collectLimitAccounts(presentations), now);
  const notices = collectLimitNotices(presentations, t.chat.workLog.shared.usageLimits);
  const externalLinks = collectExternalUsageLinks(presentations);
  const cursorPromptAt =
    Math.max(
      pools.findIndex((pool) => pool.driver === "codex"),
      pools.findIndex((pool) => pool.driver === "claudeAgent"),
    ) + 1;
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {pools.length === 0 && notices.length === 0 && !cursorPrompt && externalLinks.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t.tools.usage.noLimits}</p>
      ) : null}
      {pools.map((pool, index) => (
        <Fragment key={pool.driver}>
          {index === cursorPromptAt ? cursorPrompt : null}
          <PoolSection pool={pool} now={now} />
        </Fragment>
      ))}
      {cursorPromptAt === pools.length ? cursorPrompt : null}
      {externalLinks.map((link) => (
        <section
          key={link.url}
          className="flex flex-wrap items-center justify-between gap-3 rounded-card-surface bg-surface-raised px-4 py-3.5 shadow-usage-limit"
        >
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {link.url === CHATGPT_USAGE_URL ? (
              <OpenAI className="size-5 shrink-0" aria-hidden="true" />
            ) : null}
            <div className="min-w-0 space-y-1">
              <h2 className="text-sm font-medium">{link.label}</h2>
              {link.url === CHATGPT_USAGE_URL ? (
                <p className="text-xs text-muted-foreground">{t.tools.usage.chatgptUsageHint}</p>
              ) : link.message ? (
                <p className="max-w-xl text-xs text-muted-foreground">{link.message}</p>
              ) : null}
            </div>
          </div>
          <Button
            variant="ghost-muted"
            size="xs"
            onClick={() => void ensureLocalApi().shell.openExternal(link.url)}
          >
            {t.tools.usage.manageUsage}
            <ExternalLinkIcon className="size-3.5" aria-hidden="true" />
          </Button>
        </section>
      ))}
      {pools.length > 0 ? (
        <p className="text-secondary-copy leading-usage-limit-note text-muted-foreground text-shadow-none">
          {t.tools.usage.paceReferenceHint}
        </p>
      ) : null}
      <LimitNotices notices={notices} />
    </div>
  );
}

/** Sources and providers that could not be read, so a missing bar is not mistaken for a full one. */
function LimitNotices({ notices }: { readonly notices: readonly string[] }) {
  if (notices.length === 0) return null;
  return (
    <Alert variant="warning" controlAlignment="first-line">
      <AlertTriangleIcon />
      {notices.map((notice) => (
        <AlertTitle key={notice} className="break-words">
          {notice}
        </AlertTitle>
      ))}
    </Alert>
  );
}
