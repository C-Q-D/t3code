/** Owns the General settings inactivity-day stepper, preserving draft validation and scoped commits. */
import { useState } from "react";
import { MinusIcon, PlusIcon } from "lucide-react";
import {
  MAX_SIDEBAR_AUTO_SETTLE_AFTER_DAYS,
  MIN_SIDEBAR_AUTO_SETTLE_AFTER_DAYS,
} from "@t3tools/contracts/settings";

import { t } from "~/i18n";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { stepAutoSettleDays } from "./AutoSettleDaysInput.logic";

/**
 * Edits inactivity days; invalid drafts revert on blur and steppers commit immediately.
 * @param props.value Persisted whole days within the contract's minimum and maximum.
 * @param props.onCommit Requests a scoped write of a valid day count; the caller handles persistence errors.
 * @returns The M2 stepper with the existing draft validation and boundary-disabled buttons.
 */
export function AutoSettleDaysInput({
  value,
  onCommit,
}: {
  value: number;
  onCommit: (days: number) => void;
}) {
  // Local draft so the field can be emptied mid-edit; the setting only moves
  // on valid input and snaps back to the persisted value on blur.
  const [draft, setDraft] = useState(String(value));
  const [savedValue, setSavedValue] = useState(value);
  if (savedValue !== value) {
    setSavedValue(value);
    setDraft(String(value));
  }
  const decreased = stepAutoSettleDays(value, -1);
  const increased = stepAutoSettleDays(value, 1);

  return (
    <div className="flex h-8 items-center rounded-card-row bg-input p-0.75 shadow-well-track">
      <Button
        size="icon-stepper"
        variant="secondary"
        aria-label={t.settings.rows.daysBeforeAutoSettle.decreaseAriaLabel}
        disabled={decreased === null}
        onClick={() => {
          if (decreased !== null) onCommit(decreased);
        }}
      >
        <MinusIcon aria-hidden />
      </Button>
      <div className="w-11 min-w-0 rounded-keycap focus-within:inset-shadow-focus">
        <Input
          unstyled
          size="stepper"
          font="mono"
          type="number"
          min={MIN_SIDEBAR_AUTO_SETTLE_AFTER_DAYS}
          max={MAX_SIDEBAR_AUTO_SETTLE_AFTER_DAYS}
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            // Number(), not parseInt: "3.5" must be rejected (not truncated to a
            // committed 3 while the field shows 3.5) — commit only when the
            // persisted value matches the displayed one.
            const parsed = Number(event.target.value);
            if (
              Number.isInteger(parsed) &&
              parsed >= MIN_SIDEBAR_AUTO_SETTLE_AFTER_DAYS &&
              parsed <= MAX_SIDEBAR_AUTO_SETTLE_AFTER_DAYS
            ) {
              onCommit(parsed);
            }
          }}
          onBlur={() => setDraft(String(value))}
          aria-label={t.settings.rows.daysBeforeAutoSettle.title}
        />
      </div>
      <Button
        size="icon-stepper"
        variant="secondary"
        aria-label={t.settings.rows.daysBeforeAutoSettle.increaseAriaLabel}
        disabled={increased === null}
        onClick={() => {
          if (increased !== null) onCommit(increased);
        }}
      >
        <PlusIcon aria-hidden />
      </Button>
    </div>
  );
}
