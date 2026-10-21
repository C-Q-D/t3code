/** Provider fader cards; quota grouping is pure and redemption stays on existing guarded commands. */
import {
  AuthProvidersManageScope,
  type EnvironmentId,
  type UsageProviderKind,
} from "@t3tools/contracts";
import {
  collectLimitAccounts,
  collectLimitPools,
  cursorUsageWindowDetails,
  type LimitPool,
  type LimitPoolWindow,
  type LimitAccount,
} from "@t3tools/shared/usageLimits";
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { activeLocale, t } from "~/i18n";
import { useEnvironmentScope } from "../../state/session";
import { usePrimarySettings } from "../../hooks/useSettings";
import { formatUpcomingTimestamp } from "../../timestampFormat";
import { ProviderInstanceIcon } from "../chat/ProviderInstanceIcon";
import { PixelIcon } from "../icons/PixelIcon";
import { providerClients } from "../settings/providerDriverMeta";
import { RedactedSensitiveText } from "../settings/RedactedSensitiveText";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { useLimitPresentations, useResetCredit, ResetCreditDialog } from "./UsageLimits";
import { AccountName, SegmentPopover } from "./UsageLimitsPooled";
import { UsageLimitFader, FaderPercentage } from "./UsageLimitFader";
import { limitFaderGroups, resetCreditAction } from "./usageLimitFaders.logic";
import { PROVIDER_PRESENTATION } from "./usageProviders";

/** Selected environments and visible providers filter limits; now advances on refresh only. */
export interface UsageLimitFadersProps {
  readonly selectedEnvironmentIds: ReadonlySet<EnvironmentId> | null;
  readonly hiddenProviders: ReadonlySet<UsageProviderKind>;
  readonly now: number;
}
/** Draw filtered quota pools. Notices and opt-in actions belong to the extras section. */
export function UsageLimitFaders({
  selectedEnvironmentIds,
  hiddenProviders,
  now,
}: UsageLimitFadersProps) {
  const presentations = useLimitPresentations(selectedEnvironmentIds, hiddenProviders);
  const cards = collectLimitPools(collectLimitAccounts(presentations), now)
    .map((pool) => ({ pool, groups: limitFaderGroups(pool) }))
    .filter((card) => card.groups.length > 0);
  if (cards.length === 0) {
    return <p className="text-sm text-muted-foreground">{t.tools.usage.noLimits}</p>;
  }
  return (
    <div className="usage-fader-cards">
      {Array.from({ length: Math.ceil(cards.length / 2) }, (_, row) => {
        const pair = cards.slice(row * 2, row * 2 + 2);
        return (
          <div
            className="usage-fader-card-row"
            key={pair[0]!.pool.driver}
            style={{
              gridTemplateColumns: pair
                .map(
                  ({ groups }) =>
                    `minmax(0, ${groups.reduce((sum, group) => sum + group.faders.length, 0)}fr)`,
                )
                .join(" "),
            }}
          >
            {pair.map(({ pool }) => (
              <ProviderFaderCard key={pool.driver} pool={pool} now={now} />
            ))}
          </div>
        );
      })}
    </div>
  );
}
/** Resolve provider-owned window labels, including Cursor's explanatory copy. */
function windowDetails(pool: LimitPool, window: LimitPoolWindow) {
  return pool.driver === "cursor"
    ? cursorUsageWindowDetails(window.id, t.chat.workLog.shared.usageLimits)
    : undefined;
}

/** Compact local reset date: time today, numeric month/day otherwise; no reset stays empty. */
function shortReset(at: number | undefined, now: number) {
  if (at === undefined) return "";
  const date = new Date(at);
  const today = date.toDateString() === new Date(now).toDateString();
  return new Intl.DateTimeFormat(
    activeLocale,
    today
      ? { hour: "2-digit", minute: "2-digit", hour12: false }
      : { month: "numeric", day: "numeric" },
  ).format(date);
}

/** One driver card owns selection; every account's redemption survives closing its popover. */
function ProviderFaderCard({ pool, now }: { readonly pool: LimitPool; readonly now: number }) {
  const groups = limitFaderGroups(pool);
  const [open, setOpen] = useState(false);
  const [selected, setSelection] = useState<{
    window: LimitPoolWindow;
    accountKey: string;
  } | null>(null);
  const selectedWindow =
    selected &&
    pool.windows.find(
      (window) => window.id === selected.window.id && window.kind === selected.window.kind,
    );
  const selection = selected && selectedWindow ? { ...selected, window: selectedWindow } : null;
  const [resetRequest, setResetRequest] = useState<{ key: string; sequence: number } | null>(null);
  const timestampFormat = usePrimarySettings((settings) => settings.timestampFormat);
  const creditAction = resetCreditAction(pool.accounts);
  const firstCredit = creditAction.kind === "hidden" ? undefined : creditAction.account;
  const canReset = useEnvironmentScope(
    firstCredit?.redeem?.environmentId ?? null,
    AuthProvidersManageScope,
  );
  const credits = creditAction.kind === "hidden" ? 0 : creditAction.count;
  const presentation = Object.values(PROVIDER_PRESENTATION).find(
    (entry) => entry.driverKind === pool.driver,
  );
  const label = presentation?.label ?? providerClients.get(pool.driver)?.label ?? pool.driver;
  const color =
    pool.driver === "codex"
      ? "var(--color-usage-fader-codex)"
      : pool.driver === "claudeAgent"
        ? "var(--color-usage-fader-claude)"
        : (presentation?.color ?? "var(--foreground)");
  const singleAccount = pool.accounts.length === 1 ? pool.accounts[0] : undefined;
  const selectCredit = () => {
    if (!firstCredit) return;
    const window = pool.windows.find((item) =>
      item.members.some((member) => member.account.key === firstCredit.key),
    );
    if (!window) return;
    setSelection({ window, accountKey: firstCredit.key });
    if (creditAction.kind === "confirm") {
      setOpen(false);
      setResetRequest((previous) => ({
        key: firstCredit.key,
        sequence: (previous?.sequence ?? 0) + 1,
      }));
    }
  };
  const accountPicker =
    selection && selection.window.members.length > 1 ? (
      <div className="usage-fader-account-picker">
        {selection.window.members.map(({ account }) => (
          <button
            type="button"
            key={account.key}
            className="usage-fader-name"
            aria-pressed={selection.accountKey === account.key}
            onClick={() => setSelection({ ...selection, accountKey: account.key })}
          >
            <AccountName account={account} />
          </button>
        ))}
      </div>
    ) : null;
  let index = 0;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <section className="usage-fader-card" style={{ "--fader-color": color } as CSSProperties}>
        <header className="usage-fader-header">
          {pool.driver === "codex" || pool.driver === "claudeAgent" ? (
            <PixelIcon name={pool.driver === "codex" ? "codex" : "claude"} size={20} />
          ) : (
            <ProviderInstanceIcon driverKind={pool.driver} displayName={label} className="size-5" />
          )}
          <h3>{label}</h3>
          {credits > 0 ? (
            creditAction.kind === "confirm" ? (
              <button
                type="button"
                className="usage-fader-credit"
                disabled={!canReset}
                onClick={selectCredit}
              >
                {t.tools.usage.faderResetCount(credits)}
              </button>
            ) : (
              <PopoverTrigger
                render={
                  <button type="button" className="usage-fader-credit" onClick={selectCredit} />
                }
              >
                {t.tools.usage.faderResetCount(credits)}
              </PopoverTrigger>
            )
          ) : null}
        </header>
        <div className="usage-fader-subtitle">
          {singleAccount?.email ? (
            <RedactedSensitiveText
              value={singleAccount.email}
              ariaLabel={t.tools.usage.toggleEmail}
              revealTooltip={t.tools.usage.revealEmail}
              hideTooltip={t.tools.usage.hideEmail}
            />
          ) : singleAccount ? (
            <AccountName account={singleAccount} />
          ) : groups.length === 1 && groups[0] ? (
            t.tools.usage.faderSharedAccounts(
              windowDetails(pool, groups[0].window)?.label ?? groups[0].window.label,
              pool.accounts.length,
            )
          ) : null}
        </div>
        <div className="usage-fader-groups">
          {groups.map((group) => {
            const details = windowDetails(pool, group.window);
            const windowLabel = details?.label ?? group.window.label;
            return (
              <div className="usage-fader-group" key={`${group.window.kind}:${group.window.id}`}>
                <div className="usage-fader-group-heading">
                  {group.showWindowTitle ? <span>{windowLabel}</span> : null}
                  {group.sharedRemaining !== null ? (
                    <>
                      <span>
                        <FaderPercentage value={group.sharedRemaining} shared />{" "}
                        {t.tools.usage.faderSharedRemaining}
                      </span>
                    </>
                  ) : null}
                </div>
                <div className="usage-fader-controls">
                  {group.faders.map((fader) => {
                    const account = fader.members[0]!.account;
                    const name =
                      fader.nameSource === "window" ? windowLabel : (account.displayName ?? label);
                    const reset = fader.reset?.at;
                    return (
                      <UsageLimitFader
                        key={fader.key}
                        usedPercent={fader.usedPercent}
                        remainingPercent={fader.remainingPercent}
                        index={index++}
                        resetLabel={shortReset(reset, now)}
                        label={t.tools.usage.faderSummary(
                          fader.nameSource === "account" ? `${name} · ${windowLabel}` : name,
                          fader.remainingPercent,
                          reset === undefined
                            ? ""
                            : formatUpcomingTimestamp(
                                new Date(reset).toISOString(),
                                timestampFormat,
                                now,
                              ),
                        )}
                      >
                        <PopoverTrigger
                          render={
                            <button
                              type="button"
                              className="usage-fader-name"
                              onClick={() =>
                                setSelection({ window: group.window, accountKey: account.key })
                              }
                            />
                          }
                        >
                          {fader.nameSource === "window" ? (
                            windowLabel
                          ) : (
                            <AccountName account={account} />
                          )}
                        </PopoverTrigger>
                      </UsageLimitFader>
                    );
                  })}
                </div>
                {details?.description ? (
                  <p className="usage-fader-description">{details.description}</p>
                ) : null}
              </div>
            );
          })}
        </div>
        {pool.accounts.map((account) => {
          const window = selection?.window.members.find(
            (member) => member.account.key === account.key,
          )?.window;
          const active = selection?.accountKey === account.key && window !== undefined;
          const reset = selection?.window.resets.find(
            (item) => item.member.account.key === account.key,
          );
          return account.redeem ? (
            <FaderAccountRedemption
              key={account.key}
              account={account}
              redeemAt={account.redeem}
              window={active ? window : undefined}
              reset={reset}
              now={now}
              accountPicker={accountPicker}
              confirmRequest={resetRequest?.key === account.key ? resetRequest.sequence : 0}
              closePopover={() => setOpen(false)}
            />
          ) : active ? (
            <PopoverPopup key={account.key} side="top" sideOffset={6}>
              {accountPicker}
              <SegmentPopover
                account={account}
                window={window}
                reset={reset}
                now={now}
                redeem={null}
                onRedeem={() => {}}
              />
            </PopoverPopup>
          ) : null;
        })}
      </section>
    </Popover>
  );
}

/** Keep the guarded reset and confirmation outside floating content so closing it cannot cancel the action. */
function FaderAccountRedemption({
  account,
  redeemAt,
  window,
  reset,
  now,
  accountPicker,
  confirmRequest,
  closePopover,
}: {
  readonly account: LimitAccount;
  readonly redeemAt: NonNullable<LimitAccount["redeem"]>;
  readonly window: LimitPoolWindow["members"][number]["window"] | undefined;
  readonly reset: LimitPoolWindow["resets"][number] | undefined;
  readonly now: number;
  readonly accountPicker: ReactNode;
  readonly confirmRequest: number;
  readonly closePopover: () => void;
}) {
  const redeem = useResetCredit(redeemAt.environmentId, redeemAt.input);
  const { setConfirming } = redeem;
  useEffect(() => {
    if (confirmRequest > 0) setConfirming(true);
  }, [confirmRequest, setConfirming]);
  return (
    <>
      {window ? (
        <PopoverPopup side="top" sideOffset={6}>
          {accountPicker}
          <SegmentPopover
            account={account}
            window={window}
            reset={reset}
            now={now}
            redeem={redeem}
            onRedeem={() => {
              closePopover();
              setConfirming(true);
            }}
          />
        </PopoverPopup>
      ) : null}
      <ResetCreditDialog
        open={redeem.confirming}
        onOpenChange={setConfirming}
        onConfirm={() => void redeem.redeem()}
        disabled={redeem.busy || !redeem.canManageProviders}
      />
      <div role="status" className="usage-fader-status">
        {redeem.status ? (
          <>
            <AccountName account={account} /> {redeem.status}
          </>
        ) : null}
      </div>
    </>
  );
}
