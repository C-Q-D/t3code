/** Coordinates a single custom snooze request and its date or duration editor. */
import { t } from "~/i18n";
import { useEffect, useId, useState } from "react";
import { create } from "zustand";
import {
  localSnoozeDate,
  localSnoozeTime,
  resolveCustomSnooze,
  type CustomSnoozeInput,
} from "@t3tools/client-runtime/state/thread-settled";
import { Button } from "./ui/button";
import { CalendarIcon } from "lucide-react";
import { Calendar } from "./ui/calendar";
import { weekStartsOn } from "../timestampFormat";
import { Popover, PopoverTrigger, PopoverPopup } from "./ui/popover";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Toggle, ToggleGroup } from "./ui/toggle-group";
import { NumberField, NumberFieldGroup, NumberFieldInput } from "./ui/number-field";
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogPanel,
  DialogFooter,
} from "./ui/dialog";

type SnoozeChoice = { readonly snoozedUntil: string };
type Request = { readonly resolve: (choice: SnoozeChoice | null) => void };
const useRequest = create<{ request: Request | null }>(() => ({ request: null }));

/** Replaces any pending request; resolves with a chosen timestamp or null on cancellation. */
export function requestCustomSnooze(): Promise<SnoozeChoice | null> {
  useRequest.getState().request?.resolve(null);
  return new Promise((resolve) => useRequest.setState({ request: { resolve } }));
}

/** Clears the current request before resolving it, preventing repeated responses. */
function finish(choice: SnoozeChoice | null) {
  const request = useRequest.getState().request;
  useRequest.setState({ request: null });
  request?.resolve(choice);
}

/** Mounts the pending snooze editor and cancels its request when the host unmounts. */
export function CustomSnoozeDialogHost() {
  const request = useRequest((state) => state.request);
  useEffect(() => () => finish(null), []);
  return request ? <CustomSnoozeDialog /> : null;
}

/** Edits the pending snooze request and resolves it with a future timestamp; closing resolves null. */
function CustomSnoozeDialog() {
  const id = useId();
  const [initial] = useState(() => new Date(Date.now() + 3_600_000));
  const [mode, setMode] = useState<CustomSnoozeInput["mode"]>("date");
  const [date, setDate] = useState(initial);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [time, setTime] = useState(localSnoozeTime(initial));
  const [amount, setAmount] = useState("2");
  const [unit, setUnit] = useState<"minutes" | "hours" | "days">("hours");
  const [error, setError] = useState<string | null>(null);
  const input: CustomSnoozeInput =
    mode === "date" ? { mode, date: localSnoozeDate(date), time } : { mode, amount, unit };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) finish(null);
      }}
    >
      <DialogPopup size="wide">
        <form
          className="flex min-h-0 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            const snoozedUntil = resolveCustomSnooze(input, new Date());
            if (!snoozedUntil) {
              setError(mode === "date" ? t.app.snooze.invalidDate : t.app.snooze.invalidDuration);
              return;
            }
            finish({ snoozedUntil });
          }}
        >
          <DialogHeader>
            <DialogTitle>{t.app.snooze.title}</DialogTitle>
            <DialogDescription className="sr-only">{t.app.snooze.description}</DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <div className="flex flex-col gap-3.5">
              <ToggleGroup
                aria-label={t.app.snooze.scheduleType}
                size="dialog"
                value={[mode]}
                onValueChange={(next) => {
                  const value = next[0];
                  if (value === "date" || value === "duration") setMode(value);
                  setError(null);
                }}
              >
                <Toggle value="date">{t.app.snooze.dateAndTime}</Toggle>
                <Toggle value="duration">{t.app.snooze.duration}</Toggle>
              </ToggleGroup>
              <div className="flex flex-col gap-3.5">
                {mode === "date" ? (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="flex min-w-0 flex-col gap-1.5">
                      <Label htmlFor={`${id}-date`}>{t.app.snooze.date}</Label>
                      <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                        <PopoverTrigger
                          render={
                            <Button
                              id={`${id}-date`}
                              variant="outline"
                              className="w-full justify-between"
                            />
                          }
                        >
                          {date.toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                          <CalendarIcon className="size-4 text-muted-foreground" />
                        </PopoverTrigger>
                        <PopoverPopup
                          align="start"
                          padding="calendar"
                          aria-label={t.app.snooze.chooseDate}
                        >
                          <Calendar
                            mode="single"
                            required
                            selected={date}
                            defaultMonth={date}
                            {...(weekStartsOn === undefined ? {} : { weekStartsOn })}
                            disabled={{ before: new Date(new Date().setHours(0, 0, 0, 0)) }}
                            onSelect={(selected) => {
                              setDate(selected);
                              setCalendarOpen(false);
                              setError(null);
                            }}
                          />
                        </PopoverPopup>
                      </Popover>
                    </div>
                    <Label className="flex min-w-0 flex-col items-stretch" htmlFor={`${id}-time`}>
                      {t.app.snooze.time}
                      <Input
                        nativeInput
                        id={`${id}-time`}
                        className="h-9 sm:h-8"
                        type="time"
                        required
                        value={time}
                        onChange={(event) => {
                          setTime(event.target.value);
                          setError(null);
                        }}
                      />
                    </Label>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="w-29.5">
                      <NumberField
                        id={`${id}-amount`}
                        min={0}
                        step="any"
                        value={amount === "" ? null : Number(amount)}
                        onValueChange={(value) => {
                          setAmount(value === null ? "" : String(value));
                          setError(null);
                        }}
                      >
                        <NumberFieldGroup variant="dialog">
                          <NumberFieldInput
                            aria-label={t.app.snooze.snoozeFor}
                            variant="dialog"
                            required
                          />
                        </NumberFieldGroup>
                      </NumberField>
                    </div>
                    <ToggleGroup
                      size="duration"
                      aria-label={t.app.snooze.unit}
                      value={[unit]}
                      onValueChange={(next) => {
                        const value = next[0];
                        if (value === "minutes" || value === "hours" || value === "days")
                          setUnit(value);
                        setError(null);
                      }}
                    >
                      <Toggle value="minutes">{t.app.snooze.minutes}</Toggle>
                      <Toggle value="hours">{t.app.snooze.hours}</Toggle>
                      <Toggle value="days">{t.app.snooze.days}</Toggle>
                    </ToggleGroup>
                  </div>
                )}
              </div>
            </div>
            {error && (
              <p role="alert" className="text-destructive">
                {error}
              </p>
            )}
          </DialogPanel>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="dialog-action"
              onClick={() => finish(null)}
            >
              {t.common.confirm.cancel}
            </Button>
            <Button type="submit" size="dialog-action-wide">
              {t.common.confirm.confirm}
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
