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
import React, { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";

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
  waitForSetup: boolean;
  runOnSettle: boolean;
  /** Omit to preserve the current shortcut when the form did not edit it. */
  keybinding?: string | null;
  previewUrl: string | null;
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

export interface ProjectScriptEditorRequest {
  scriptId: string | null;
  initial: NewProjectScriptInput;
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
 * Isolates save errors by opening request so late responses cannot contaminate the next edit.
 * @param props Destination/scope, nullable opening request, script catalog and save/delete/close callbacks; null request closes the dialog.
 * @returns The editor and deletion confirmation; save errors remain associated with their originating request.
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
  scripts: ReadonlyArray<ProjectScript>;
  onSubmit: (
    scriptId: string | null,
    input: NewProjectScriptInput,
  ) => Promise<ProjectScriptActionResult>;
  onDelete: (scriptId: string) => void;
  onClose: () => void;
}) {
  const canEditActions = useEnvironmentScope(environmentId, editScope);
  // Scope errors by request so late saves cannot overwrite a newer request's error.
  const [errorState, setErrorState] = useState<{
    readonly request: ProjectScriptEditorRequest;
    readonly message: string | null;
  } | null>(null);
  const validationError =
    request === null
      ? null
      : errorState?.request === request
        ? errorState.message
        : (request.error ?? null);
  const setValidationError = (message: string | null) => {
    if (request !== null) setErrorState({ request, message });
  };
  // The last opened request stays shown while the dialog animates closed. Each
  // new request mounts a fresh form, which drops the previous request's save.
  const [shown, setShown] = useState<{
    readonly request: ProjectScriptEditorRequest;
    readonly key: number;
  } | null>(request === null ? null : { request, key: 0 });
  if (request !== null && request !== shown?.request) {
    setShown({ request, key: (shown?.key ?? 0) + 1 });
  }
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useComposerMenuState(!canEditActions);
  const [deleteName, setDeleteName] = useState("");

  return (
    <>
      <Dialog
        open={request !== null}
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        {/* The form owns its fields so a keystroke re-renders it, not the dialog chrome. */}
        <DialogPopup size="wide">
          {shown ? (
            <ProjectScriptEditorForm
              key={shown.key}
              environmentId={environmentId}
              editScope={editScope}
              request={shown.request}
              scripts={scripts}
              validationError={validationError}
              onValidationError={setValidationError}
              onSubmit={onSubmit}
              onRequestDelete={(name) => {
                setDeleteName(name);
                setDeleteConfirmOpen(true);
              }}
              onClose={onClose}
            />
          ) : null}
        </DialogPopup>
      </Dialog>

      <AlertDialog open={deleteConfirmOpen && canEditActions} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.app.scripts.confirmDelete(deleteName)}</AlertDialogTitle>
            <AlertDialogDescription>{t.sidebar.confirm.irreversibleHint}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="outline" />}>
              {t.common.confirm.cancel}
            </AlertDialogClose>
            <Button
              variant="destructive"
              disabled={!canEditActions}
              onClick={() => {
                if (!request?.scriptId) return;
                if (!readEnvironmentScope(environmentId, editScope)) {
                  setValidationError(t.app.scripts.changeDenied);
                  return;
                }
                setDeleteConfirmOpen(false);
                onClose();
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

/**
 * Keeps keystroke state inside the form while the outer dialog owns request identity and deletion confirmation.
 * @param props Opening request and script catalog, permission scope, validation message and save/error/delete/close callbacks.
 * @returns The action form; submitting validates inputs and reports structured failures without closing a newer request.
 */
function ProjectScriptEditorForm({
  environmentId,
  editScope,
  request,
  scripts,
  validationError,
  onValidationError: setValidationError,
  onSubmit,
  onRequestDelete,
  onClose,
}: {
  environmentId: EnvironmentId;
  editScope: typeof AuthOrchestrationOperateScope | typeof AuthSettingsWriteScope;
  request: ProjectScriptEditorRequest;
  scripts: ReadonlyArray<ProjectScript>;
  validationError: string | null;
  onValidationError: (error: string | null) => void;
  onSubmit: (
    scriptId: string | null,
    input: NewProjectScriptInput,
  ) => Promise<ProjectScriptActionResult>;
  onRequestDelete: (name: string) => void;
  onClose: () => void;
}) {
  const canEditActions = useEnvironmentScope(environmentId, editScope);
  const canWriteSettings = useEnvironmentScope(environmentId, AuthSettingsWriteScope);
  const formId = React.useId();
  const [name, setName] = useState(request.initial.name);
  const [command, setCommand] = useState(request.initial.command);
  const [icon, setIcon] = useState<ProjectScriptIcon>(request.initial.icon);
  const [runOnWorktreeCreate, setRunOnWorktreeCreate] = useState(
    request.initial.runOnWorktreeCreate,
  );
  const [waitForSetup, setWaitForSetup] = useState(request.initial.waitForSetup);
  const [runOnSettle, setRunOnSettle] = useState(request.initial.runOnSettle);
  const [keybinding, setKeybinding] = useState(request.initial.keybinding ?? "");
  const shortcut = parseKeybindingShortcut(keybinding);
  const [previewUrl, setPreviewUrl] = useState(request.initial.previewUrl ?? "");
  const [autoOpenPreview, setAutoOpenPreview] = useState(request.initial.autoOpenPreview);
  const [isSaving, setIsSaving] = useState(false);
  const editorDisabled = isSaving || !canEditActions;
  const pendingSubmissionRef = useRef<object | null>(null);
  // A save that settles after this form is replaced must not close or error
  // the request that replaced it.
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- drops the pending save on unmount so a late result cannot close or fail the next request
  useEffect(
    () => () => {
      pendingSubmissionRef.current = null;
    },
    [],
  );

  const isEditing = request.scriptId != null;

  const close = () => {
    pendingSubmissionRef.current = null;
    setIsSaving(false);
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
    if (pendingSubmissionRef.current !== null) return;
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

    const submission = {};
    pendingSubmissionRef.current = submission;
    setIsSaving(true);
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
      setIsSaving(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{isEditing ? t.app.scripts.editTitle : t.app.scripts.addTitle}</DialogTitle>
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
                      formatShortcutKeycaps(shortcut).map((label) => <Kbd key={label}>{label}</Kbd>)
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
              <label className="ov1-script-option" data-disabled={editorDisabled ? "" : undefined}>
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
              <label className="ov1-script-option" data-disabled={editorDisabled ? "" : undefined}>
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
                data-disabled={editorDisabled || previewUrl.trim().length === 0 ? "" : undefined}
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
            onClick={() => onRequestDelete(name)}
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
    </>
  );
}
