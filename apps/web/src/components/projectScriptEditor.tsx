/** Edits project script configuration and shortcuts while preserving command and keybinding values. */
import { t } from "~/i18n";
import {
  AuthOrchestrationOperateScope,
  AuthSettingsWriteScope,
  type EnvironmentId,
  type ProjectScript,
  type ProjectScriptIcon,
  type ResolvedKeybindingsConfig,
} from "@t3tools/contracts";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
  type AtomCommandResult,
} from "@t3tools/client-runtime/state/runtime";
import {
  BugIcon,
  FlaskConicalIcon,
  HammerIcon,
  ScanSearchIcon,
  CheckIcon,
  PlayIcon,
  Settings2Icon,
} from "lucide-react";
import React, {
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import {
  keybindingValueForCommand,
  decodeProjectScriptKeybindingRule,
} from "~/lib/projectScriptKeybindings";
import { keybindingFromKeyboardEvent } from "~/components/settings/KeybindingsSettings.logic";
import { commandForProjectScript, nextProjectScriptId } from "~/projectScripts";
import { readEnvironmentScope, useEnvironmentScope } from "~/state/session";
import { useComposerMenuState } from "./chat/useComposerMenuState";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Kbd } from "./ui/kbd";
import { formatShortcutKeycaps } from "../keybindings";
import { parseKeybindingShortcut } from "@t3tools/shared/keybindings";

const SCRIPT_ICONS: Array<{ id: ProjectScriptIcon; label: string }> = [
  { id: "play", label: t.app.scripts.play },
  { id: "test", label: t.app.scripts.test },
  { id: "lint", label: t.app.scripts.lint },
  { id: "configure", label: t.app.scripts.configure },
  { id: "build", label: t.app.scripts.build },
  { id: "debug", label: t.app.scripts.debug },
];

/** Maps each project action icon to the shared Lucide icon system. */
export function ScriptIcon({
  icon,
  className = "size-3.5",
}: {
  icon: ProjectScriptIcon;
  className?: string;
}) {
  if (icon === "test") return <FlaskConicalIcon className={className} />;
  if (icon === "lint") return <ScanSearchIcon className={className} />;
  if (icon === "configure") return <Settings2Icon className={className} />;
  if (icon === "build") return <HammerIcon className={className} />;
  if (icon === "debug") return <BugIcon className={className} />;
  return <PlayIcon className={className} />;
}

/** Editable action configuration; omitted keybinding preserves the existing shortcut. */
export interface NewProjectScriptInput {
  name: string;
  command: string;
  icon: ProjectScriptIcon;
  runOnWorktreeCreate: boolean;
  /** Setup scripts only: hold the agent until the script exits. */
  waitForSetup: boolean;
  runOnSettle: boolean;
  /** Omit to preserve the current shortcut when the form did not edit it. */
  keybinding?: string | null;
  /** Optional URL to open in the in-app preview when this script runs. */
  previewUrl: string | null;
  /** When true, automatically open the preview panel pointed at `previewUrl`. */
  autoOpenPreview: boolean;
}

/** Command result returned by the owner when an action is persisted. */
export type ProjectScriptActionResult = AtomCommandResult<void, unknown>;

export const EMPTY_PROJECT_SCRIPT_INPUT: NewProjectScriptInput = {
  name: "",
  command: "",
  icon: "play",
  runOnWorktreeCreate: false,
  waitForSetup: false,
  runOnSettle: false,
  keybinding: null,
  previewUrl: null,
  autoOpenPreview: false,
};

/** What the editor dialog should open with. `scriptId: null` means "add". */
export interface ProjectScriptEditorRequest {
  scriptId: string | null;
  initial: NewProjectScriptInput;
  /** Validation error to show immediately (e.g. a failed t3.json import). */
  error?: string;
}

/** Copies a persisted script and its resolved shortcut into an editor request. */
export function editorRequestForScript(
  script: ProjectScript,
  keybindings: ResolvedKeybindingsConfig,
): ProjectScriptEditorRequest {
  return {
    scriptId: script.id,
    initial: {
      name: script.name,
      command: script.command,
      icon: script.icon,
      runOnWorktreeCreate: script.runOnWorktreeCreate,
      waitForSetup: script.runOnWorktreeCreate && script.async === false,
      runOnSettle: script.runOnSettle ?? false,
      keybinding: keybindingValueForCommand(keybindings, commandForProjectScript(script.id)),
      previewUrl: script.previewUrl ?? null,
      autoOpenPreview: script.autoOpenPreview ?? false,
    },
  };
}

/**
 * Add/edit dialog for a project script, shared by the chat-header scripts menu
 * and the project settings page. The parent owns which script (if any) is
 * being edited via `request`; the dialog owns the form state and validation.
 */
export function ProjectScriptEditorDialog({
  environmentId,
  editScope = AuthOrchestrationOperateScope,
  request,
  scripts,
  onSubmit,
  onDelete,
  onClose,
}: {
  environmentId: EnvironmentId;
  editScope?: typeof AuthOrchestrationOperateScope | typeof AuthSettingsWriteScope;
  request: ProjectScriptEditorRequest | null;
  /** Existing scripts, used to derive a unique id for new scripts. */
  scripts: ReadonlyArray<ProjectScript>;
  onSubmit: (
    scriptId: string | null,
    input: NewProjectScriptInput,
  ) => Promise<ProjectScriptActionResult>;
  onDelete: (scriptId: string) => void;
  onClose: () => void;
}) {
  const canEditActions = useEnvironmentScope(environmentId, editScope);
  const canWriteSettings = useEnvironmentScope(environmentId, AuthSettingsWriteScope);
  const formId = React.useId();
  const [name, setName] = useState("");
  const [command, setCommand] = useState("");
  const [icon, setIcon] = useState<ProjectScriptIcon>("play");
  const [runOnWorktreeCreate, setRunOnWorktreeCreate] = useState(false);
  const [waitForSetup, setWaitForSetup] = useState(false);
  const [runOnSettle, setRunOnSettle] = useState(false);
  const [keybinding, setKeybinding] = useState("");
  const shortcut = parseKeybindingShortcut(keybinding);
  const [previewUrl, setPreviewUrl] = useState("");
  const [autoOpenPreview, setAutoOpenPreview] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useComposerMenuState(!canEditActions);
  const [savingRequest, setSavingRequest] = useState<ProjectScriptEditorRequest | null>(null);
  const pendingSubmissionRef = useRef<{ request: ProjectScriptEditorRequest } | null>(null);

  const isOpen = request !== null;
  const isEditing = request?.scriptId != null;
  const isSaving = request !== null && savingRequest === request;
  const editorDisabled = isSaving || !canEditActions;

  // A save completion must not affect a replacement request or an unmounted editor.
  useLayoutEffect(
    () => () => {
      if (pendingSubmissionRef.current?.request === request) {
        pendingSubmissionRef.current = null;
      }
    },
    [request],
  );

  // Hydrate the form whenever a new request opens the dialog.
  useEffect(() => {
    if (!request) return;
    setName(request.initial.name);
    setCommand(request.initial.command);
    setIcon(request.initial.icon);
    setRunOnWorktreeCreate(request.initial.runOnWorktreeCreate);
    setWaitForSetup(request.initial.waitForSetup);
    setRunOnSettle(request.initial.runOnSettle);
    setKeybinding(request.initial.keybinding ?? "");
    setPreviewUrl(request.initial.previewUrl ?? "");
    setAutoOpenPreview(request.initial.autoOpenPreview);
    setValidationError(request.error ?? null);
    setSavingRequest(null);
  }, [request]);

  const close = () => {
    pendingSubmissionRef.current = null;
    setSavingRequest(null);
    onClose();
  };

  const captureKeybinding = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!readEnvironmentScope(environmentId, editScope)) return;
    if (!readEnvironmentScope(environmentId, AuthSettingsWriteScope)) return;
    if (event.key === "Tab") return;
    event.preventDefault();
    if (event.key === "Backspace" || event.key === "Delete") {
      setKeybinding("");
      return;
    }
    const next = keybindingFromKeyboardEvent(event, navigator.platform);
    if (!next) return;
    setKeybinding(next);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!request || pendingSubmissionRef.current !== null) return;
    if (!readEnvironmentScope(environmentId, editScope)) {
      setValidationError(t.app.scripts.changeDenied);
      return;
    }
    const changesKeybinding =
      (keybinding.trim() || null) !== (request.initial.keybinding?.trim() || null);
    const canChangeKeybinding = readEnvironmentScope(environmentId, AuthSettingsWriteScope);
    if (changesKeybinding && !canChangeKeybinding) {
      setValidationError(t.app.scripts.keybindingDenied);
      return;
    }
    const trimmedName = name.trim();
    const trimmedCommand = command.trim();
    if (trimmedName.length === 0) {
      setValidationError(t.app.scripts.nameRequired);
      return;
    }
    if (trimmedCommand.length === 0) {
      setValidationError(t.app.scripts.commandRequired);
      return;
    }

    setValidationError(null);
    let payload: NewProjectScriptInput;
    try {
      const scriptIdForValidation =
        request.scriptId ??
        nextProjectScriptId(
          trimmedName,
          scripts.map((script) => script.id),
        );
      const keybindingRule = decodeProjectScriptKeybindingRule({
        keybinding,
        command: commandForProjectScript(scriptIdForValidation),
      });
      const trimmedPreviewUrl = previewUrl.trim();
      payload = {
        name: trimmedName,
        command: trimmedCommand,
        icon,
        runOnWorktreeCreate,
        waitForSetup: runOnWorktreeCreate && waitForSetup,
        runOnSettle,
        ...((request.scriptId === null && canChangeKeybinding) || changesKeybinding
          ? { keybinding: keybindingRule?.key ?? null }
          : {}),
        previewUrl: trimmedPreviewUrl.length > 0 ? trimmedPreviewUrl : null,
        autoOpenPreview: trimmedPreviewUrl.length > 0 ? autoOpenPreview : false,
      } satisfies NewProjectScriptInput;
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : t.app.scripts.saveError);
      return;
    }

    const submission = { request };
    pendingSubmissionRef.current = submission;
    setSavingRequest(request);
    try {
      const result = await onSubmit(request.scriptId, payload);
      if (pendingSubmissionRef.current === submission) {
        if (result._tag === "Failure") {
          if (!isAtomCommandInterrupted(result)) {
            const error = squashAtomCommandFailure(result);
            setValidationError(error instanceof Error ? error.message : t.app.scripts.saveError);
          }
        } else {
          close();
        }
      }
    } catch (error) {
      if (pendingSubmissionRef.current === submission) {
        setValidationError(error instanceof Error ? error.message : t.app.scripts.saveError);
      }
    }
    if (pendingSubmissionRef.current === submission) {
      pendingSubmissionRef.current = null;
      setSavingRequest(null);
    }
  };

  return (
    <>
      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) {
            close();
          }
        }}
      >
        <DialogPopup size="wide">
          <DialogHeader>
            <DialogTitle>
              {isEditing ? t.app.scripts.editTitle : t.app.scripts.addTitle}
            </DialogTitle>
            <DialogDescription className="sr-only">{t.app.scripts.description}</DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <form id={formId} onSubmit={submit}>
              <fieldset className="space-y-3.5" disabled={editorDisabled}>
                <div className="ov1-script-identity">
                  <div className="min-w-0 space-y-1.5">
                    <label className="ov1-field-label" htmlFor="script-name">
                      {t.app.scripts.name}
                    </label>
                    <Input
                      id="script-name"
                      autoFocus
                      placeholder={t.app.scripts.test}
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                    />
                  </div>
                  <div className="min-w-0 space-y-1.5">
                    <label className="ov1-field-label" htmlFor="script-keybinding">
                      {t.app.scripts.keybinding}
                    </label>
                    <div
                      className="ov1-shortcut-input"
                      data-disabled={editorDisabled || !canWriteSettings ? "" : undefined}
                    >
                      <input
                        className="ov1-shortcut-capture"
                        disabled={!canWriteSettings}
                        id="script-keybinding"
                        placeholder={t.app.scripts.pressShortcut}
                        value={keybinding}
                        readOnly
                        onKeyDown={captureKeybinding}
                        aria-describedby="script-keybinding-hint"
                      />
                      <span
                        className="pointer-events-none absolute inset-0 flex items-center gap-1 overflow-hidden px-2.5"
                        aria-hidden
                      >
                        {shortcut ? (
                          formatShortcutKeycaps(shortcut).map((label) => (
                            <Kbd key={label}>{label}</Kbd>
                          ))
                        ) : keybinding ? (
                          <Kbd>{keybinding}</Kbd>
                        ) : null}
                      </span>
                    </div>
                    <p id="script-keybinding-hint" className="sr-only">
                      {t.app.scripts.shortcutHintLead}
                      <code>Backspace</code> {t.app.scripts.shortcutHintTail}
                    </p>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <span id="script-icon-label" className="ov1-field-label">
                    {t.app.scripts.icon}
                  </span>
                  <div
                    className="grid grid-cols-6 gap-1.5"
                    role="group"
                    aria-labelledby="script-icon-label"
                  >
                    {SCRIPT_ICONS.map((entry) => (
                      <button
                        key={entry.id}
                        type="button"
                        className="ov1-script-icon"
                        aria-pressed={entry.id === icon}
                        onClick={() => setIcon(entry.id)}
                      >
                        <ScriptIcon icon={entry.id} className="size-3.75" />
                        <span>{entry.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="ov1-field-label" htmlFor="script-command">
                    {t.app.scripts.command}
                  </label>
                  <textarea
                    className="ov1-command-input"
                    rows={1}
                    id="script-command"
                    placeholder={t.app.scripts.command}
                    value={command}
                    onChange={(event) => setCommand(event.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="ov1-field-label" htmlFor="script-preview-url">
                    {t.app.scripts.previewUrl}
                  </label>
                  <Input
                    font="mono"
                    id="script-preview-url"
                    placeholder="http://localhost:5173"
                    value={previewUrl}
                    onChange={(event) => setPreviewUrl(event.target.value)}
                  />
                  <p className="sr-only">{t.app.scripts.previewHint}</p>
                </div>
                <div className="space-y-2">
                  <label
                    className="ov1-script-option"
                    data-disabled={editorDisabled ? "" : undefined}
                  >
                    <span className="relative flex size-4 shrink-0">
                      <input
                        className="ov1-checkbox peer"
                        type="checkbox"
                        checked={runOnWorktreeCreate}
                        onChange={(event) => setRunOnWorktreeCreate(event.target.checked)}
                        onKeyDown={(event) => {
                          if (event.key !== "Enter") return;
                          event.preventDefault();
                          setRunOnWorktreeCreate((checked) => !checked);
                        }}
                      />
                      <CheckIcon className="ov1-checkbox-mark" aria-hidden />
                    </span>
                    <span>{t.app.scripts.runOnCreate}</span>
                  </label>
                  <label
                    className="ov1-script-option"
                    data-disabled={editorDisabled || !runOnWorktreeCreate ? "" : undefined}
                  >
                    <span className="relative flex size-4 shrink-0">
                      <input
                        className="ov1-checkbox peer"
                        type="checkbox"
                        checked={waitForSetup}
                        disabled={!runOnWorktreeCreate}
                        onChange={(event) => setWaitForSetup(event.target.checked)}
                        onKeyDown={(event) => {
                          if (event.key !== "Enter") return;
                          event.preventDefault();
                          setWaitForSetup((checked) => !checked);
                        }}
                      />
                      <CheckIcon className="ov1-checkbox-mark" aria-hidden />
                    </span>
                    <span>{t.app.scripts.waitBeforeAgent}</span>
                  </label>
                  <label
                    className="ov1-script-option"
                    data-disabled={editorDisabled ? "" : undefined}
                  >
                    <span className="relative flex size-4 shrink-0">
                      <input
                        className="ov1-checkbox peer"
                        type="checkbox"
                        checked={runOnSettle}
                        onChange={(event) => setRunOnSettle(event.target.checked)}
                        onKeyDown={(event) => {
                          if (event.key !== "Enter") return;
                          event.preventDefault();
                          setRunOnSettle((checked) => !checked);
                        }}
                      />
                      <CheckIcon className="ov1-checkbox-mark" aria-hidden />
                    </span>
                    <span>{t.app.scripts.runOnSettle}</span>
                  </label>
                  <label
                    className="ov1-script-option"
                    data-disabled={
                      editorDisabled || previewUrl.trim().length === 0 ? "" : undefined
                    }
                  >
                    <span className="relative flex size-4 shrink-0">
                      <input
                        className="ov1-checkbox peer"
                        type="checkbox"
                        checked={autoOpenPreview}
                        disabled={previewUrl.trim().length === 0}
                        onChange={(event) => setAutoOpenPreview(event.target.checked)}
                        onKeyDown={(event) => {
                          if (event.key !== "Enter") return;
                          event.preventDefault();
                          setAutoOpenPreview((checked) => !checked);
                        }}
                      />
                      <CheckIcon className="ov1-checkbox-mark" aria-hidden />
                    </span>
                    <span>{t.app.scripts.autoPreview}</span>
                  </label>
                </div>
                {validationError && <p className="text-sm text-destructive">{validationError}</p>}
              </fieldset>
            </form>
          </DialogPanel>
          <DialogFooter variant="bare">
            {isEditing && (
              <Button
                type="button"
                variant="destructive-outline"
                className="mr-auto"
                disabled={editorDisabled}
                onClick={() => setDeleteConfirmOpen(true)}
              >
                {t.common.threadActions.delete}
              </Button>
            )}
            <Button type="button" variant="outline" size="dialog-action" onClick={close}>
              {t.common.confirm.cancel}
            </Button>
            <Button size="dialog-action-wide" form={formId} type="submit" disabled={editorDisabled}>
              {isSaving ? t.app.actions.saving : t.app.scripts.saveAction}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>

      <AlertDialog open={deleteConfirmOpen && canEditActions} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.app.scripts.confirmDelete(name)}</AlertDialogTitle>
            <AlertDialogDescription>{t.sidebar.confirm.irreversibleHint}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" />}>
              {t.common.confirm.cancel}
            </AlertDialogClose>
            <Button
              variant="destructive"
              disabled={editorDisabled}
              onClick={() => {
                if (!request?.scriptId) return;
                if (!readEnvironmentScope(environmentId, editScope)) {
                  setValidationError(t.app.scripts.changeDenied);
                  return;
                }
                setDeleteConfirmOpen(false);
                close();
                onDelete(request.scriptId);
              }}
            >
              {t.app.scripts.deleteAction}
            </Button>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </>
  );
}
