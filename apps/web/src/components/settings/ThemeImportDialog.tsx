/** Imports themes from search, JSON, or files while preserving batch and conflict handling. */
import { t } from "~/i18n";
import { DownloadIcon } from "lucide-react";
import type { ChangeEvent, DragEvent } from "react";
import { settlePromise } from "@t3tools/client-runtime/state/runtime";
import { useEffect, useRef, useState } from "react";
import { cn } from "../../lib/utils";
import {
  getCustomThemes,
  installCustomTheme,
  parseThemeFile,
  removeCustomTheme,
  THEME_FILE_VERSION,
  updateCustomTheme,
  type ThemeDefinition,
} from "../../themePalette";
import {
  humanizeThemeName,
  isVsCodeThemeFile,
  pairVsCodeThemes,
  parseVsCodeThemeFile,
  resolveThemeLabelCollisions,
} from "../../vscodeThemeImport";
import { Alert } from "../ui/alert";
import { Button } from "../ui/button";
import { Toggle, ToggleGroup } from "../ui/toggle-group";
import { Dialog, DialogHeader, DialogPanel, DialogPopup, DialogTitle } from "../ui/dialog";
import { ThemeSearchSection } from "./ThemeSearchSection";

/**
 * A full theme export is a few KB, so anything past this is not a theme file.
 * The guard runs on the size before the bytes are ever read: a large file
 * would otherwise be pulled into memory, parsed, and rendered, which
 * locks the UI for as long as that takes.
 */
export const MAX_THEME_FILE_BYTES = 256 * 1024;

/** Formats a byte count for file-size validation messages. */
function formatByteSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return t.settings.themeImport.bytes(bytes);
}

/** Returns the error to show for a file too large to be a theme, else null. */
export function describeOversizedThemeFile(bytes: number): string | null {
  if (bytes <= MAX_THEME_FILE_BYTES) return null;
  return t.settings.themeImport.fileThemeFilesFewKbHint(
    formatByteSize(bytes),
    formatByteSize(MAX_THEME_FILE_BYTES),
  );
}

/** Edits raw JSON without transforming its content; the caller owns parsing and errors. */
function ThemeJsonEditor({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="ov1-theme-json">
      <textarea
        aria-label={t.settings.themeImport.themeJson}
        className="block min-h-21 w-full resize-y overflow-auto bg-transparent px-3.5 py-2.5 font-mono text-secondary-copy leading-relaxed text-secondary-label caret-foreground outline-none placeholder:text-placeholder selection:bg-primary selection:text-primary-foreground"
        id={id}
        onChange={(event) => onChange(event.currentTarget.value)}
        placeholder={
          '{\n  "version": 1,\n  "name": "Aurora",\n  "appearance": "light",\n  "colors": { ... }\n}'
        }
        spellCheck={false}
        value={value}
      />
    </div>
  );
}

/** What the import pipeline needs from a file; DOM File satisfies it. */
type ImportableThemeFile = { name: string; size: number; text: () => Promise<string> };

interface ThemeImportCallbacks {
  onImported: (theme: ThemeDefinition) => boolean;
  onImportedMany: (themes: ReadonlyArray<ThemeDefinition>, context: { updated: boolean }) => void;
}

/** Controls a fresh abortable import session per opening; successful imports reach the supplied activation or batch callbacks. */
export function ThemeImportDialog({
  open,
  onOpenChange,
  onImported,
  onImportedMany,
}: ThemeImportCallbacks & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [session, setSession] = useState<{ id: number; controller: AbortController } | null>(null);
  // Parent closure and unmount must cancel too; each setup gets a fresh controller after StrictMode cleanup.
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    // oxlint-disable-next-line react/set-state-in-effect -- Publish a fresh session because effect cleanup irreversibly aborts its controller.
    setSession((previous) => ({ id: (previous?.id ?? 0) + 1, controller }));
    return () => controller.abort();
  }, [open]);
  const close = () => {
    session?.controller.abort();
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) onOpenChange(true);
        else close();
      }}
    >
      <DialogPopup size="wide">
        <DialogHeader>
          <DialogTitle>{t.settings.themeImport.importTitle}</DialogTitle>
        </DialogHeader>
        {session && (
          <ThemeImportBody
            key={session.id}
            session={session.controller}
            onClose={close}
            onImported={onImported}
            onImportedMany={onImportedMany}
          />
        )}
      </DialogPopup>
    </Dialog>
  );
}

/** Owns file drafts and conflict choices for one session; ignores results after cancellation and reports read or install failures inline. */
function ThemeImportBody({
  session,
  onClose,
  onImported,
  onImportedMany,
}: ThemeImportCallbacks & {
  session: AbortController;
  onClose: () => void;
}) {
  const { signal } = session;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [json, setJson] = useState("");
  const [importMode, setImportMode] = useState<"json" | "file">("json");
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isReading, setIsReading] = useState(false);
  const [isDropTarget, setIsDropTarget] = useState(false);
  // Imports whose id is already installed wait here for an update-or-copy
  // decision instead of failing.
  const [conflicts, setConflicts] = useState<ReadonlyArray<ThemeDefinition> | null>(null);
  // A newer read supersedes an older one still in flight.
  const importRequestRef = useRef(0);
  const isCurrentRequest = (requestId: number) =>
    requestId === importRequestRef.current && !signal.aborted;

  const readThemeFile = async (file: ImportableThemeFile) => {
    // Check the size first: reading a large file is what locks the UI, so it
    // never gets read at all.
    const oversized = describeOversizedThemeFile(file.size);
    if (oversized) {
      setError(oversized);
      return;
    }

    const requestId = ++importRequestRef.current;
    setIsReading(true);
    const fileText = await settlePromise(() => file.text());
    if (!isCurrentRequest(requestId)) return;
    setIsReading(false);
    if (fileText._tag === "Failure") {
      setError(t.settings.themeImport.readFilePasteJsonBelowError);
      return;
    }
    setJson(fileText.value);
    setFileName(file.name);
    setError(null);
  };

  const readThemeBatch = (files: ReadonlyArray<ImportableThemeFile>) => {
    const requestId = ++importRequestRef.current;
    setIsReading(true);
    return installThemeBatch(files, requestId).finally(() => {
      if (isCurrentRequest(requestId)) setIsReading(false);
    });
  };

  const installThemeBatch = async (
    files: ReadonlyArray<ImportableThemeFile>,
    requestId: number,
  ) => {
    const failures: string[] = [];
    const parsed: Array<{ theme: ThemeDefinition; sourceName: string }> = [];
    for (const file of files) {
      const oversized = describeOversizedThemeFile(file.size);
      if (oversized) {
        failures.push(t.settings.themeImport.tooLarge(file.name));
        continue;
      }
      try {
        const value: unknown = JSON.parse(await file.text());
        parsed.push({
          sourceName: file.name,
          theme: isVsCodeThemeFile(value) ? parseVsCodeThemeFile(value) : parseThemeFile(value),
        });
      } catch (cause) {
        failures.push(
          t.settings.themeImport.fileReadError(
            file.name,
            Boolean(cause instanceof Error),
            cause instanceof Error ? cause.message : undefined,
          ),
        );
      }
    }
    if (!isCurrentRequest(requestId)) return;
    const installed: ThemeDefinition[] = [];
    const conflicting: ThemeDefinition[] = [];
    for (const theme of pairVsCodeThemes(resolveThemeLabelCollisions(parsed))) {
      if (getCustomThemes().some((existing) => existing.id === theme.id)) {
        conflicting.push(theme);
        continue;
      }
      try {
        installed.push(installCustomTheme(theme));
      } catch (cause) {
        failures.push(
          t.settings.themeImport.installError(
            theme.label,
            Boolean(cause instanceof Error),
            cause instanceof Error ? cause.message : undefined,
          ),
        );
      }
    }
    if (installed.length > 0) onImportedMany(installed, { updated: false });
    setError(failures.length > 0 ? failures.join("; ") : null);
    if (conflicting.length > 0) {
      setConflicts(conflicting);
    } else if (installed.length > 0 && failures.length === 0) {
      onClose();
    }
  };

  const readThemeFiles = (files: ReadonlyArray<ImportableThemeFile>) => {
    if (files.length === 0) return;
    if (files.length === 1) void readThemeFile(files[0]!);
    else void readThemeBatch(files);
  };

  // On desktop the native picker opens in ~/.vscode/extensions (when it
  // exists) and reads the files in the main process; the browser input is
  // the fallback everywhere else.
  const openFilePicker = () => {
    const bridge = window.desktopBridge;
    if (bridge) {
      void bridge.pickThemeFiles().then((picked) => {
        if (!picked || picked.length === 0) return;
        readThemeFiles(
          picked.map((file) => ({
            name: file.name,
            size: file.size,
            text: () => Promise.resolve(file.text),
          })),
        );
      });
      return;
    }
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.currentTarget.files ?? [])];
    event.currentTarget.value = "";
    readThemeFiles(files);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDropTarget(false);
    readThemeFiles([...event.dataTransfer.files]);
  };

  /** Copy of an already-installed theme under the source file's name when
   *  that differs (Dracula Soft), else the next free "Name (1)". */
  const versionedCopy = (
    theme: ThemeDefinition,
    preferredName?: string | null,
  ): ThemeDefinition => {
    if (preferredName && preferredName.toLowerCase() !== theme.label.toLowerCase()) {
      const candidate = parseThemeFile({
        version: THEME_FILE_VERSION,
        name: preferredName.slice(0, 48),
        appearance: theme.appearance,
        colors: theme.colors,
        ...(theme.variants ? { variants: theme.variants } : {}),
        ...(theme.managed ? { managed: true } : {}),
      });
      if (!getCustomThemes().some((existing) => existing.id === candidate.id)) return candidate;
    }
    for (let copy = 1; copy < 100; copy += 1) {
      const candidate = parseThemeFile({
        version: THEME_FILE_VERSION,
        name: `${theme.label.slice(0, 48 - ` (${copy})`.length)} (${copy})`,
        appearance: theme.appearance,
        colors: theme.colors,
        ...(theme.variants ? { variants: theme.variants } : {}),
        ...(theme.managed ? { managed: true } : {}),
      });
      if (getCustomThemes().some((existing) => existing.id === candidate.id)) continue;
      return candidate;
    }
    throw new Error(t.settings.themeImport.tooManyCopiesOf(theme.label));
  };

  const resolveConflicts = (mode: "update" | "copy") => {
    if (!conflicts) return;
    const resolved: ThemeDefinition[] = [];
    const failures: string[] = [];
    const preferredName =
      conflicts.length === 1 && fileName
        ? humanizeThemeName(fileName.replace(/\.[^.]+$/, ""))
        : null;
    for (const theme of conflicts) {
      try {
        const existingTheme =
          mode === "update"
            ? getCustomThemes().find((candidate) => candidate.id === theme.id)
            : undefined;
        const themeToUpdate = existingTheme?.collection
          ? { ...theme, collection: existingTheme.collection }
          : theme;
        resolved.push(
          mode === "update"
            ? updateCustomTheme(themeToUpdate)
            : installCustomTheme(versionedCopy(theme, preferredName)),
        );
      } catch (cause) {
        failures.push(
          t.settings.themeImport.conflictError(
            theme.label,
            Boolean(cause instanceof Error),
            cause instanceof Error ? cause.message : undefined,
          ),
        );
      }
    }
    if (resolved.length > 0) onImportedMany(resolved, { updated: mode === "update" });
    setConflicts(null);
    if (failures.length > 0) setError([error, ...failures].filter(Boolean).join("; "));
    else if (!error) onClose();
  };

  const handleSubmit = () => {
    // Pasted text bypasses the file guard, so the same limit applies here.
    const oversized = describeOversizedThemeFile(json.length);
    if (oversized) {
      setError(oversized);
      return;
    }
    try {
      const parsed: unknown = JSON.parse(json);
      // VS Code themes are converted on the way in; anything else has to be
      // one of our own files.
      const theme = isVsCodeThemeFile(parsed)
        ? parseVsCodeThemeFile(parsed)
        : parseThemeFile(parsed);
      if (getCustomThemes().some((existing) => existing.id === theme.id)) {
        setError(null);
        setConflicts([theme]);
        return;
      }
      const installedTheme = installCustomTheme(theme);
      if (!onImported(installedTheme)) {
        // Roll the install back so a retry can run it again instead of
        // failing on the already-taken theme id.
        try {
          removeCustomTheme(installedTheme.id);
        } catch {
          // Storage is failing wholesale; the error below covers it.
        }
        setError(t.settings.themeImport.themeAddedButSelectedTryError);
        return;
      }
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : t.settings.themeImport.thatThemeFileIsInvalid,
      );
    }
  };

  return (
    <DialogPanel>
      <ThemeSearchSection
        onInstalled={(themes, context) => {
          onImportedMany(themes, context);
          onClose();
        }}
        signal={signal}
      />

      <div className="flex items-center gap-3" aria-hidden>
        <div className="h-px flex-1 bg-border" />
        <span className="text-muted-foreground text-2xs uppercase tracking-wider">
          {t.settings.themeImport.orImportAFile}
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>

      {(() => {
        const dropHandlers = {
          onDragEnter: (event: DragEvent<HTMLDivElement>) => {
            event.preventDefault();
            setIsDropTarget(true);
          },
          onDragOver: (event: DragEvent<HTMLDivElement>) => {
            event.preventDefault();
            setIsDropTarget(true);
          },
          onDragLeave: (event: DragEvent<HTMLDivElement>) => {
            // Ignore moves between children of the drop zone.
            if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
            setIsDropTarget(false);
          },
          onDrop: handleDrop,
        };
        const fileInput = (
          <input
            ref={fileInputRef}
            accept=".json,application/json"
            className="sr-only"
            onChange={handleFileChange}
            multiple
            type="file"
          />
        );
        const chooseButton = (label = t.settings.themeImport.chooseFiles) => (
          <Button disabled={isReading} size="sm" variant="outline" onClick={openFilePicker}>
            <DownloadIcon />
            {isReading ? t.settings.themeImport.reading : label}
          </Button>
        );
        const editorSection = () => (
          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-3">
              <label className="sr-only" htmlFor="theme-json-editor">
                {t.settings.themeImport.themeJson}
              </label>
            </div>
            <ThemeJsonEditor id="theme-json-editor" onChange={setJson} value={json} />
          </div>
        );
        if (conflicts) {
          return (
            <div className="space-y-3">
              <div className="rounded-ov1-option bg-ov1-option-surface p-3">
                <p className="text-sm font-medium">{t.settings.themeImport.alreadyInstalled}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {conflicts.map((theme) => theme.label).join(", ")}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" onClick={() => resolveConflicts("update")}>
                  {t.settings.themeImport.updateExisting}
                </Button>
                <Button size="sm" variant="outline" onClick={() => resolveConflicts("copy")}>
                  {t.settings.themeImport.keepBoth}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConflicts(null)}>
                  {t.settings.actions.back}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onClose()}>
                  {t.settings.actions.cancel}
                </Button>
              </div>
            </div>
          );
        }
        return (
          <div className="space-y-3">
            <ToggleGroup
              size="dialog"
              aria-label={t.settings.themeImport.importSource}
              value={[importMode]}
              onValueChange={(next) => {
                if (next[0] === "json" || next[0] === "file") setImportMode(next[0]);
              }}
            >
              <Toggle value="json">{t.settings.themeImport.themeJson}</Toggle>
              <Toggle value="file">{t.settings.themeImport.themeFile}</Toggle>
            </ToggleGroup>
            <div hidden={importMode !== "file"}>
              <div
                className={cn("ov1-theme-file", isDropTarget && "inset-shadow-selected-control")}
                {...dropHandlers}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">{t.settings.themeImport.themeFile}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {fileName ?? t.settings.themeImport.dropT3CodeOrVsCodeJsonFiles}
                  </p>
                </div>
                {chooseButton()}
                {fileInput}
              </div>
            </div>
            <div hidden={importMode !== "json"}>{editorSection()}</div>
            {/* The actions live with the import section, not in a DialogFooter,
                    because Import only applies to the file in this section. Pinning
                    them at the modal bottom would read as a modal-scoped action when
                    the dialog also has the search and conflict views. */}
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="dialog-action" onClick={() => onClose()}>
                {t.settings.actions.cancel}
              </Button>
              <Button
                size="dialog-action-wide"
                disabled={!json.trim() || isReading}
                onClick={handleSubmit}
              >
                {t.settings.themeImport.importAction}
              </Button>
            </div>
          </div>
        );
      })()}

      {error ? (
        <Alert aria-live="polite" variant="error">
          {error}
        </Alert>
      ) : null}
    </DialogPanel>
  );
}
