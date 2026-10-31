/** Virtualized, provider-driven model selection with search, favorites, and keyboard shortcuts. */
import { t } from "~/i18n";
import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox";
import {
  ANTIGRAVITY_DEFAULT_MODEL,
  type ProviderInstanceId,
  type EnvironmentId,
  type ProviderDriverKind,
  type ResolvedKeybindingsConfig,
  MODEL_PICKER_JUMP_KEYBINDING_COMMANDS,
} from "@t3tools/contracts";
import { resolveSelectableModel } from "@t3tools/shared/model";
import { useAtomValue } from "@effect/atom-react";
import { formatProviderUpdateRequiredNotice } from "@t3tools/client-runtime/providerUpdateRequiredModels";
import { useNavigate } from "@tanstack/react-router";
import { LegendList, type LegendListRef } from "@legendapp/list/react";
import {
  memo,
  useState,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
import { GitForkIcon, SearchIcon } from "lucide-react";
import { ModelLegacyArrow } from "./ModelLegacyArrow";
import { createModelPickerSpring } from "./modelPickerSpring";
import { TOKENS } from "~/lib/motion/tokens";
import { ModelListRow } from "./ModelListRow";
import { ModelPickerSidebar } from "./ModelPickerSidebar";
import { getProviderStatusMessage, hasProviderSetup } from "./ProviderStatusBanner";
import {
  modelPickerLegacySectionKey,
  modelPickerModelKey,
  parseModelPickerLegacySectionKey,
  parseModelPickerModelKey,
} from "./modelPickerKeys";
import { rankModelPickerSearch } from "./modelPickerSearch";
import { Combobox, ComboboxEmpty, ComboboxItem, ComboboxListVirtualized } from "../ui/combobox";
import { ModelEsque } from "./providerIconUtils";
import { isCommandPaletteOpen } from "../../commandPaletteBus";
import { registerModelPickerContent } from "../../modelPickerVisibility";
import { primaryServerKeybindingsAtom } from "../../state/server";
import {
  modelPickerJumpCommandForIndex,
  modelPickerJumpIndexFromCommand,
  resolveShortcutCommand,
  shortcutLabelForCommand,
} from "../../keybindings";
import {
  useEnvironmentModelPreferences,
  useToggleEnvironmentModelFavorite,
} from "~/hooks/useSettings";
import { announce } from "~/lib/announce";
import { cn } from "~/lib/utils";
import { createSpringIndicator } from "~/lib/motion/springIndicator";
import { observeResize } from "~/lib/observeResize";
import { getVirtualizedScrollFadeClassName } from "../ui/scroll-area";
import { TooltipProvider } from "../ui/tooltip";
import { InlineButton } from "../ui/button";
import {
  isProviderInstancePickerReady,
  isProviderInstancePickerVisible,
  shouldShowInstanceBadge,
  type ProviderInstanceEntry,
} from "../../providerInstances";
import { providerModelKey, sortProviderModelItems } from "../../modelOrdering";

/** Provider-supplied model metadata paired with the instance used for routing selections. */
type ModelPickerItem = {
  slug: string;
  name: string;
  shortName?: string;
  subProvider?: string;
  badge?: "new";
  instanceId: ProviderInstanceId;
  driverKind: ProviderDriverKind;
  instanceDisplayName: string;
  instanceAccentColor?: string | undefined;
  acpRegistryAgentId?: string | undefined;
  acpRegistryIconUrl?: string | undefined;
  continuationGroupKey?: string | undefined;
  isLegacy?: boolean | undefined;
  isUnavailable?: boolean | undefined;
};

/** Resolves the active slug, or Antigravity's auto alias/default; returns undefined when unavailable. */
export function resolveModelPickerSelectedModel(input: {
  driverKind: ProviderDriverKind | undefined;
  model: string;
  options: ReadonlyArray<ModelEsque>;
}) {
  if (input.driverKind === "antigravity" && input.model === ANTIGRAVITY_DEFAULT_MODEL) {
    const availableModels = input.options.filter(
      (option) => option.slug !== ANTIGRAVITY_DEFAULT_MODEL && !option.isUnavailable,
    );
    return (
      availableModels.find((option) => option.aliases?.includes(ANTIGRAVITY_DEFAULT_MODEL)) ??
      availableModels.find((option) => option.isDefault)
    );
  }
  return input.options.find((option) => option.slug === input.model);
}

/** Keeps ready options and the active unavailable OpenCode/Antigravity model, excluding auto aliases. */
export function shouldIncludeModelPickerOption(input: {
  readonly entry: ProviderInstanceEntry;
  readonly option: ModelEsque;
  readonly activeInstanceId: ProviderInstanceId;
  readonly activeModel: string;
}): boolean {
  if (input.entry.driverKind === "antigravity" && input.option.slug === ANTIGRAVITY_DEFAULT_MODEL) {
    return false;
  }
  if (isProviderInstancePickerReady(input.entry)) return true;
  return (
    input.entry.enabled &&
    (input.entry.driverKind === "opencode" || input.entry.driverKind === "antigravity") &&
    input.entry.instanceId === input.activeInstanceId &&
    input.option.slug === input.activeModel &&
    input.option.isUnavailable === true
  );
}

/** Offers setup only for enabled providers with a setup flow and a missing usable installation/model. */
export function shouldOfferModelPickerSetup(
  entry: ProviderInstanceEntry,
  options: ReadonlyArray<ModelEsque>,
): boolean {
  return (
    entry.enabled &&
    entry.status !== "disabled" &&
    hasProviderSetup(entry.snapshot) &&
    (!isProviderInstancePickerReady(entry) ||
      !entry.installed ||
      entry.snapshot.auth.status === "unauthenticated" ||
      !options.some((option) => !option.isUnavailable))
  );
}

/** Wraps through favorites and selectable instances in the requested keyboard direction. */
export function adjacentModelPickerProvider(input: {
  entries: ReadonlyArray<ProviderInstanceEntry>;
  selectedInstanceId: ProviderInstanceId | "favorites";
  direction: 1 | -1;
  disabledInstanceIds: ReadonlySet<ProviderInstanceId> | undefined;
  selectableUnavailableInstanceIds: ReadonlySet<ProviderInstanceId> | undefined;
}) {
  const providers: Array<ProviderInstanceId | "favorites"> = [
    "favorites",
    ...input.entries
      .filter(
        (entry) =>
          !input.disabledInstanceIds?.has(entry.instanceId) &&
          (isProviderInstancePickerReady(entry) ||
            input.selectableUnavailableInstanceIds?.has(entry.instanceId)),
      )
      .map((entry) => entry.instanceId),
  ];
  const index = providers.indexOf(input.selectedInstanceId);
  return providers[
    index < 0
      ? input.direction === 1
        ? 0
        : providers.length - 1
      : (index + input.direction + providers.length) % providers.length
  ]!;
}

const EMPTY_MODEL_JUMP_LABELS = new Map<string, string>();
// H2 rows are 34px; favorites/search add the provider line and are measured by LegendList.
const MODEL_LIST_ESTIMATED_ITEM_SIZE = 34;

/** Retains the virtualizer's existing separation between measured options. */
function ModelListSeparator() {
  return <div className="h-0.5" />;
}

function modelJumpLabelsByKey(
  modelKeys: ReadonlyArray<string>,
  keybindings: ResolvedKeybindingsConfig,
  terminalOpen: boolean,
): ReadonlyMap<string, string> {
  const shortcutLabelOptions = {
    platform: navigator.platform,
    context: { terminalFocus: false, terminalOpen, modelPickerOpen: true },
  };
  const mapping = new Map<string, string>();
  for (const [index, modelKey] of modelKeys.entries()) {
    const command = modelPickerJumpCommandForIndex(index);
    const label = command && shortcutLabelForCommand(keybindings, command, shortcutLabelOptions);
    if (label) {
      mapping.set(modelKey, label);
    }
  }
  return mapping.size > 0 ? mapping : EMPTY_MODEL_JUMP_LABELS;
}

/** Keeps provider setup and upgrade recovery reachable when the model list is empty.
 * @param setupEntries Providers requiring setup; empty selects the localized empty state.
 * @param updateRequiredNotices Instance-scoped upgrade messages shown below the list.
 * @param onRequestClose Optional picker dismissal before navigation.
 * @param onOpenProviderSetup Optional handler receiving the provider instance to configure.
 * @returns Recovery actions; opening provider settings changes the route. */
function ModelPickerProviderNotices({
  setupEntries,
  updateRequiredNotices,
  emptyLabel,
  onRequestClose,
  onOpenProviderSetup,
}: {
  setupEntries: ReadonlyArray<ProviderInstanceEntry>;
  emptyLabel: string;
  updateRequiredNotices: ReadonlyArray<{ instanceId: ProviderInstanceId; notice: string }>;
  onRequestClose: (() => void) | undefined;
  onOpenProviderSetup: ((instanceId: ProviderInstanceId) => void) | undefined;
}) {
  const navigate = useNavigate();
  return (
    <>
      {setupEntries.length > 0 ? (
        <div className="max-h-44 shrink-0 overflow-y-auto border-t border-border/70 p-2">
          {setupEntries.map((entry) => (
            <div key={entry.instanceId} className="px-1 py-1.5 text-xs leading-snug">
              <p className="line-clamp-3 text-muted-foreground">
                {getProviderStatusMessage(entry.snapshot)}
              </p>
              <InlineButton
                className="mt-1"
                onClick={() => {
                  onRequestClose?.();
                  onOpenProviderSetup?.(entry.instanceId);
                }}
              >
                {setupEntries.length > 1
                  ? t.composer.modelPicker.setupProvider(entry.displayName)
                  : t.composer.modelPicker.openSetup}
              </InlineButton>
            </div>
          ))}
        </div>
      ) : (
        <ComboboxEmpty className="empty:h-0">{emptyLabel}</ComboboxEmpty>
      )}
      {updateRequiredNotices.map(({ instanceId, notice }) => (
        <p
          key={instanceId}
          className="shrink-0 border-t border-border/70 px-3 py-2 text-xs leading-snug text-muted-foreground"
        >
          {notice}{" "}
          <InlineButton
            onClick={() => {
              onRequestClose?.();
              void navigate({ to: "/settings/providers" });
            }}
          >
            {t.chat.providerSettingsLink}
          </InlineButton>
        </p>
      ))}
    </>
  );
}

/** Owns list geometry and a key-based highlight; scrolling never rebuilds the model catalogue. */
function ModelPickerList({
  listRef,
  itemKeys,
  extraData,
  renderItem,
  highlightedKeyRef,
  alignHighlightRef,
  prepareLegacyResizeRef,
}: {
  listRef: RefObject<LegendListRef | null>;
  itemKeys: ReadonlyArray<string>;
  extraData: unknown;
  renderItem: (props: { item: string; index: number }) => ReactNode;
  highlightedKeyRef: RefObject<string | null>;
  alignHighlightRef: RefObject<((animate: boolean) => void) | null>;
  prepareLegacyResizeRef: RefObject<(() => void) | null>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const heightSpringRef = useRef<ReturnType<typeof createModelPickerSpring> | null>(null);
  const pendingHeightRef = useRef<{ value: number; velocity: number } | null>(null);
  useLayoutEffect(() => {
    const motion = createModelPickerSpring(containerRef.current!, "height", TOKENS.settle);
    heightSpringRef.current = motion;
    prepareLegacyResizeRef.current = () => {
      pendingHeightRef.current = motion.sample();
    };
    return () => {
      prepareLegacyResizeRef.current = null;
      heightSpringRef.current = null;
      motion.dispose();
    };
  }, [prepareLegacyResizeRef]);
  const [showTopScrollFade, setShowTopScrollFade] = useState(false);
  const [showBottomScrollFade, setShowBottomScrollFade] = useState(false);
  const [contentSize, setContentSize] = useState(
    () => itemKeys.length * MODEL_LIST_ESTIMATED_ITEM_SIZE,
  );
  useLayoutEffect(() => listRef.current?.getState().listen("totalSize", setContentSize), [listRef]);
  useLayoutEffect(() => {
    const motion = heightSpringRef.current!;
    if (!pendingHeightRef.current && !motion.isRunning()) return;
    const from = motion.isRunning() ? motion.sample() : pendingHeightRef.current!;
    pendingHeightRef.current = null;
    const target = motion.measureTarget();
    // Virtualized rows refine their estimates after mounting; retarget the same finite effect.
    motion.move(target, from, true);
    // Height changes alter the highlight's bottom inset; T6's resize observer deliberately snaps it.
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- totalSize commits the natural height before this measurement.
  }, [contentSize]);
  const updateScrollFades = () => {
    const scrollElement = listRef.current?.getScrollableNode();
    if (!(scrollElement instanceof HTMLElement)) {
      return;
    }
    const maxScrollOffset = Math.max(0, scrollElement.scrollHeight - scrollElement.clientHeight);
    setShowTopScrollFade(scrollElement.scrollTop > 1);
    setShowBottomScrollFade(maxScrollOffset - scrollElement.scrollTop > 1);
  };

  // Disabled-reason closures rebuild identical key arrays; compare contents.
  const itemListKey = JSON.stringify(itemKeys);
  useLayoutEffect(() => {
    const container = containerRef.current;
    const highlight = highlightRef.current;
    if (!container || !highlight) return;
    const motion = createSpringIndicator(highlight, container, "y");
    let previousKey: string | null = null;
    let previousInsets: readonly [number, number] | null = null;
    const align = (animate: boolean, onlyIfMoved = false) => {
      const key = highlightedKeyRef.current;
      const row = Array.from(
        container.querySelectorAll<HTMLElement>("[data-model-picker-key]"),
      ).find((element) => element.dataset.modelPickerKey === key);
      if (!row) {
        // Recycled DOM nodes can represent another model; hide until this key is mounted again.
        motion.move([0, 0], false);
        highlight.hidden = true;
        previousKey = null;
        previousInsets = null;
        return;
      }
      // Repeated pointer events for the same key must not interrupt its in-flight spring.
      if (animate && previousKey === key) return;
      highlight.hidden = false;
      const bounds = container.getBoundingClientRect();
      const target = row.getBoundingClientRect();
      highlight.style.left = `${target.left - bounds.left}px`;
      highlight.style.right = `${bounds.right - target.right}px`;
      const top = target.top - bounds.top;
      const bottom = container.clientHeight - (target.bottom - bounds.top);
      // Compare destination insets, not the spring's painted position. Only observers may skip;
      // scrolling still forces alignment, and retaining the last target prevents subpixel drift.
      if (
        onlyIfMoved &&
        previousKey === key &&
        previousInsets &&
        Math.abs(top - previousInsets[0]) <= 0.5 &&
        Math.abs(bottom - previousInsets[1]) <= 0.5
      )
        return;
      motion.move(
        [top, target.bottom - bounds.top],
        animate && previousKey !== null && previousKey !== key,
      );
      previousKey = key;
      previousInsets = [top, bottom];
    };
    alignHighlightRef.current = align;
    align(false);
    let stopResize: (() => void) | undefined;
    const observeSizes = () => {
      stopResize?.();
      stopResize = observeResize(
        [container, ...container.querySelectorAll("[data-model-picker-key]")],
        () => align(false, true),
      );
    };
    observeSizes();
    const mutations = new MutationObserver((records) => {
      const layoutChanges = records.filter((record) => record.target !== highlight);
      if (layoutChanges.length === 0) return;
      if (layoutChanges.some((record) => record.type === "childList")) observeSizes();
      align(false, true);
    });
    mutations.observe(container, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["style", "data-model-picker-key"],
    });
    const onScroll = () => align(false);
    container.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => {
      alignHighlightRef.current = null;
      mutations.disconnect();
      stopResize?.();
      container.removeEventListener("scroll", onScroll, true);
      motion.dispose();
    };
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- Search/provider changes replace the key set and must start aligned without motion.
  }, [itemListKey, highlightedKeyRef, alignHighlightRef]);
  // A new list starts from the top until the measurement below lands.
  const [fadesResetFor, setFadesResetFor] = useState(itemListKey);
  if (fadesResetFor !== itemListKey) {
    setFadesResetFor(itemListKey);
    setShowTopScrollFade(false);
    setShowBottomScrollFade(itemKeys.length > 5);
  }
  const measureScrollFades = useEffectEvent(updateScrollFades);
  useLayoutEffect(() => {
    let nestedFrame = 0;
    const frame = window.requestAnimationFrame(() => {
      measureScrollFades();
      nestedFrame = window.requestAnimationFrame(() => measureScrollFades());
    });
    return () => {
      window.cancelAnimationFrame(frame);
      window.cancelAnimationFrame(nestedFrame);
    };
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- A new list re-measures its scroll fades once it has laid out.
  }, [itemListKey]);

  return (
    <div
      ref={containerRef}
      className="relative isolate min-h-0 overflow-hidden pr-px"
      style={{
        height: itemKeys.length === 0 ? 0 : `calc(${contentSize}px + var(--spacing) * 5)`,
      }}
    >
      <div
        ref={highlightRef}
        data-model-picker-highlight="true"
        className="composer-model-picker-highlight pointer-events-none absolute -z-1 rounded-menu-row bg-accent"
        aria-hidden="true"
      />
      <ComboboxListVirtualized>
        <LegendList<string>
          ref={listRef}
          data={itemKeys}
          extraData={extraData}
          keyExtractor={(modelKey) => modelKey}
          renderItem={renderItem}
          estimatedItemSize={MODEL_LIST_ESTIMATED_ITEM_SIZE}
          drawDistance={480}
          recycleItems
          contentContainerClassName="pl-2 pr-px"
          ItemSeparatorComponent={ModelListSeparator}
          onLayout={updateScrollFades}
          onScroll={updateScrollFades}
          className={cn(
            "scrollbar-gutter-stable h-full overflow-x-hidden overscroll-y-contain py-1.5 [&::-webkit-scrollbar-track]:my-2",
            getVirtualizedScrollFadeClassName({
              top: showTopScrollFade,
              bottom: showBottomScrollFade,
            }),
          )}
        />
      </ComboboxListVirtualized>
    </div>
  );
}

// Capture gives picker shortcuts priority over the composer.
function WindowKeyDownListener({ onKeyDown }: { onKeyDown: (event: KeyboardEvent) => void }) {
  const handleKeyDown = useEffectEvent(onKeyDown);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => handleKeyDown(event);
    window.addEventListener("keydown", listener, true);
    return () => {
      window.removeEventListener("keydown", listener, true);
    };
  }, []);
  return null;
}

/** Displays current provider options; callbacks own model writes, setup, and closing the popup. */
export const ModelPickerContent = memo(function ModelPickerContent(props: {
  environmentId: EnvironmentId | null;
  activeInstanceId: ProviderInstanceId;
  model: string;
  selectedModels?: ReadonlyArray<{ instanceId: ProviderInstanceId; model: string }>;
  onToggleModel?: (instanceId: ProviderInstanceId, model: string) => void;
  lockedProvider: ProviderDriverKind | null;
  lockedContinuationGroupKey?: string | null;
  instanceEntries: ReadonlyArray<ProviderInstanceEntry>;
  keybindings?: ResolvedKeybindingsConfig;
  modelOptionsByInstance: ReadonlyMap<ProviderInstanceId, ReadonlyArray<ModelEsque>>;
  terminalOpen: boolean;
  onRequestClose?: () => void;
  onOpenProviderSetup?: (instanceId: ProviderInstanceId) => void;
  getModelDisabledReason?: (instanceId: ProviderInstanceId, model: string) => string | null;
  onInstanceModelChange: (instanceId: ProviderInstanceId, model: string) => void;
  /** The owning popup moves focus here when it opens (its `initialFocus`). */
  searchInputRef: RefObject<HTMLInputElement | null>;
}) {
  const {
    searchInputRef,
    keybindings: providedKeybindings,
    modelOptionsByInstance,
    instanceEntries,
    getModelDisabledReason,
    onInstanceModelChange,
    onToggleModel,
    onRequestClose,
    onOpenProviderSetup,
  } = props;
  const [searchQuery, setSearchQuery] = useState("");
  const modelListRef = useRef<LegendListRef | null>(null);
  const pickerContentRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => registerModelPickerContent(), []);
  const highlightedModelKeyRef = useRef<string | null>(null);
  const alignModelHighlightRef = useRef<((animate: boolean) => void) | null>(null);
  const prepareLegacyResizeRef = useRef<(() => void) | null>(null);
  const [selectionRequest, setSelectionRequest] = useState<{ key: string } | null>(null);
  const { favorites } = useEnvironmentModelPreferences(props.environmentId);
  const activeEntry = props.instanceEntries.find(
    (entry) => entry.instanceId === props.activeInstanceId,
  );
  const activeModel = resolveModelPickerSelectedModel({
    driverKind: activeEntry?.driverKind,
    model: props.model,
    options: modelOptionsByInstance.get(props.activeInstanceId) ?? [],
  });
  const activeModelSlug =
    activeModel?.slug ?? (props.model === ANTIGRAVITY_DEFAULT_MODEL ? "" : props.model);
  const activeModelKey = activeModelSlug
    ? modelPickerModelKey(props.activeInstanceId, activeModelSlug)
    : null;
  const selectedModelKeys = props.selectedModels?.map((selection) => {
    const entry = instanceEntries.find((entry) => entry.instanceId === selection.instanceId);
    const model = resolveModelPickerSelectedModel({
      driverKind: entry?.driverKind,
      model: selection.model,
      options: modelOptionsByInstance.get(selection.instanceId) ?? [],
    });
    return modelPickerModelKey(selection.instanceId, model?.slug ?? selection.model);
  });
  const selectedModelKeySet = new Set(
    selectedModelKeys ?? (activeModelKey ? [activeModelKey] : []),
  );
  const activeInstanceHasSelectableUnavailableModel =
    activeEntry !== undefined &&
    (modelOptionsByInstance.get(props.activeInstanceId) ?? []).some((option) =>
      shouldIncludeModelPickerOption({
        entry: activeEntry,
        option,
        activeInstanceId: props.activeInstanceId,
        activeModel: activeModelSlug,
      }),
    ) &&
    !isProviderInstancePickerReady(activeEntry);
  const activeInstanceNeedsSetup =
    onOpenProviderSetup !== undefined &&
    activeEntry !== undefined &&
    shouldOfferModelPickerSetup(
      activeEntry,
      modelOptionsByInstance.get(props.activeInstanceId) ?? [],
    );
  const [selectedInstanceId, setSelectedInstanceId] = useState<ProviderInstanceId | "favorites">(
    () => {
      if (
        props.lockedProvider !== null ||
        activeInstanceHasSelectableUnavailableModel ||
        activeInstanceNeedsSetup
      ) {
        return props.activeInstanceId;
      }
      return favorites.length > 0 ? "favorites" : props.activeInstanceId;
    },
  );
  const favoritesSet = new Set(favorites.map((fav) => providerModelKey(fav.provider, fav.model)));
  const [expandedLegacyInstances, setExpandedLegacyInstances] = useState(
    () =>
      new Set<ProviderInstanceId>(
        activeModel?.isLegacy &&
          !favoritesSet.has(providerModelKey(props.activeInstanceId, activeModelSlug))
          ? [props.activeInstanceId]
          : [],
      ),
  );
  const serverKeybindings = useAtomValue(primaryServerKeybindingsAtom);
  const keybindings = providedKeybindings ?? serverKeybindings;
  const [searchHeight, setSearchHeight] = useState(0);
  const toggleFavorite = useToggleEnvironmentModelFavorite(props.environmentId);

  const focusSearchInput = () => {
    searchInputRef.current?.focus({ preventScroll: true });
  };

  const handleSelectInstance = (instanceId: ProviderInstanceId | "favorites") => {
    setSelectedInstanceId(instanceId);
    window.requestAnimationFrame(() => {
      focusSearchInput();
    });
  };

  const toggleLegacySection = (instanceId: ProviderInstanceId) => {
    prepareLegacyResizeRef.current?.();
    setExpandedLegacyInstances((expanded) => {
      const next = new Set(expanded);
      if (next.has(instanceId)) {
        next.delete(instanceId);
      } else {
        next.add(instanceId);
      }
      return next;
    });
  };

  const handleModelSelect = (
    modelSlug: string,
    instanceId: ProviderInstanceId,
    additive = false,
  ): string | null => {
    if (getModelDisabledReason?.(instanceId, modelSlug)) {
      return null;
    }
    const options = modelOptionsByInstance.get(instanceId);
    if (!options) {
      return null;
    }
    const entry = instanceEntries.find((candidate) => candidate.instanceId === instanceId);
    if (!entry) {
      return null;
    }
    const resolvedModel = resolveSelectableModel(entry.driverKind, modelSlug, options);
    if (resolvedModel) {
      if (additive && onToggleModel) {
        setSelectionRequest({ key: modelPickerModelKey(instanceId, resolvedModel) });
        onToggleModel(instanceId, resolvedModel);
      } else {
        onInstanceModelChange(instanceId, resolvedModel);
      }
    }
    return resolvedModel;
  };

  const modelJumpShortcutContext = {
    terminalFocus: false,
    terminalOpen: props.terminalOpen,
    modelPickerOpen: true,
  } as const;
  const lockedProvider = props.lockedProvider;
  const lockedContinuationGroupKey = props.lockedContinuationGroupKey;
  const canOpenProviderSetup = onOpenProviderSetup !== undefined;

  const entryByInstanceId = new Map(instanceEntries.map((entry) => [entry.instanceId, entry]));
  const matchesLockedProvider = (
    entry: Pick<ProviderInstanceEntry, "driverKind" | "continuationGroupKey">,
  ): boolean => {
    if (lockedProvider === null) return true;
    if (entry.driverKind !== lockedProvider) return false;
    if (!lockedContinuationGroupKey) return true;
    return entry.continuationGroupKey === lockedContinuationGroupKey;
  };

  const selectableUnavailableInstanceIds = (() => {
    const instanceIds = new Set<ProviderInstanceId>();
    if (activeInstanceHasSelectableUnavailableModel) {
      instanceIds.add(props.activeInstanceId);
    }
    if (canOpenProviderSetup) {
      for (const entry of instanceEntries) {
        if (
          shouldOfferModelPickerSetup(entry, modelOptionsByInstance.get(entry.instanceId) ?? [])
        ) {
          instanceIds.add(entry.instanceId);
        }
      }
    }
    return instanceIds.size > 0 ? instanceIds : undefined;
  })();

  const flatModels = (() => {
    const out: ModelPickerItem[] = [];
    for (const [instanceId, models] of modelOptionsByInstance) {
      const entry = entryByInstanceId.get(instanceId);
      if (!entry) {
        continue;
      }
      for (const model of models) {
        if (
          !shouldIncludeModelPickerOption({
            entry,
            option: model,
            activeInstanceId: props.activeInstanceId,
            activeModel: activeModelSlug,
          })
        ) {
          continue;
        }
        out.push({
          slug: model.slug,
          name: model.name,
          ...(model.shortName ? { shortName: model.shortName } : {}),
          ...(model.subProvider ? { subProvider: model.subProvider } : {}),
          ...(model.badge ? { badge: model.badge } : {}),
          ...(model.isLegacy ? { isLegacy: true } : {}),
          ...(model.isUnavailable ? { isUnavailable: true } : {}),
          instanceId,
          driverKind: entry.driverKind,
          instanceDisplayName: entry.displayName,
          ...(entry.accentColor ? { instanceAccentColor: entry.accentColor } : {}),
          ...(entry.acpRegistryAgentId ? { acpRegistryAgentId: entry.acpRegistryAgentId } : {}),
          ...(entry.acpRegistryIconUrl ? { acpRegistryIconUrl: entry.acpRegistryIconUrl } : {}),
          ...(entry.continuationGroupKey
            ? { continuationGroupKey: entry.continuationGroupKey }
            : {}),
        });
      }
    }
    return out;
  })();

  const isLocked = lockedProvider !== null;
  const isSearching = searchQuery.trim().length > 0;
  const lockedDisabledInstanceIds = (() => {
    if (!isLocked) {
      return undefined;
    }
    const disabled = new Set<ProviderInstanceId>();
    for (const entry of instanceEntries) {
      if (!matchesLockedProvider(entry)) {
        disabled.add(entry.instanceId);
      }
    }
    return disabled;
  })();
  const sidebarInstanceEntries = (() => {
    const enabledEntries = instanceEntries.filter(isProviderInstancePickerVisible);
    if (!isLocked) {
      return enabledEntries;
    }
    const available: ProviderInstanceEntry[] = [];
    const disabled: ProviderInstanceEntry[] = [];
    for (const entry of enabledEntries) {
      if (matchesLockedProvider(entry)) {
        available.push(entry);
      } else {
        disabled.push(entry);
      }
    }
    return [...available, ...disabled];
  })();
  const showSidebar = !isSearching && sidebarInstanceEntries.length > 0;
  const instanceOrder = instanceEntries.map((entry) => entry.instanceId);

  const filteredModels = (() => {
    let result = flatModels;

    if (searchQuery.trim()) {
      const candidates =
        lockedProvider !== null ? result.filter((m) => matchesLockedProvider(m)) : result;
      return rankModelPickerSearch(candidates, searchQuery, (model) => ({
        name: model.name,
        ...(model.shortName ? { shortName: model.shortName } : {}),
        ...(model.subProvider ? { subProvider: model.subProvider } : {}),
        driverKind: model.driverKind,
        providerDisplayName: model.instanceDisplayName,
        isFavorite: favoritesSet.has(providerModelKey(model.instanceId, model.slug)),
      }));
    }

    if (lockedProvider !== null) {
      result = result.filter((m) => matchesLockedProvider(m));
      if (selectedInstanceId === "favorites") {
        result = result.filter((m) => favoritesSet.has(providerModelKey(m.instanceId, m.slug)));
      } else {
        result = result.filter((m) => m.instanceId === selectedInstanceId);
      }
    } else if (selectedInstanceId === "favorites") {
      result = result.filter((m) => favoritesSet.has(providerModelKey(m.instanceId, m.slug)));
    } else {
      result = result.filter((m) => m.instanceId === selectedInstanceId);
    }

    return sortProviderModelItems(result, {
      favoriteModelKeys: favoritesSet,
      groupFavorites: selectedInstanceId !== "favorites",
      instanceOrder: selectedInstanceId === "favorites" ? instanceOrder : [],
    });
  })();

  const legacySection = (() => {
    if (isSearching || selectedInstanceId === "favorites") {
      return null;
    }
    const currentModels: ModelPickerItem[] = [];
    const legacyModels: ModelPickerItem[] = [];
    for (const model of filteredModels) {
      const isLegacy =
        model.isLegacy && !favoritesSet.has(providerModelKey(model.instanceId, model.slug));
      (isLegacy ? legacyModels : currentModels).push(model);
    }
    if (legacyModels.length === 0) {
      return null;
    }
    return {
      key: modelPickerLegacySectionKey(selectedInstanceId),
      currentModels,
      legacyModels,
      isExpanded: expandedLegacyInstances.has(selectedInstanceId),
    };
  })();

  const visibleModels = (() => {
    if (!legacySection) {
      return filteredModels;
    }
    return [
      ...legacySection.currentModels,
      ...(legacySection.isExpanded ? legacySection.legacyModels : []),
    ];
  })();

  const selectedEntry =
    selectedInstanceId === "favorites" ? undefined : entryByInstanceId.get(selectedInstanceId);
  const providerSetupEntries =
    !isSearching && canOpenProviderSetup
      ? instanceEntries.filter(
          (entry) =>
            matchesLockedProvider(entry) &&
            shouldOfferModelPickerSetup(
              entry,
              modelOptionsByInstance.get(entry.instanceId) ?? [],
            ) &&
            (selectedEntry
              ? entry.instanceId === selectedEntry.instanceId
              : filteredModels.length === 0),
        )
      : [];

  const updateRequiredNotices = instanceEntries.flatMap((entry) => {
    const shown = isSearching
      ? matchesLockedProvider(entry)
      : entry.instanceId === selectedEntry?.instanceId;
    const notice = shown
      ? formatProviderUpdateRequiredNotice(
          entry.snapshot,
          searchQuery,
          t.chat.modelPicker.updateRequiredMessages,
        )
      : null;
    return notice ? [{ instanceId: entry.instanceId, notice }] : [];
  });

  const modelJumpModelKeys = visibleModels
    .filter((model) => !getModelDisabledReason?.(model.instanceId, model.slug))
    .slice(0, MODEL_PICKER_JUMP_KEYBINDING_COMMANDS.length)
    .map((model) => modelPickerModelKey(model.instanceId, model.slug));
  const allItemKeys = ((): string[] => [
    ...flatModels.map((model) => modelPickerModelKey(model.instanceId, model.slug)),
    ...new Set(
      flatModels
        .filter((model) => model.isLegacy)
        .map((model) => modelPickerLegacySectionKey(model.instanceId)),
    ),
  ])();
  const filteredItemKeys = ((): string[] => {
    const modelKeys = visibleModels.map((model) =>
      modelPickerModelKey(model.instanceId, model.slug),
    );
    if (!legacySection) {
      return modelKeys;
    }
    modelKeys.splice(legacySection.currentModels.length, 0, legacySection.key);
    return modelKeys;
  })();
  const filteredModelByKey = ((): ReadonlyMap<string, ModelPickerItem> =>
    new Map(
      visibleModels.map(
        (model) => [modelPickerModelKey(model.instanceId, model.slug), model] as const,
      ),
    ))();

  const modelJumpLabelByKey = modelJumpLabelsByKey(
    modelJumpModelKeys,
    keybindings,
    props.terminalOpen,
  );
  const badgedInstanceIds = new Set(
    instanceEntries
      .filter((entry) => shouldShowInstanceBadge(entry, instanceEntries))
      .map((entry) => entry.instanceId),
  );
  const modelListExtraData = {
    badgedInstanceIds,
    favoritesSet,
    modelJumpLabelByKey,
    activeModelKey,
    selectedModelKeySet,
    selectionRequest,
  };

  const onWindowKeyDown = (event: globalThis.KeyboardEvent) => {
    if (
      event.defaultPrevented ||
      event.repeat ||
      event.isComposing ||
      event.keyCode === 229 ||
      isCommandPaletteOpen()
    ) {
      return;
    }

    const command = resolveShortcutCommand(event, keybindings, {
      platform: navigator.platform,
      context: modelJumpShortcutContext,
    });
    if (command === "modelPicker.previousProvider" || command === "modelPicker.nextProvider") {
      event.preventDefault();
      event.stopPropagation();
      const next = adjacentModelPickerProvider({
        entries: sidebarInstanceEntries,
        selectedInstanceId,
        direction: command === "modelPicker.nextProvider" ? 1 : -1,
        disabledInstanceIds: lockedDisabledInstanceIds,
        selectableUnavailableInstanceIds,
      });
      setSearchQuery("");
      handleSelectInstance(next);
      announce(
        next === "favorites"
          ? t.composer.modelPicker.favorites
          : (entryByInstanceId.get(next)?.displayName ?? next),
        "model-picker",
      );
      return;
    }
    const jumpIndex = modelPickerJumpIndexFromCommand(command ?? "");
    if (jumpIndex === null) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();

    const targetModelKey = modelJumpModelKeys[jumpIndex];
    if (!targetModelKey) {
      return;
    }
    const model = parseModelPickerModelKey(targetModelKey);
    if (!model) {
      return;
    }
    const selectedSlug = handleModelSelect(model.slug, model.instanceId);
    if (selectedSlug === null) return;
    const name = flatModels.find(
      (item) => item.slug === selectedSlug && item.instanceId === model.instanceId,
    )?.name;
    announce(`Model: ${name ?? selectedSlug}`, "model-picker");
  };

  return (
    <TooltipProvider delay={0}>
      <WindowKeyDownListener onKeyDown={onWindowKeyDown} />
      <div
        ref={pickerContentRef}
        className="composer-model-picker relative flex max-h-86.5 w-screen max-w-167 flex-row overflow-hidden"
        // Hold the height from when the search started; results scroll instead of resizing.
        style={isSearching ? { height: searchHeight } : undefined}
        data-model-picker-content="true"
      >
        {showSidebar && (
          <ModelPickerSidebar
            selectedInstanceId={selectedInstanceId}
            onSelectInstance={handleSelectInstance}
            onFocusSearch={focusSearchInput}
            instanceEntries={sidebarInstanceEntries}
            showFavorites
            {...(selectableUnavailableInstanceIds ? { selectableUnavailableInstanceIds } : {})}
            {...(lockedDisabledInstanceIds
              ? {
                  disabledInstanceIds: lockedDisabledInstanceIds,
                  getDisabledInstanceTooltip: (entry: ProviderInstanceEntry) =>
                    t.composer.modelPicker.providerLockedHint(entry.displayName),
                }
              : {})}
          />
        )}

        <Combobox<string, boolean>
          inline
          items={allItemKeys}
          filteredItems={filteredItemKeys}
          filter={null}
          autoHighlight
          open
          virtualized
          multiple={onToggleModel !== undefined}
          value={onToggleModel ? [...selectedModelKeySet] : activeModelKey}
          onItemHighlighted={(modelKey, eventDetails) => {
            highlightedModelKeyRef.current = typeof modelKey === "string" ? modelKey : null;
            alignModelHighlightRef.current?.(eventDetails.reason !== "none");
            if (eventDetails.reason === "keyboard" && eventDetails.index >= 0) {
              void modelListRef.current?.scrollIndexIntoView?.({
                index: eventDetails.index,
                animated: false,
              });
            }
          }}
          onValueChange={(value, details) => {
            const modelKey = Array.isArray(value)
              ? (value.find((key) => !selectedModelKeySet.has(key)) ??
                [...selectedModelKeySet].find((key) => !value.includes(key)))
              : value;
            if (typeof modelKey !== "string") {
              return;
            }
            const legacyInstanceId = parseModelPickerLegacySectionKey(modelKey);
            if (legacyInstanceId) {
              toggleLegacySection(legacyInstanceId);
              return;
            }
            const model = parseModelPickerModelKey(modelKey);
            if (model) {
              handleModelSelect(
                model.slug,
                model.instanceId,
                "shiftKey" in details.event && details.event.shiftKey === true,
              );
            }
          }}
        >
          <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden p-2.5">
            <div className="composer-model-search">
              <SearchIcon className="size-3.25 shrink-0" aria-hidden="true" />
              <ComboboxPrimitive.Input
                ref={searchInputRef}
                className="min-w-0 flex-1 outline-none"
                aria-label={t.composer.modelPicker.searchPlaceholder}
                placeholder={t.composer.modelPicker.searchPlaceholder}
                value={searchQuery}
                onChange={(e) => {
                  if (!isSearching) setSearchHeight(pickerContentRef.current?.offsetHeight ?? 0);
                  setSearchQuery(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.nativeEvent.isComposing || e.keyCode === 229) {
                    (
                      e as typeof e & { preventBaseUIHandler?: () => void }
                    ).preventBaseUIHandler?.();
                    e.stopPropagation();
                    return;
                  }
                  if (
                    showSidebar &&
                    !e.altKey &&
                    !e.ctrlKey &&
                    !e.metaKey &&
                    ((e.key === "ArrowLeft" && !e.shiftKey && searchQuery.length === 0) ||
                      (e.key === "Tab" && e.shiftKey))
                  ) {
                    const sidebar = e.currentTarget
                      .closest("[data-model-picker-content]")
                      ?.querySelector("[data-model-picker-sidebar]");
                    const button =
                      sidebar?.querySelector<HTMLButtonElement>(
                        'button[aria-pressed="true"]:not(:disabled)',
                      ) ?? sidebar?.querySelector<HTMLButtonElement>("button:not(:disabled)");
                    if (button) {
                      e.preventDefault();
                      e.stopPropagation();
                      button.focus();
                      return;
                    }
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    e.stopPropagation();
                    onRequestClose?.();
                    return;
                  }
                  if (e.key === "Enter" && highlightedModelKeyRef.current) {
                    (
                      e as typeof e & { preventBaseUIHandler?: () => void }
                    ).preventBaseUIHandler?.();
                    e.preventDefault();
                    e.stopPropagation();
                    const legacyInstanceId = parseModelPickerLegacySectionKey(
                      highlightedModelKeyRef.current,
                    );
                    if (legacyInstanceId) {
                      toggleLegacySection(legacyInstanceId);
                      return;
                    }
                    const model = parseModelPickerModelKey(highlightedModelKeyRef.current);
                    if (model) {
                      handleModelSelect(model.slug, model.instanceId, e.shiftKey);
                    }
                    return;
                  }
                  e.stopPropagation();
                }}
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
              />
            </div>

            <ModelPickerList
              listRef={modelListRef}
              itemKeys={filteredItemKeys}
              extraData={modelListExtraData}
              highlightedKeyRef={highlightedModelKeyRef}
              alignHighlightRef={alignModelHighlightRef}
              prepareLegacyResizeRef={prepareLegacyResizeRef}
              renderItem={({ item: modelKey, index }) => {
                if (legacySection?.key === modelKey) {
                  return (
                    <ComboboxItem
                      hideIndicator
                      index={index}
                      value={modelKey}
                      data-model-picker-key={modelKey}
                      aria-expanded={legacySection.isExpanded}
                      className="group w-full cursor-pointer"
                    >
                      <div className="min-w-0 flex-1 text-left">
                        <div className="text-xs font-medium leading-snug">
                          {t.composer.modelPicker.legacy}
                        </div>
                        <div className="mt-1 text-xs font-normal leading-snug text-muted-foreground/70">
                          {t.composer.modelPicker.modelCount(legacySection.legacyModels.length)}
                        </div>
                      </div>
                      <ModelLegacyArrow expanded={legacySection.isExpanded} />
                    </ComboboxItem>
                  );
                }
                const model = filteredModelByKey.get(modelKey);
                if (!model) {
                  return null;
                }
                const disabledReason =
                  getModelDisabledReason?.(model.instanceId, model.slug) ?? null;
                return (
                  <ModelListRow
                    key={modelKey}
                    index={index}
                    slug={model.slug}
                    name={model.name}
                    subProvider={model.subProvider}
                    instanceId={model.instanceId}
                    driverKind={model.driverKind}
                    providerDisplayName={model.instanceDisplayName}
                    providerAccentColor={model.instanceAccentColor}
                    acpRegistryAgentId={model.acpRegistryAgentId}
                    acpRegistryIconUrl={model.acpRegistryIconUrl}
                    isFavorite={favoritesSet.has(providerModelKey(model.instanceId, model.slug))}
                    selectionRequest={
                      selectionRequest?.key === modelKey ? selectionRequest : undefined
                    }
                    isSelected={
                      selectedModelKeys !== undefined
                        ? selectedModelKeySet.has(modelKey)
                        : modelKey === activeModelKey
                    }
                    showInstanceBadge={badgedInstanceIds.has(model.instanceId)}
                    showProvider
                    showNewBadge={model.badge === "new"}
                    unavailable={model.isUnavailable === true}
                    jumpLabel={modelJumpLabelByKey.get(modelKey) ?? null}
                    disabledReason={disabledReason}
                    onToggleFavorite={toggleFavorite}
                  />
                );
              }}
            />
            <ModelPickerProviderNotices
              setupEntries={providerSetupEntries}
              updateRequiredNotices={updateRequiredNotices}
              emptyLabel={
                selectedInstanceId === "favorites" && !isSearching
                  ? "No favorites yet"
                  : t.composer.modelPicker.empty
              }
              onRequestClose={onRequestClose}
              onOpenProviderSetup={onOpenProviderSetup}
            />
            {onToggleModel ? (
              <div className="composer-model-worktree-note">
                <GitForkIcon className="size-3.25 shrink-0" aria-hidden="true" />
                <span>{t.chat.branchToolbar.modelWorktreeHint}</span>
              </div>
            ) : null}
          </div>
        </Combobox>
      </div>
    </TooltipProvider>
  );
});
