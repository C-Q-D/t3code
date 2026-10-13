/** Controlled discussion seat editor; reads environment catalogs but never creates provider sessions. */
import { useAtomValue } from "@effect/atom-react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { EnvironmentId } from "@t3tools/contracts";
import { CheckIcon, GripVerticalIcon, PlusIcon, XIcon } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { t } from "~/i18n";
import { useEnvironmentSettings } from "~/hooks/useSettings";
import { getCustomModelOptionsByInstance } from "~/modelSelection";
import {
  applyProviderInstanceSettings,
  deriveProviderInstanceEntries,
  sortProviderInstanceEntries,
  resolveDefaultProviderModelSelection,
  isProviderInstancePickerReady,
} from "~/providerInstances";
import { useEnvironmentQuery } from "~/state/query";
import { EMPTY_SERVER_PROVIDERS, serverEnvironment } from "~/state/server";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { Select, SelectTrigger, SelectValue, SelectPopup, SelectItem } from "../ui/select";
import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";
import { PixelAvatar } from "./PixelAvatar";
import { getTriggerDisplayModelName } from "../chat/providerIconUtils";
import {
  addDiscussionSeat,
  removeDiscussionSeat,
  moveDiscussionSeat,
  changeDiscussionSeatPersona,
  changeDiscussionSeatModel,
  canSelectDiscussionModel,
  type DiscussionDraftSeat,
} from "./discussionSeats.logic";

/**
 * Edits template-shaped seats and emits their complete speaking order.
 * @param props.environmentId Catalog and capability destination; remount when it changes.
 * @param props.seats Caller-owned seat array; duplicates are allowed.
 * @param props.onChange Replaces the caller's array after a local edit; no RPC mutation occurs.
 * @param props.headerAction Optional template selector, omitted by template dialogs.
 * @returns Sortable cards and accessible persona/model popovers; loading or missing defaults disable adding.
 */
export function DiscussionSeats({
  environmentId,
  seats,
  onChange,
  headerAction,
}: {
  readonly environmentId: EnvironmentId;
  readonly seats: readonly DiscussionDraftSeat[];
  readonly onChange: (seats: readonly DiscussionDraftSeat[]) => void;
  readonly headerAction?: ReactNode;
}) {
  const prefix = useId();
  const [identity, setIdentity] = useState({
    seats,
    ids: seats.map((_, index) => `${prefix}:0:${index}`),
    revision: 1,
  });
  // Template seats have no durable seat id. Local edits retain identities; a caller's
  // replacement (such as loading another template) starts a fresh set of editors.
  if (identity.seats !== seats) {
    setIdentity({
      seats,
      ids: seats.map((_, index) => `${prefix}:${identity.revision}:${index}`),
      revision: identity.revision + 1,
    });
  }
  const [openId, setOpenId] = useState<string | null>(null);
  const providers =
    useAtomValue(serverEnvironment.providersValueAtom(environmentId)) ?? EMPTY_SERVER_PROVIDERS;
  const settings = useEnvironmentSettings(environmentId);
  const prompts = useEnvironmentQuery(
    serverEnvironment.discussionPromptsLive({ environmentId, input: { kind: "persona" } }),
  );
  const support = useEnvironmentQuery(
    serverEnvironment.discussionProviderSupport({ environmentId, input: {} }),
  );
  const personas = prompts.data?.prompts.filter((prompt) => prompt.kind === "persona") ?? [];
  const entries = sortProviderInstanceEntries(
    applyProviderInstanceSettings(deriveProviderInstanceEntries(providers), settings),
  );
  const defaultModel = resolveDefaultProviderModelSelection(
    providers,
    settings.defaultModelSelection,
  );
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const replace = (next: readonly DiscussionDraftSeat[], ids = identity.ids) => {
    setIdentity({ seats: next, ids, revision: identity.revision + 1 });
    onChange(next);
  };

  return (
    <section aria-labelledby={`${prefix}-heading`} className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-3">
        <h2 id={`${prefix}-heading`} className="text-sm font-medium">
          {t.discussions.seatsHeading}
        </h2>
        {headerAction}
      </div>
      {prompts.error || support.error ? (
        <p role="alert" className="text-xs text-destructive">
          {prompts.error ?? support.error}
        </p>
      ) : null}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={() => setOpenId(null)}
        onDragEnd={({ active, over }) => {
          if (!over || active.id === over.id) return;
          const from = identity.ids.indexOf(String(active.id));
          const to = identity.ids.indexOf(String(over.id));
          const next = moveDiscussionSeat(seats, from, to);
          const ids = [...identity.ids];
          const [id] = ids.splice(from, 1);
          if (id && from >= 0 && to >= 0) {
            ids.splice(to, 0, id);
            replace(next, ids);
          }
        }}
      >
        <SortableContext items={identity.ids} strategy={rectSortingStrategy}>
          <div className="flex flex-wrap gap-2">
            {seats.map((seat, index) => {
              const id = identity.ids[index] ?? `${prefix}:${identity.revision}:${index}`;
              const persona = personas.find((prompt) => prompt.id === seat.personaPromptId);
              const entry = entries.find(
                (instance) => instance.instanceId === seat.modelSelection.instanceId,
              );
              const options = getCustomModelOptionsByInstance(
                settings,
                providers,
                seat.modelSelection.instanceId,
                seat.modelSelection.model,
              );
              const model = options
                .get(seat.modelSelection.instanceId)
                ?.find((option) => option.slug === seat.modelSelection.model);
              return (
                <DiscussionSeatCard
                  key={id}
                  id={id}
                  open={openId === id}
                  onOpenChange={(open) => setOpenId(open ? id : null)}
                  index={index}
                  name={persona?.name ?? t.settings.discussions.deletedPersona}
                  modelLabel={`${entry?.displayName ?? seat.modelSelection.instanceId} · ${model ? getTriggerDisplayModelName({ ...model, subProvider: entry?.driverKind === "claudeAgent" ? "Claude" : model.subProvider }) : seat.modelSelection.model}`}
                  avatar={persona?.avatar ?? "architect"}
                  onRemove={() => {
                    setOpenId(null);
                    replace(
                      removeDiscussionSeat(seats, index),
                      identity.ids.filter((_, position) => position !== index),
                    );
                  }}
                >
                  <div className="flex w-69.5 max-w-[calc(100vw-2rem)] flex-col gap-3.5 p-3">
                    <div className="flex flex-col gap-1.5">
                      <label
                        id={`${id}-persona-label`}
                        className="text-xs font-medium text-muted-foreground"
                      >
                        {t.discussions.persona}
                      </label>
                      <Select
                        items={personas.map((prompt) => ({ value: prompt.id, label: prompt.name }))}
                        value={seat.personaPromptId}
                        onValueChange={(value) => {
                          const selected = personas.find((prompt) => prompt.id === value);
                          if (selected)
                            replace(changeDiscussionSeatPersona(seats, index, selected.id));
                        }}
                      >
                        <SelectTrigger size="lg" aria-labelledby={`${id}-persona-label`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectPopup>
                          {personas.map((prompt) => (
                            <SelectItem key={prompt.id} value={prompt.id}>
                              {prompt.name}
                            </SelectItem>
                          ))}
                        </SelectPopup>
                      </Select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <span
                        id={`${id}-models-label`}
                        className="text-xs font-medium text-muted-foreground"
                      >
                        {t.discussions.model}
                      </span>
                      <div
                        role="group"
                        aria-labelledby={`${id}-models-label`}
                        className="flex max-h-52 flex-col gap-0.5 overflow-y-auto"
                      >
                        {entries.map((instance) => {
                          const supported =
                            support.data?.instances.find(
                              (item) => item.instanceId === instance.instanceId,
                            )?.supported === true;
                          const models = options.get(instance.instanceId) ?? [];
                          if (!supported)
                            return (
                              <button
                                key={instance.instanceId}
                                type="button"
                                disabled
                                className="flex min-h-8 items-center gap-2 rounded-lg px-2 text-left text-sm text-muted-foreground disabled:cursor-not-allowed"
                              >
                                <span className="min-w-0 flex-1 truncate">
                                  {instance.displayName}
                                </span>
                                <span className="shrink-0 text-xs">
                                  {support.data
                                    ? t.discussions.unsupported
                                    : t.discussions.loadingModels}
                                </span>
                              </button>
                            );
                          return (
                            <div
                              key={instance.instanceId}
                              role="group"
                              aria-label={instance.displayName}
                            >
                              {models.length === 0 ? (
                                <p className="px-2 py-1.5 text-xs text-muted-foreground">
                                  {instance.displayName} · {t.discussions.noModels}
                                </p>
                              ) : (
                                models.map((option) => {
                                  const selectable = canSelectDiscussionModel(
                                    instance.instanceId,
                                    support.data,
                                    isProviderInstancePickerReady(instance) &&
                                      !option.isUnavailable,
                                  );
                                  const selected =
                                    seat.modelSelection.instanceId === instance.instanceId &&
                                    seat.modelSelection.model === option.slug;
                                  return (
                                    <button
                                      key={option.slug}
                                      type="button"
                                      disabled={!selectable}
                                      aria-pressed={selected}
                                      className="flex min-h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring aria-pressed:bg-accent disabled:cursor-not-allowed disabled:text-muted-foreground"
                                      onClick={() => {
                                        if (selectable && !selected)
                                          replace(
                                            changeDiscussionSeatModel(seats, index, {
                                              instanceId: instance.instanceId,
                                              model: option.slug,
                                            }),
                                          );
                                      }}
                                    >
                                      <span className="min-w-0 flex-1 truncate">
                                        {instance.displayName} ·{" "}
                                        {getTriggerDisplayModelName({
                                          ...option,
                                          subProvider:
                                            instance.driverKind === "claudeAgent"
                                              ? "Claude"
                                              : option.subProvider,
                                        })}
                                      </span>
                                      {selected ? <CheckIcon className="size-4 shrink-0" /> : null}
                                    </button>
                                  );
                                })
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </DiscussionSeatCard>
              );
            })}
            <button
              type="button"
              disabled={!personas[0] || !defaultModel || !!prompts.error || !!support.error}
              className="flex h-13.5 items-center gap-1.5 rounded-lg border border-dashed border-foreground/22 px-3.5 text-sm text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-64"
              onClick={() => {
                const persona = personas[0];
                if (!persona || !defaultModel) return;
                const id = `${prefix}:${identity.revision}:new`;
                replace(
                  addDiscussionSeat(seats, {
                    personaPromptId: persona.id,
                    modelSelection: defaultModel,
                  }),
                  [...identity.ids, id],
                );
                setOpenId(id);
              }}
            >
              <PlusIcon className="size-4" />
              {t.discussions.addSeat}
            </button>
          </div>
        </SortableContext>
      </DndContext>
    </section>
  );
}

/**
 * Keeps drag/remove buttons separate from the editor trigger to avoid nested controls.
 * @param props.id Local identity retained when this seat moves or changes.
 * @param props.index Zero-based speaking position, displayed as a one-based seat number.
 * @param props.name Persona display name, including the deleted-persona fallback.
 * @param props.modelLabel Instance and model display names for the card's second line.
 * @param props.avatar Persona artwork; seat order supplies its color.
 * @param props.open Whether this seat's editor is the active popover.
 * @param props.onOpenChange Updates the owner's active popover identity.
 * @param props.onRemove Removes this position from the caller-owned array.
 * @param props.children Persona and model controls rendered inside the popover.
 * @returns A 54px sortable card with a keyboard-accessible popover and no sorting animation.
 */
function DiscussionSeatCard(props: {
  readonly id: string;
  readonly index: number;
  readonly name: string;
  readonly modelLabel: string;
  readonly avatar: Parameters<typeof PixelAvatar>[0]["role"];
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onRemove: () => void;
  readonly children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, isDragging } =
    useSortable({ id: props.id, transition: null });
  return (
    <Popover open={props.open} onOpenChange={props.onOpenChange}>
      <div
        ref={setNodeRef}
        style={{ transform: CSS.Translate.toString(transform) }}
        data-discussion-seat
        className={`flex h-13.5 max-w-full items-center gap-2 rounded-lg border bg-card pl-1 pr-1.5 shadow-xs dark:shadow-none ${props.open ? "border-primary/70 ring-2 ring-inset ring-primary/22" : "border-border"} ${isDragging ? "relative z-10" : ""}`}
      >
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={t.discussions.moveSeat(props.name, props.index + 1)}
          className="flex shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring active:cursor-grabbing"
        >
          <GripVerticalIcon className="size-4" />
        </button>
        <PopoverTrigger
          render={
            <button
              type="button"
              className="flex h-full min-w-0 flex-1 items-center gap-2 rounded outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            />
          }
          aria-label={t.discussions.editSeat(props.name, props.index + 1)}
        >
          <span className="flex shrink-0" aria-hidden="true">
            <PixelAvatar role={props.avatar} seat={props.index + 1} size={28} />
          </span>
          <span className="flex min-w-0 flex-col pr-1 text-left">
            <span className="truncate text-sm font-medium leading-5">{props.name}</span>
            <span className="truncate text-xs leading-4 text-muted-foreground">
              {props.modelLabel}
            </span>
          </span>
        </PopoverTrigger>
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                aria-label={t.discussions.removeSeat}
                onClick={props.onRemove}
                className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              />
            }
          >
            <XIcon className="size-3.5" />
          </TooltipTrigger>
          <TooltipPopup>{t.discussions.removeSeat}</TooltipPopup>
        </Tooltip>
      </div>
      <PopoverPopup padding="none" width="auto" align="start" sideOffset={6}>
        {props.children}
      </PopoverPopup>
    </Popover>
  );
}
