/** Controlled discussion seat editor; reads environment catalogs but never creates provider sessions. */
import { useAtomValue } from "@effect/atom-react";
import { PreviewCard } from "@base-ui/react/preview-card";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import {
  DndContext,
  DragOverlay,
  useDndContext,
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
import type { DiscussionPersonaAvatar, EnvironmentId, ProjectId } from "@t3tools/contracts";
import {
  BotIcon,
  CheckIcon,
  ChevronRightIcon,
  GripVerticalIcon,
  PlusIcon,
  XIcon,
} from "lucide-react";
import { useContext, useId, useRef, useState, type ReactNode, type RefObject } from "react";
import { SortableFlingContext, useSortableFling } from "~/hooks/useSortableFling";
import { isPhysicsEnabled } from "~/lib/motion/preference";
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
import { Popover, PopoverTrigger } from "../ui/popover";
import { Select, SelectTrigger, SelectValue, SelectPopup, SelectItem } from "../ui/select";
import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";
import { PixelSeat } from "./PixelSeat";
import { PixelIcon } from "../icons/PixelIcon";
import { Badge } from "../ui/badge";
import { discussionSeatColor } from "./discussionSeatColors";
import { discussionModelLabel } from "./discussionModelLabel";
import { getTriggerDisplayModelName } from "../chat/providerIconUtils";
import {
  addDiscussionSeat,
  removeDiscussionSeat,
  moveDiscussionSeat,
  changeDiscussionSeatPersona,
  changeDiscussionSeatModel,
  canSelectDiscussionModel,
  discussionSeatPreviewIndex,
  type DiscussionDraftSeat,
} from "./discussionSeats.logic";

/**
 * Edits template-shaped seats and emits their complete speaking order.
 * @param props.environmentId Catalog and capability destination; remount when it changes.
 * @param props.projectId Project availability overrides; null for reusable templates.
 * @param props.seats Caller-owned seat array; duplicates are allowed.
 * @param props.onChange Replaces the caller's array after a local edit; no RPC mutation occurs.
 * The caller must retain the received array reference; copying it is treated as an external
 * replacement and resets card identities and open editors.
 * @param props.headerAction Optional template selector, omitted by template dialogs.
 * @returns Sortable cards and accessible persona/model popovers; loading or missing defaults disable adding.
 */
export function DiscussionSeats({
  environmentId,
  projectId,
  seats,
  onChange,
  headerAction,
}: {
  readonly environmentId: EnvironmentId;
  /** Null for reusable templates; a project applies its provider availability overrides. */
  readonly projectId: ProjectId | null;
  readonly seats: readonly DiscussionDraftSeat[];
  readonly onChange: (seats: readonly DiscussionDraftSeat[]) => void;
  readonly headerAction?: ReactNode;
}) {
  const prefix = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLElement>(null);
  const fling = useSortableFling({ containerRef, overlayRef });
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
    applyProviderInstanceSettings(deriveProviderInstanceEntries(providers), settings, projectId),
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
  const presentations = seats.map((seat): DiscussionSeatPresentation => {
    const persona = personas.find((prompt) => prompt.id === seat.personaPromptId);
    const entry = entries.find(
      (instance) => instance.instanceId === seat.modelSelection.instanceId,
    );
    const model = getCustomModelOptionsByInstance(
      settings,
      providers,
      seat.modelSelection.instanceId,
      seat.modelSelection.model,
    )
      .get(seat.modelSelection.instanceId)
      ?.find((option) => option.slug === seat.modelSelection.model);
    return {
      name: persona?.name ?? t.settings.discussions.deletedPersona,
      modelLabel: discussionModelLabel(seat.modelSelection, entry, model),
      avatar: persona?.avatar ?? "architect",
      description: persona?.description ?? "",
      builtin: persona?.builtin ?? false,
      modified: persona?.modified ?? false,
      driverKind: entry?.driverKind,
    };
  });

  return (
    <section aria-labelledby={`${prefix}-heading`} className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id={`${prefix}-heading`} className="text-body font-semibold">
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
        onDragStart={(event) => {
          fling.onDragStart(event);
          setOpenId(null);
        }}
        onDragCancel={fling.onDragCancel}
        onDragEnd={(event) => {
          fling.onDragEnd(event);
          const { active, over } = event;
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
        <SortableFlingContext value={fling.physicsSorting}>
          <SortableContext items={identity.ids} strategy={rectSortingStrategy}>
            <div
              ref={containerRef}
              className="discussion-seats-well flex flex-wrap justify-center gap-y-5 rounded-composer bg-well-surface px-3.5 pt-4.5 pb-5 shadow-well"
            >
              {seats.map((seat, index) => {
                const id = identity.ids[index] ?? `${prefix}:${identity.revision}:${index}`;
                const options = getCustomModelOptionsByInstance(
                  settings,
                  providers,
                  seat.modelSelection.instanceId,
                  seat.modelSelection.model,
                );
                const presentation = presentations[index]!;
                return (
                  <DiscussionSeatCard
                    key={id}
                    id={id}
                    open={openId === id}
                    onOpenChange={(open) => setOpenId(open ? id : null)}
                    index={index}
                    presentation={presentation}
                    onMove={(to) => {
                      const next = moveDiscussionSeat(seats, index, to);
                      if (next === seats) return;
                      const ids = [...identity.ids];
                      ids.splice(index, 1);
                      ids.splice(to, 0, id);
                      replace(next, ids);
                    }}
                    onRemove={() => {
                      setOpenId(null);
                      replace(
                        removeDiscussionSeat(seats, index),
                        identity.ids.filter((_, position) => position !== index),
                      );
                    }}
                  >
                    <div className="flex w-69.5 max-w-full flex-col gap-2.5 p-3">
                      <div className="flex flex-col gap-1.5">
                        <label
                          id={`${id}-persona-label`}
                          className="text-xs font-medium text-muted-foreground"
                        >
                          {t.discussions.persona}
                        </label>
                        <Select
                          items={personas.map((prompt) => ({
                            value: prompt.id,
                            label: prompt.name,
                          }))}
                          value={seat.personaPromptId}
                          onValueChange={(value) => {
                            const selected = personas.find((prompt) => prompt.id === value);
                            if (selected)
                              replace(changeDiscussionSeatPersona(seats, index, selected.id));
                          }}
                        >
                          <SelectTrigger aria-labelledby={`${id}-persona-label`}>
                            <PixelSeat
                              role={presentation.avatar}
                              seatIndex={index}
                              state="idle"
                              size={20}
                              label={presentation.name}
                            />
                            <span className="min-w-0 flex-1 truncate">
                              <SelectValue />
                            </span>
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
                          className="flex max-h-52 flex-col gap-0.25 overflow-y-auto rounded-compact-row bg-well-raised p-1 shadow-input-well"
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
                                  className="flex h-7.5 shrink-0 items-center gap-2 rounded-tag px-2.5 text-left text-secondary-copy-large text-fg-disabled disabled:cursor-not-allowed"
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
                                className="discussion-draft-model-group shrink-0"
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
                                        className="flex h-7.5 w-full items-center gap-2 rounded-tag px-2.5 text-left text-secondary-copy-large outline-none hover:bg-accent focus-visible:inset-shadow-focus aria-pressed:bg-accent aria-pressed:shadow-raise-tab disabled:cursor-not-allowed disabled:text-fg-disabled"
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
                                        <DiscussionProviderMark
                                          driverKind={instance.driverKind}
                                          size={13}
                                        />
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
                                        {selected ? (
                                          <CheckIcon className="size-4 shrink-0" />
                                        ) : null}
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
                className="discussion-draft-add flex h-41 w-31 shrink-0 flex-col items-center justify-center gap-2.5 rounded-card-large text-control font-semibold text-code-foreground outline-none hover:text-foreground focus-visible:inset-shadow-focus disabled:cursor-not-allowed disabled:opacity-45"
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
                <span className="discussion-draft-add-icon flex size-11 items-center justify-center">
                  <PlusIcon className="size-4.5" />
                </span>
                {t.discussions.addSeat}
              </button>
            </div>
          </SortableContext>
        </SortableFlingContext>
        <DiscussionSeatDragOverlay
          ids={identity.ids}
          presentations={presentations}
          overlayRef={overlayRef}
        />
      </DndContext>
    </section>
  );
}

/** Catalog-backed content shared by the sortable card, hover preview and drag overlay. */
interface DiscussionSeatPresentation {
  readonly name: string;
  readonly modelLabel: string;
  readonly avatar: DiscussionPersonaAvatar;
  readonly description: string;
  readonly builtin: boolean;
  readonly modified: boolean;
  readonly driverKind: string | undefined;
}

/**
 * Shows provider artwork without tying model availability to a hard-coded provider list.
 * @param props.driverKind Catalog driver; other providers retain the generic provider icon.
 * @param props.size Icon dimensions in CSS pixels.
 * @returns Claude/Codex pixel artwork or a neutral provider mark.
 */
function DiscussionProviderMark({
  driverKind,
  size,
}: {
  driverKind: string | undefined;
  size: number;
}) {
  if (driverKind === "claudeAgent" || driverKind === "codex") {
    return <PixelIcon name={driverKind === "claudeAgent" ? "claude" : "codex"} size={size} />;
  }
  return <BotIcon width={size} height={size} className="shrink-0" />;
}

/**
 * Renders the card's identity without a duplicate sprite implementation.
 * @param props.presentation Live persona and model labels, including missing-persona fallback.
 * @param props.index Preview speaking position; changes color together with the seat number.
 * @returns The 48px tile and two truncated label lines; full labels are in the hover preview.
 */
function DiscussionSeatIdentity({
  presentation,
  index,
}: {
  presentation: DiscussionSeatPresentation;
  index: number;
}) {
  return (
    <>
      <span className="mt-2 flex justify-center" aria-hidden="true">
        <PixelSeat
          role={presentation.avatar}
          seatIndex={index}
          state="idle"
          size={48}
          label={presentation.name}
        />
      </span>
      <span className="mt-2.5 block truncate text-center text-body font-bold">
        {presentation.name}
      </span>
      <span className="flex min-w-0 items-center justify-center gap-1.25 text-meta-large text-secondary-label">
        <DiscussionProviderMark driverKind={presentation.driverKind} size={12} />
        <span className="truncate">{presentation.modelLabel}</span>
      </span>
    </>
  );
}

/**
 * Keeps pointer-move subscriptions inside the card, away from the draft page and catalog queries.
 * @param props.id Stable local identity, retained across edits and committed sorting.
 * @param props.index Original position; useSortable supplies the pending collision target.
 * @param props.presentation Catalog content for the card and introduction.
 * @param props.open Whether this seat owns the editing layer.
 * @param props.onOpenChange Sets the editing layer's owner.
 * @param props.onMove Commits a keyboard move to a zero-based final index; invalid indices are ignored.
 * @param props.onRemove Removes this seat from caller-owned state.
 * @param props.children Existing persona/model controls; edits never create provider sessions.
 * @returns A 124×164 card followed by a 22px arrow, with a portal-based introduction and editor.
 */
function DiscussionSeatCard(props: {
  readonly id: string;
  readonly index: number;
  readonly presentation: DiscussionSeatPresentation;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onMove: (index: number) => void;
  readonly onRemove: () => void;
  readonly children: ReactNode;
}) {
  const physicsSorting = useContext(SortableFlingContext) && isPhysicsEnabled();
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    isDragging,
    isSorting,
    activeIndex,
    overIndex,
    items,
  } = useSortable({
    id: props.id,
    transition: null,
    // Keep seats transition-free on every input path; pointer physics owns layout compensation.
    ...(physicsSorting ? { animateLayoutChanges: () => false } : {}),
  });
  const [hoverOpen, setHoverOpen] = useState(false);
  const index = discussionSeatPreviewIndex(props.index, activeIndex, overIndex, items.length);
  const { presentation } = props;
  return (
    <Popover open={props.open} onOpenChange={props.onOpenChange}>
      <PreviewCard.Root open={hoverOpen && !props.open && !isSorting} onOpenChange={setHoverOpen}>
        <div
          ref={setNodeRef}
          data-sortable-fling-id={props.id}
          style={{ transform: CSS.Translate.toString(transform) }}
          className="relative flex shrink-0 items-center"
        >
          <div
            data-discussion-seat
            data-editing={props.open || undefined}
            data-preview={(hoverOpen && !props.open && !isSorting) || undefined}
            data-sorting={isSorting || undefined}
            data-placeholder={isDragging || undefined}
            className="discussion-draft-seat relative flex h-41 w-31 flex-col rounded-card-large bg-popover px-2 pt-2 pb-3 shadow-discussion-draft-card transition-transform duration-120 data-sorting:transition-none motion-reduce:transition-none"
          >
            {isDragging ? (
              <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-secondary-copy-large text-placeholder">
                {t.discussions.dropSeatHere}
              </span>
            ) : null}
            <div className={isDragging ? "flex flex-1 flex-col opacity-0" : "contents"}>
              <div className="flex h-5.5 items-center gap-0.5">
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <button
                        type="button"
                        ref={setActivatorNodeRef}
                        {...attributes}
                        {...listeners}
                        aria-label={t.discussions.moveSeat(presentation.name, index + 1)}
                        className="flex h-5.5 w-3.5 shrink-0 cursor-grab touch-none items-center justify-center text-fg-disabled outline-none focus-visible:inset-shadow-focus active:cursor-grabbing"
                      />
                    }
                  >
                    <GripVerticalIcon className="size-3.5" />
                  </TooltipTrigger>
                  <TooltipPopup>{t.discussions.dragSeatHint}</TooltipPopup>
                </Tooltip>
                <span
                  aria-hidden="true"
                  className={`font-serif text-discussion-draft-number font-bold ${discussionSeatColor(index + 1).textClassName}`}
                >
                  {index + 1}
                </span>
                <span className="flex-1" />
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <button
                        type="button"
                        aria-label={t.discussions.removeSeat}
                        onClick={props.onRemove}
                        className="flex size-5.5 items-center justify-center rounded-full text-placeholder outline-none hover:bg-accent focus-visible:inset-shadow-focus"
                      />
                    }
                  >
                    <XIcon className="size-3.25" />
                  </TooltipTrigger>
                  <TooltipPopup>{t.discussions.removeSeat}</TooltipPopup>
                </Tooltip>
              </div>
              <PopoverTrigger
                aria-label={t.discussions.editSeat(presentation.name, index + 1)}
                onKeyDown={(event) => {
                  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                  event.preventDefault();
                  props.onMove(props.index + (event.key === "ArrowLeft" ? -1 : 1));
                }}
                render={
                  <PreviewCard.Trigger
                    delay={150}
                    render={
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 flex-col rounded-compact-row outline-none focus-visible:inset-shadow-focus"
                      />
                    }
                  />
                }
              >
                <DiscussionSeatIdentity presentation={presentation} index={index} />
              </PopoverTrigger>
            </div>
          </div>
          <span aria-hidden="true" className="flex w-5.5 justify-center">
            <ChevronRightIcon className="size-3.5" />
          </span>
        </div>
        <PreviewCard.Portal>
          <PreviewCard.Positioner
            side="bottom"
            align="center"
            sideOffset={26}
            className="z-140 max-w-full"
          >
            <PreviewCard.Popup className="dropdown-glass flex w-67 max-w-full flex-col gap-2.5 rounded-overlay-large p-3.5 outline-none">
              <PreviewCard.Arrow className="discussion-draft-preview-arrow" />
              <div className="flex items-center gap-2.5">
                <PixelSeat
                  role={presentation.avatar}
                  seatIndex={index}
                  state="idle"
                  size={40}
                  label={presentation.name}
                />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <b className="break-words text-discussion-summary-heading">
                      {presentation.name}
                    </b>
                    {presentation.builtin ? (
                      <Badge size="sm" variant="secondary">
                        {t.settings.discussions.builtin}
                      </Badge>
                    ) : null}
                    {presentation.builtin && presentation.modified ? (
                      <Badge size="sm" variant="warning">
                        {t.settings.discussions.modified}
                      </Badge>
                    ) : null}
                  </div>
                  <span className="text-secondary-copy text-secondary-label">
                    {t.discussions.seatSpeakingOrder(index + 1)}
                  </span>
                </div>
              </div>
              {presentation.description ? (
                <p className="break-words text-control text-fg-detail">
                  {presentation.description}
                </p>
              ) : null}
              <div className="flex min-h-7.5 items-center gap-2 rounded-tag bg-well-raised px-2.5 py-1 text-secondary-copy-medium shadow-input-well">
                <DiscussionProviderMark driverKind={presentation.driverKind} size={14} />
                <span className="min-w-0 break-words">{presentation.modelLabel}</span>
              </div>
              <p className="text-meta-large text-muted-foreground">{t.discussions.seatEditHint}</p>
            </PreviewCard.Popup>
          </PreviewCard.Positioner>
        </PreviewCard.Portal>
      </PreviewCard.Root>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner
          side="bottom"
          align="start"
          alignOffset={-16}
          sideOffset={26}
          className="z-130 max-w-full"
        >
          <PopoverPrimitive.Popup className="dropdown-glass max-w-full rounded-overlay-large outline-none">
            {props.children}
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </Popover>
  );
}

/**
 * Subscribes only this overlay to pointer movement; draft state is committed once on drop.
 * @param props.ids Stable identities in the original speaking order.
 * @param props.presentations Current catalog-backed seat labels and avatars in the same order.
 * @param props.overlayRef Receives the positioned wrapper for release measurement, or null when hidden.
 * @returns A rotated, non-interactive card; cancellation has no effect on the draft.
 */
function DiscussionSeatDragOverlay({
  ids,
  presentations,
  overlayRef,
}: {
  ids: readonly string[];
  presentations: readonly DiscussionSeatPresentation[];
  overlayRef: RefObject<HTMLElement | null>;
}) {
  const { active, over } = useDndContext();
  const from = active ? ids.indexOf(String(active.id)) : -1;
  const to = over ? ids.indexOf(String(over.id)) : -1;
  const presentation = presentations[from];
  const index = discussionSeatPreviewIndex(from, from, to, ids.length);
  return (
    <DragOverlay dropAnimation={null} transition="">
      {presentation ? (
        <div
          ref={(element) => {
            // Measure the overlay's positioned wrapper, excluding the card's decorative rotation.
            overlayRef.current = element?.parentElement ?? null;
          }}
          aria-hidden="true"
          className="flex h-41 w-31 -rotate-3 cursor-grabbing flex-col rounded-card-large bg-discussion-draft-drag px-2 pt-2 pb-3 shadow-discussion-draft-drag"
        >
          <div className="flex h-5.5 items-center gap-0.5">
            <GripVerticalIcon className="size-3.5" />
            <span
              className={`font-serif text-discussion-draft-number font-bold ${discussionSeatColor(index + 1).textClassName}`}
            >
              {index + 1}
            </span>
            <span className="flex-1" />
            <XIcon className="size-3.25" />
          </div>
          <DiscussionSeatIdentity presentation={presentation} index={index} />
        </div>
      ) : null}
    </DragOverlay>
  );
}
