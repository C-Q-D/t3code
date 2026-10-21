/** Appearance theme library; compact M3 cards retain theme selection, collection, import, and editor actions. */
import { t } from "~/i18n";
import {
  CheckIcon,
  CopyIcon,
  MoonIcon,
  MoreHorizontalIcon,
  PenLineIcon,
  PlusIcon,
  SunIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react";
import { useState } from "react";
import { useEnvironmentThemeDefinitions } from "../../hooks/useEnvironmentTheme";
import { readThemeHalvesRaw } from "../../hooks/useTheme";
import { cn } from "../../lib/utils";
import {
  getThemeDefinition,
  singleAppearanceOf,
  getThemeModes,
  removeCustomThemes,
  serializeThemeFile,
  type ThemeAppearance,
  type ThemeDefinition,
  type ThemeHalves,
  GRAPHITE_THEME,
  T3_CHAT_THEME,
  EMBER_THEME,
  GROVE_THEME,
  IRIS_THEME,
  OCEAN_THEME,
} from "../../themePalette";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { Button } from "../ui/button";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { Tooltip, TooltipPopup, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { ThemeImportDialog } from "./ThemeImportDialog";
import { searchableSetting } from "./settingsSearch";
import { useThemeEditorStore } from "./themeEditorStore";
import {
  STANDARD_THEME_CARDS,
  getThemeCardDefinition,
  ThemePreviewCircles,
  ThemePreviewCircle,
  type ThemeCardDefinition,
  type ThemeMode,
} from "./ThemePreviewCircles";
import { SettingsRow } from "./settingsLayout";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";
import { Menu, MenuTrigger, MenuPopup, MenuItem, MenuRadioGroup, MenuRadioItem } from "../ui/menu";

const MAINTAINER_THEMES: ReadonlyArray<ThemeDefinition> = [
  GRAPHITE_THEME,
  T3_CHAT_THEME,
  GROVE_THEME,
  OCEAN_THEME,
  EMBER_THEME,
  IRIS_THEME,
];

function collectionVariantLabels(themes: ReadonlyArray<ThemeDefinition>): ReadonlyArray<string> {
  if (themes.length === 0) return [];
  const words = themes.map((theme) => theme.label.trim().split(/\s+/));
  const firstWords = words[0]!;
  const sharedWordCount = firstWords.findIndex((word, index) =>
    words.some((labelWords) => labelWords[index]?.toLocaleLowerCase() !== word.toLocaleLowerCase()),
  );
  const prefixLength = sharedWordCount === -1 ? firstWords.length - 1 : sharedWordCount;

  return themes.map((theme, index) => {
    const shortLabel = words[index]?.slice(Math.max(0, prefixLength)).join(" ").trim();
    return shortLabel || theme.label;
  });
}

function downloadThemeFile(filename: string, contents: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  // Revoking synchronously can abort the download in some browsers; give the
  // browser time to open the stream first.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** M3 swatch card; menu actions keep collection variants and maintenance reachable by keyboard. */
function ThemeLibraryCard({
  theme,
  isActive,
  onUse,
  onUseMode,
  activeModes,
  onEdit,
  onDuplicate,
  onDownload,
  onRemove,
  variantNavigation,
}: {
  theme: ThemeCardDefinition;
  isActive: boolean;
  onUse: () => void;
  onUseMode: (mode: ThemeMode) => void;
  activeModes: ReadonlyArray<ThemeMode>;
  onEdit?: () => void;
  onDuplicate?: () => void;
  onDownload?: () => void;
  onRemove?: () => void;
  variantNavigation?: {
    collectionLabel: string;
    options: ReadonlyArray<{
      themeIndex: number;
      label: string;
      activeModes: ReadonlyArray<ThemeMode>;
      preview: ThemeCardDefinition["previews"][number];
    }>;
    onSelectAndUse: (themeIndex: number, mode: ThemeAppearance) => void;
  };
}) {
  const preview = theme.previews.find((item) => item.mode === "dark") ?? theme.previews[0];
  const cardLabel = variantNavigation?.collectionLabel ?? theme.label;
  return (
    <div
      className={cn(
        "relative flex h-21 min-w-0 flex-col justify-between rounded-settings-row-surface bg-card px-3 py-2.5 shadow-settings-theme-card",
        isActive && "inset-shadow-selected-control",
      )}
      data-theme-library-card={theme.id}
      style={preview ? { backgroundColor: preview.colors.surface } : undefined}
    >
      <div className="relative z-10 flex min-w-0 items-center justify-between gap-1">
        <ThemePreviewCircles
          label={cardLabel}
          activeModes={activeModes}
          onSelectMode={onUseMode}
          previews={theme.previews}
        />
        {variantNavigation || onDuplicate || onDownload || onRemove ? (
          <Menu>
            <MenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-micro"
                  aria-label={`${cardLabel}: ${t.settings.appearance.themeActions}`}
                />
              }
            >
              <MoreHorizontalIcon />
            </MenuTrigger>
            <MenuPopup align="end">
              {/* Each appearance has its own selection; one radio group would conflate the two halves. */}
              {variantNavigation
                ? (["light", "dark"] as const).map((mode) => (
                    <MenuRadioGroup
                      key={mode}
                      aria-label={
                        mode === "light"
                          ? t.settings.rows.browserDefaultAppearance.options.light
                          : t.settings.rows.browserDefaultAppearance.options.dark
                      }
                      value={
                        variantNavigation.options.find(
                          (option) =>
                            option.preview.mode === mode && option.activeModes.includes(mode),
                        )?.themeIndex ?? -1
                      }
                      onValueChange={(themeIndex) => {
                        if (typeof themeIndex === "number")
                          variantNavigation.onSelectAndUse(themeIndex, mode);
                      }}
                    >
                      {variantNavigation.options
                        .filter((option) => option.preview.mode === mode)
                        .map((option) => (
                          <MenuRadioItem
                            closeOnClick
                            density="compact"
                            key={option.themeIndex}
                            value={option.themeIndex}
                            aria-label={t.settings.theme.variantAriaLabel(
                              option.label,
                              mode,
                              option.activeModes.includes(mode),
                            )}
                          >
                            <span className="flex items-center gap-2.5">
                              {mode === "light" ? <SunIcon /> : <MoonIcon />}
                              {option.label}
                              {option.activeModes.includes(mode) ? <CheckIcon /> : null}
                            </span>
                          </MenuRadioItem>
                        ))}
                    </MenuRadioGroup>
                  ))
                : null}
              {onDuplicate ? (
                <MenuItem density="compact" onClick={onDuplicate}>
                  <CopyIcon />
                  {t.settings.theme.duplicateTheme}
                </MenuItem>
              ) : null}
              {onDownload ? (
                <MenuItem density="compact" onClick={onDownload}>
                  <UploadIcon />
                  {t.settings.theme.exportThemeFile}
                </MenuItem>
              ) : null}
              {onRemove ? (
                <MenuItem density="compact" variant="destructive" onClick={onRemove}>
                  <Trash2Icon />
                  {variantNavigation ? t.settings.theme.removeThemes : t.settings.theme.removeTheme}
                </MenuItem>
              ) : null}
            </MenuPopup>
          </Menu>
        ) : null}
      </div>
      <div className="flex min-w-0 items-center gap-1.5">
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                onClick={onUse}
                aria-pressed={isActive}
                className="min-w-0 flex-1 cursor-pointer truncate text-left text-secondary-copy-medium font-semibold text-foreground outline-none after:absolute after:inset-0 after:rounded-settings-row-surface focus-visible:after:inset-shadow-focus"
              />
            }
          >
            {cardLabel}
          </TooltipTrigger>
          <TooltipPopup>
            {cardLabel} ·{" "}
            {theme.previews.length > 1
              ? t.settings.theme.applyBothModes
              : t.settings.theme.applySingleMode(theme.previews[0]?.mode)}
          </TooltipPopup>
        </Tooltip>
        {onEdit || (isActive && onDuplicate) ? (
          <span className="relative z-10">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-micro"
                    aria-label={
                      onEdit
                        ? t.settings.theme.edit(theme.label)
                        : t.settings.theme.duplicate(theme.label)
                    }
                    onClick={onEdit ?? onDuplicate}
                  />
                }
              >
                <PenLineIcon />
              </TooltipTrigger>
              <TooltipPopup>
                {onEdit ? t.settings.theme.editTheme : t.settings.theme.duplicateTheme}
              </TooltipPopup>
            </Tooltip>
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** Retains collection defaults and per-appearance variant selection in one compact card. */
function CustomThemeCollectionCard({
  themes,
  initialAppearance,
  activeModesFor,
  onUse,
  onUseMode,
  onDuplicate,
  onEdit,
  onDownload,
  onRemove,
}: {
  themes: ReadonlyArray<ThemeDefinition>;
  initialAppearance: ThemeAppearance;
  activeModesFor: (themeId: string) => ReadonlyArray<ThemeMode>;
  onUse: (theme: ThemeDefinition) => void;
  onUseMode: (theme: ThemeDefinition, mode: ThemeMode) => void;
  onDuplicate: (theme: ThemeDefinition) => void;
  onEdit: (theme: ThemeDefinition) => void;
  onDownload: (theme: ThemeDefinition) => void;
  onRemove: (theme: ThemeDefinition) => void;
}) {
  const [variantIndex, setVariantIndex] = useState(() => {
    const activeIndex = themes.findIndex((theme) => activeModesFor(theme.id).length > 0);
    return activeIndex < 0 ? 0 : activeIndex;
  });
  const safeIndex = Math.min(variantIndex, themes.length - 1);
  const theme = themes[safeIndex];

  if (variantIndex !== safeIndex) setVariantIndex(safeIndex);

  if (!theme) return null;
  const collectionLabel = theme.collection?.label ?? theme.label;
  const variantLabels = collectionVariantLabels(themes);
  const defaultLightTheme = themes.find((candidate) => getThemeModes(candidate).includes("light"));
  const defaultDarkTheme = themes.find((candidate) => getThemeModes(candidate).includes("dark"));
  const selectCollectionDefaults = () => {
    if (themes.length === 1) {
      onUse(theme);
      return;
    }
    if (defaultLightTheme) onUseMode(defaultLightTheme, "light");
    if (defaultDarkTheme) onUseMode(defaultDarkTheme, "dark");
    setVariantIndex(0);
  };

  return (
    <ThemeLibraryCard
      activeModes={activeModesFor(theme.id)}
      isActive={themes.some((candidate) =>
        activeModesFor(candidate.id).includes(initialAppearance),
      )}
      onDownload={() => onDownload(theme)}
      onDuplicate={() => onDuplicate(theme)}
      onEdit={() => onEdit(theme)}
      onRemove={() => onRemove(theme)}
      onUse={selectCollectionDefaults}
      onUseMode={(mode) => onUseMode(theme, mode)}
      theme={getThemeCardDefinition(theme)}
      {...(themes.length > 1
        ? {
            variantNavigation: {
              collectionLabel,
              options: themes.flatMap((variant, themeIndex) =>
                getThemeCardDefinition(variant).previews.map((preview) => ({
                  themeIndex,
                  label: variantLabels[themeIndex] ?? variant.label,
                  activeModes: activeModesFor(variant.id),
                  preview,
                })),
              ),
              onSelectAndUse: (themeIndex, mode) => {
                const selectedTheme = themes[themeIndex];
                if (!selectedTheme) return;
                setVariantIndex(themeIndex);
                onUseMode(selectedTheme, mode);
              },
            },
          }
        : {})}
    />
  );
}

/** Renders appearance mode and real theme entries; persistence failures retain their existing notifications. */
export function ThemeLibrary({
  theme,
  setTheme,
  appearanceMode,
  setAppearanceMode,
  customThemes,
  initialAppearance,
  refreshTheme,
  isImportOpen,
  onImportOpenChange,
  themeHalves,
  setThemeHalf,
}: {
  theme: string;
  setTheme: (theme: string) => boolean;
  appearanceMode: ThemeMode;
  setAppearanceMode: (mode: ThemeMode) => boolean;
  customThemes: ReadonlyArray<ThemeDefinition>;
  initialAppearance: ThemeAppearance;
  refreshTheme: () => void;
  isImportOpen: boolean;
  onImportOpenChange: (open: boolean) => void;
  themeHalves: ThemeHalves | null;
  setThemeHalf: (appearance: ThemeAppearance, themeId: string | null) => boolean;
}) {
  const openThemeEditor = useThemeEditorStore((store) => store.openThemeEditor);
  const environmentThemes = useEnvironmentThemeDefinitions();
  const [themeRemovalTarget, setThemeRemovalTarget] = useState<{
    theme: ThemeDefinition;
    collectionThemes: ReadonlyArray<ThemeDefinition>;
  } | null>(null);
  const [isThemeRemovalOpen, setIsThemeRemovalOpen] = useState(false);
  const [themeIdsToRemove, setThemeIdsToRemove] = useState<ReadonlyArray<string>>([]);
  const themeIdsToRemoveSet = new Set(themeIdsToRemove);
  const removeDialogTheme = themeRemovalTarget?.theme;
  const removeDialogCollectionThemes = themeRemovalTarget?.collectionThemes ?? [];
  const canRemoveCollection = removeDialogCollectionThemes.length > 1;
  const removeDialogCollectionLabel =
    removeDialogTheme?.collection?.label ?? removeDialogTheme?.label;

  const notifyThemeSaveFailure = () => {
    toastManager.add(
      stackedThreadToast({
        type: "error",
        title: t.settings.theme.couldnTSaveThemeSelection,
        description: t.settings.restore.retryHint,
      }),
    );
  };

  const notifyThemeRemovalFailure = () => {
    toastManager.add(
      stackedThreadToast({
        type: "error",
        title: t.settings.theme.couldnTRemoveTheme,
        description: t.settings.restore.retryHint,
      }),
    );
  };

  const persistTheme = (nextTheme: string) => {
    const didSave = setTheme(nextTheme);
    if (!didSave) notifyThemeSaveFailure();
    return didSave;
  };

  const handleRemoveTheme = (
    customTheme: ThemeDefinition,
    collectionThemes: ReadonlyArray<ThemeDefinition>,
  ) => {
    setThemeRemovalTarget({ theme: customTheme, collectionThemes });
    setThemeIdsToRemove(collectionThemes.length > 1 ? [] : [customTheme.id]);
    setIsThemeRemovalOpen(true);
  };

  const handleConfirmRemoveTheme = () => {
    if (!themeRemovalTarget) return;
    const removedIds = new Set(themeIdsToRemove);
    if (removedIds.size === 0) return;
    const removesBase = removedIds.has(getThemeDefinition(theme)?.id ?? "");
    // Captured raw before persistTheme clears the mix: a half naming a
    // published theme whose set has not streamed in yet is pruned from the
    // `themeHalves` prop, and rebuilding from that would drop it.
    const storedHalves = readThemeHalvesRaw();
    if (removesBase && !persistTheme(appearanceMode === "system" ? "system" : appearanceMode)) {
      return;
    }
    for (const appearance of ["light", "dark"] as const) {
      const half = storedHalves[appearance];
      if (half === undefined) continue;
      const next = half && removedIds.has(half) ? null : removesBase ? half : undefined;
      if (next !== undefined && !setThemeHalf(appearance, next)) {
        notifyThemeRemovalFailure();
        return;
      }
    }
    try {
      removeCustomThemes([...removedIds]);
    } catch {
      notifyThemeRemovalFailure();
      return;
    }
    setIsThemeRemovalOpen(false);
  };

  const baseCardId = getThemeDefinition(theme)?.id ?? null;
  const lightOwner = themeHalves?.light ?? baseCardId;
  const darkOwner = themeHalves?.dark ?? baseCardId;

  const assignHalf = (appearance: ThemeAppearance, cardId: string | null) => {
    const otherAppearance = appearance === "light" ? "dark" : "light";
    // Picking the default over a themed base cannot be stored as a half:
    // the base would still own that appearance. Convert the base into an
    // explicit half on the other side so this side falls back to default.
    if (cardId === null && baseCardId !== null) {
      // Read raw, before persistTheme clears the mix: the other half may
      // name a published theme that has not streamed in yet, and falling
      // back to the base would silently rewrite it.
      const otherOwner = readThemeHalvesRaw()[otherAppearance] ?? baseCardId;
      if (!persistTheme(appearanceMode === "system" ? "system" : appearanceMode)) return;
      if (!setThemeHalf(otherAppearance, otherOwner)) {
        setTheme(theme);
        notifyThemeSaveFailure();
      }
      return;
    }
    if (!setThemeHalf(appearance, cardId)) {
      notifyThemeSaveFailure();
    }
  };

  const activeThemeForAppearance =
    getThemeDefinition((initialAppearance === "light" ? lightOwner : darkOwner) ?? "") ?? null;

  const setMode = (mode: ThemeMode) => {
    if (!setAppearanceMode(mode)) notifyThemeSaveFailure();
  };

  // Compact swatches still assign light and dark halves independently.
  const handlePairPick = (cardId: string | null) => (mode: ThemeMode) => {
    if (mode === "system") return;
    assignHalf(mode, cardId);
  };

  const pickedModesFor = (cardId: string | null): ThemeMode[] => {
    const rings: ThemeMode[] = [];
    if (lightOwner === cardId) rings.push("light");
    if (darkOwner === cardId) rings.push("dark");
    return rings;
  };

  const renderModeControl = () => (
    <ToggleGroup
      size="settings"
      value={[appearanceMode]}
      aria-label={t.settings.theme.appearanceMode}
      onValueChange={(values) => {
        const mode = values[0];
        if (mode === "system" || mode === "light" || mode === "dark") setMode(mode);
      }}
    >
      <ToggleGroupItem value="system">
        {t.settings.rows.browserDefaultAppearance.options.system}
      </ToggleGroupItem>
      <ToggleGroupItem value="light">
        {t.settings.rows.browserDefaultAppearance.options.light}
      </ToggleGroupItem>
      <ToggleGroupItem value="dark">
        {t.settings.rows.browserDefaultAppearance.options.dark}
      </ToggleGroupItem>
    </ToggleGroup>
  );

  const customThemeCollections = [
    ...customThemes
      .reduce((groups, customTheme) => {
        const groupId = customTheme.collection
          ? `collection:${customTheme.collection.id}`
          : `theme:${customTheme.id}`;
        const group = groups.get(groupId);
        if (group) group.push(customTheme);
        else groups.set(groupId, [customTheme]);
        return groups;
      }, new Map<string, ThemeDefinition[]>())
      .entries(),
  ];

  const renderPairGrid = () => (
    // One provider keeps tooltip handoffs immediate across cards and swatches.
    <TooltipProvider>
      <div className="settings-theme-grid grid w-full grid-cols-2 gap-2.5">
        {STANDARD_THEME_CARDS.map((standardTheme) => (
          <ThemeLibraryCard
            activeModes={pickedModesFor(null)}
            isActive={pickedModesFor(null).includes(initialAppearance)}
            key={standardTheme.id}
            onDuplicate={() =>
              openThemeEditor({
                editingThemeId: null,
                seedThemeId: null,
                seedName: `${standardTheme.label} copy`,
                initialAppearance,
              })
            }
            onUse={() => persistTheme(appearanceMode === "system" ? "system" : appearanceMode)}
            onUseMode={handlePairPick(null)}
            theme={standardTheme}
          />
        ))}
        {MAINTAINER_THEMES.map((maintainerTheme) => {
          const card = getThemeCardDefinition(maintainerTheme);
          return (
            <ThemeLibraryCard
              activeModes={pickedModesFor(maintainerTheme.id)}
              isActive={pickedModesFor(maintainerTheme.id).includes(initialAppearance)}
              key={maintainerTheme.id}
              onDuplicate={() =>
                openThemeEditor({
                  editingThemeId: null,
                  seedThemeId: maintainerTheme.id,
                  seedName: `${maintainerTheme.label} copy`,
                  initialAppearance,
                })
              }
              onUse={() => persistTheme(maintainerTheme.id)}
              onUseMode={handlePairPick(maintainerTheme.id)}
              theme={card}
            />
          );
        })}
        {environmentThemes
          .filter(
            // A saved theme with the same id wins resolution, so its card is
            // the one that must show; rendering both would also collide keys.
            (environmentTheme) => !customThemes.some((theme) => theme.id === environmentTheme.id),
          )
          .map((environmentTheme) => (
            <ThemeLibraryCard
              activeModes={pickedModesFor(environmentTheme.id)}
              isActive={pickedModesFor(environmentTheme.id).includes(initialAppearance)}
              key={environmentTheme.id}
              onDuplicate={() =>
                openThemeEditor({
                  editingThemeId: null,
                  seedThemeId: environmentTheme.id,
                  seedName: `${environmentTheme.label} copy`,
                  initialAppearance,
                })
              }
              onUse={() => {
                const half = singleAppearanceOf(environmentTheme);
                if (half === null) persistTheme(environmentTheme.id);
                else assignHalf(half, environmentTheme.id);
              }}
              onUseMode={handlePairPick(environmentTheme.id)}
              theme={getThemeCardDefinition(environmentTheme)}
            />
          ))}
        {customThemeCollections.map(([collectionId, themes]) => (
          <CustomThemeCollectionCard
            activeModesFor={pickedModesFor}
            key={collectionId}
            onDownload={(customTheme) =>
              downloadThemeFile(`${customTheme.id}.json`, serializeThemeFile(customTheme))
            }
            onDuplicate={(customTheme) =>
              openThemeEditor({
                editingThemeId: null,
                seedThemeId: customTheme.id,
                seedName: `${customTheme.label} copy`,
                initialAppearance,
              })
            }
            onEdit={(customTheme) =>
              openThemeEditor({
                editingThemeId: customTheme.id,
                seedThemeId: null,
                seedName: null,
                initialAppearance,
              })
            }
            onRemove={(customTheme) => handleRemoveTheme(customTheme, themes)}
            onUse={(customTheme) => {
              const modes = getThemeModes(customTheme);
              if (modes.length === 1) assignHalf(modes[0]!, customTheme.id);
              else persistTheme(customTheme.id);
            }}
            onUseMode={(customTheme, mode) => handlePairPick(customTheme.id)(mode)}
            themes={themes}
            initialAppearance={initialAppearance}
          />
        ))}
        <button
          type="button"
          className="settings-theme-action flex h-21 flex-col items-center justify-center gap-1.5 rounded-settings-row-surface text-secondary-copy-medium text-secondary-label outline-none hover:bg-secondary focus-visible:inset-shadow-focus"
          onClick={() => onImportOpenChange(true)}
        >
          <UploadIcon className="size-4" />
          {t.settings.appearance.importTheme}
        </button>
        <button
          type="button"
          className="settings-theme-action flex h-21 flex-col items-center justify-center gap-1.5 rounded-settings-row-surface text-secondary-copy-medium text-secondary-label outline-none hover:bg-secondary focus-visible:inset-shadow-focus"
          onClick={() =>
            openThemeEditor({
              editingThemeId: null,
              seedThemeId: activeThemeForAppearance?.id ?? null,
              seedName: null,
              initialAppearance,
            })
          }
        >
          <PlusIcon className="size-4" />
          {t.settings.appearance.newTheme}
        </button>
      </div>
    </TooltipProvider>
  );

  return (
    <>
      <SettingsRow {...searchableSetting("color-scheme")} control={renderModeControl()} />
      <SettingsRow {...searchableSetting("theme")}>{renderPairGrid()}</SettingsRow>
      <ThemeImportDialog
        onImportedMany={(importedThemes, { updated }) => {
          if (updated) refreshTheme();
          const verb = updated ? "updated" : "added";
          toastManager.add(
            stackedThreadToast({
              type: "success",
              title:
                importedThemes.length === 1
                  ? `${importedThemes[0]!.label} ${verb}`
                  : t.settings.theme.themes(importedThemes.length, verb),
              description: importedThemes.map((imported) => imported.label).join(", "),
            }),
          );
        }}
        onImported={(importedTheme) => {
          const modes = getThemeModes(importedTheme);
          if (modes.length === 1) {
            assignHalf(modes[0]!, importedTheme.id);
            toastManager.add(
              stackedThreadToast({
                type: "success",
                title: t.settings.theme.added(importedTheme.label),
                description: t.settings.theme.itSNowYourTheme(modes[0]!),
              }),
            );
            return true;
          }
          if (!persistTheme(importedTheme.id)) return false;
          toastManager.add(
            stackedThreadToast({
              type: "success",
              title: t.settings.theme.added(importedTheme.label),
              description: t.settings.theme.itSNowActive,
            }),
          );
          return true;
        }}
        onOpenChange={onImportOpenChange}
        open={isImportOpen}
      />
      <AlertDialog open={isThemeRemovalOpen} onOpenChange={setIsThemeRemovalOpen}>
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {canRemoveCollection
                ? t.settings.theme.removeCollectionConfirmation(removeDialogCollectionLabel)
                : t.settings.theme.removeThemeConfirmation(removeDialogTheme?.label)}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {canRemoveCollection
                ? t.settings.theme.selectVariantsWantRemoveRestoreHint
                : t.settings.theme.bringBackAnytimeImportingJsonHint}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {canRemoveCollection ? (
            <div className="grid max-h-72 grid-cols-1 gap-2 overflow-y-auto px-6 pb-6 sm:grid-cols-2">
              {removeDialogCollectionThemes.map((customTheme) => {
                const checked = themeIdsToRemoveSet.has(customTheme.id);
                const card = getThemeCardDefinition(customTheme);
                const checkboxId = `remove-theme-${customTheme.id}`;
                return (
                  <label
                    className={cn(
                      "relative flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border p-3",
                      checked
                        ? "border-ring bg-accent/20"
                        : "border-border/70 bg-muted/25 hover:bg-muted/40",
                    )}
                    htmlFor={checkboxId}
                    key={customTheme.id}
                  >
                    <span className="absolute right-2 top-2 inline-grid size-5 grid-cols-1 sm:size-4">
                      <input
                        checked={checked}
                        className="col-start-1 row-start-1 size-full appearance-none rounded-sm border border-input bg-background outline-none checked:border-primary checked:bg-primary focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring checked:focus-visible:inset-ring-3 checked:focus-visible:inset-ring-background dark:not-checked:bg-input/32 forced-colors:appearance-auto"
                        id={checkboxId}
                        name="themes-to-remove"
                        type="checkbox"
                        onChange={(event) => {
                          const shouldRemove = event.currentTarget.checked;
                          setThemeIdsToRemove((current) =>
                            shouldRemove
                              ? [...current, customTheme.id]
                              : current.filter((themeId) => themeId !== customTheme.id),
                          );
                        }}
                      />
                      <CheckIcon
                        className={cn(
                          "pointer-events-none col-start-1 row-start-1 size-3.5 shrink-0 self-center justify-self-center stroke-primary-foreground sm:size-3",
                          checked ? "opacity-100" : "opacity-0",
                        )}
                      />
                    </span>
                    <span className="flex min-h-12 items-center justify-center gap-1">
                      {card.previews.map((preview) => (
                        <span
                          className="flex size-11 shrink-0 items-center justify-center"
                          key={preview.mode}
                        >
                          <span className="flex scale-75">
                            <ThemePreviewCircle colors={preview.colors} mode={preview.mode} />
                          </span>
                        </span>
                      ))}
                    </span>
                    <p className="max-w-full truncate text-center text-base font-medium text-foreground sm:text-sm">
                      {customTheme.label}
                    </p>
                  </label>
                );
              })}
            </div>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" />}>
              {t.settings.actions.cancel}
            </AlertDialogClose>
            <Button
              disabled={themeIdsToRemove.length === 0}
              variant="destructive"
              onClick={handleConfirmRemoveTheme}
            >
              {canRemoveCollection
                ? t.settings.theme.removeSelected(
                    Boolean(themeIdsToRemove.length > 0),
                    themeIdsToRemove.length > 0 ? themeIdsToRemove.length : undefined,
                  )
                : t.settings.theme.removeTheme}
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </>
  );
}
