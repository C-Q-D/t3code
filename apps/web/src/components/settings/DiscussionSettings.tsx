/** Manages discussion prompt templates and saved seat configurations for one settings environment. */
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import { useAtomValue } from "@effect/atom-react";
import {
  DiscussionPersonaAvatar,
  type DiscussionPromptWithModified,
  type DiscussionTemplate,
  type EnvironmentId,
} from "@t3tools/contracts";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import {
  ListChecksIcon,
  MessagesSquareIcon,
  PlusIcon,
  RotateCcwIcon,
  Trash2Icon,
  UnplugIcon,
} from "lucide-react";
import { useId, useRef, useState } from "react";
import { t } from "~/i18n";
import { deriveProviderInstanceEntries } from "../../providerInstances";
import type { EnvironmentPresentation } from "../../state/environments";
import { useEnvironmentQuery } from "../../state/query";
import { EMPTY_SERVER_PROVIDERS, serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { PixelSeat } from "../discussions/PixelSeat";
import { DiscussionTemplateEditor } from "../discussions/DiscussionTemplateEditor";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogPopup,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Dialog, DialogClose, DialogBackdrop, DialogPortal, DialogViewport } from "../ui/dialog";
import { Input } from "../ui/input";
import { toastManager } from "../ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { useSettingsScope } from "./SettingsScopeContext";
import {
  canSaveDiscussionPrompt,
  discussionPromptRow,
  discussionSeatSummary,
  discussionTemplatesLoadError,
  discussionSettingsErrorRole,
} from "./discussionSettings.logic";
import { SettingsPageContainer, SettingsRow, SettingsSection } from "./settingsLayout";

/** Duplicate persona/model seats are valid; occurrence keys keep unrelated reordered seats stable. */
function keyedTemplateSeats(seats: DiscussionTemplate["seats"]) {
  const occurrences = new Map<string, number>();
  return seats.map((seat) => {
    const identity = JSON.stringify([seat.personaPromptId, seat.modelSelection]);
    const occurrence = occurrences.get(identity) ?? 0;
    occurrences.set(identity, occurrence + 1);
    return { seat, key: identity + ":" + occurrence };
  });
}

/** A prompt editor starts with either a server snapshot or an empty custom prompt of the chosen kind. */
type PromptEditor = {
  readonly kind: "persona" | "summary";
  readonly prompt: DiscussionPromptWithModified | null;
};
/** Destructive or restorative operation awaiting confirmation, separate from draft editors. */
type Confirmation =
  | { readonly action: "deletePrompt" | "restore"; readonly target: DiscussionPromptWithModified }
  | { readonly action: "deleteTemplate"; readonly target: DiscussionTemplate };

/** Displays L5 scope states before mounting the selected environment; L1 keeps existing search targets. */
export function DiscussionSettings() {
  const { scope, environments, connectedEnvironments, environment } = useSettingsScope();
  const selected = environment ?? connectedEnvironments[0];
  return (
    <SettingsPageContainer className="discussion-settings gap-2">
      <h1 className="sr-only">{t.settings.discussions.title}</h1>
      {scope.kind === "unavailable" ? (
        <SettingsSection title={t.settings.scheduledTasks.unavailableScope}>
          <SettingsRow title={scope.message} />
        </SettingsSection>
      ) : environments.length === 0 ? (
        <div className="flex h-55 flex-col items-center justify-center gap-2 text-center">
          <span className="discussion-settings-empty-icon">
            <MessagesSquareIcon className="size-6" />
          </span>
          <h2 className="mt-1 text-plan-title font-bold">
            {t.settings.discussions.noEnvironments}
          </h2>
          <p className="text-body text-secondary-label">{t.settings.discussions.connectHint}</p>
        </div>
      ) : !selected ? (
        <SettingsSection title={t.settings.discussions.title}>
          <div className="discussion-settings-state">
            <span className="flex items-center gap-2 text-foreground">
              <UnplugIcon className="size-4" />
              {t.settings.discussions.disconnected}
            </span>
          </div>
        </SettingsSection>
      ) : (
        <DiscussionEnvironmentSettings key={selected.environmentId} environment={selected} />
      )}
    </SettingsPageContainer>
  );
}

/**
 * Owns L1 lists and subscriptions for one destination; changing environments unmounts drafts.
 * @param props.environment Selected settings environment, including its connection and provider snapshot.
 * @returns The three template groups and their controlled dialogs; writes never trigger manual refetches.
 */
function DiscussionEnvironmentSettings({
  environment,
}: {
  readonly environment: EnvironmentPresentation;
}) {
  const environmentId = environment.environmentId;
  const connected =
    environment.connection.phase === "connected" && environment.serverConfig !== null;
  const promptsQuery = useEnvironmentQuery(
    connected ? serverEnvironment.discussionPromptsLive({ environmentId, input: {} }) : null,
  );
  const templatesQuery = useEnvironmentQuery(
    connected ? serverEnvironment.discussionTemplatesLive({ environmentId, input: {} }) : null,
  );
  const providers =
    useAtomValue(serverEnvironment.providersValueAtom(environmentId)) ?? EMPTY_SERVER_PROVIDERS;
  const canUpsert = useAtomValue(
    serverEnvironment.upsertDiscussionPrompt.permissionAtom(environmentId),
  );
  const canDeletePrompt = useAtomValue(
    serverEnvironment.deleteDiscussionPrompt.permissionAtom(environmentId),
  );
  const canRestore = useAtomValue(
    serverEnvironment.restoreDiscussionPromptBuiltin.permissionAtom(environmentId),
  );
  const canDeleteTemplate = useAtomValue(
    serverEnvironment.deleteDiscussionTemplate.permissionAtom(environmentId),
  );
  const canUpsertTemplate = useAtomValue(
    serverEnvironment.upsertDiscussionTemplate.permissionAtom(environmentId),
  );
  const removePrompt = useAtomCommand(serverEnvironment.deleteDiscussionPrompt);
  const restorePrompt = useAtomCommand(serverEnvironment.restoreDiscussionPromptBuiltin);
  const removeTemplate = useAtomCommand(serverEnvironment.deleteDiscussionTemplate);
  const [editor, setEditor] = useState<PromptEditor | null>(null);
  const [templateEditor, setTemplateEditor] = useState<{
    readonly template: DiscussionTemplate | null;
  } | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [busy, setBusy] = useState(false);
  const mutationPending = useRef(false);
  const prompts = promptsQuery.data?.prompts;
  const templatesLoadError = discussionTemplatesLoadError(templatesQuery.error, promptsQuery.error);
  const personas = prompts?.filter((prompt) => prompt.kind === "persona") ?? [];
  const instanceEntries = deriveProviderInstanceEntries(providers);
  const canConfirm =
    connected &&
    (confirmation?.action === "restore"
      ? canRestore
      : confirmation?.action === "deleteTemplate"
        ? canDeleteTemplate
        : canDeletePrompt);

  // The command layer checks destination grants again. Do not retry a failed write:
  // a lost response can leave the outcome unknown; subscriptions remain the source of truth.
  const confirmMutation = async () => {
    if (!confirmation || !canConfirm || mutationPending.current) return;
    mutationPending.current = true;
    setBusy(true);
    const result =
      confirmation.action === "deleteTemplate"
        ? await removeTemplate({ environmentId, input: { id: confirmation.target.id } })
        : confirmation.action === "restore"
          ? await restorePrompt({ environmentId, input: { id: confirmation.target.id } })
          : await removePrompt({ environmentId, input: { id: confirmation.target.id } });
    mutationPending.current = false;
    setBusy(false);
    setConfirmation(null);
    if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
      const failure = squashAtomCommandFailure(result);
      const inUse =
        confirmation.action === "deletePrompt" &&
        typeof failure === "object" &&
        failure !== null &&
        "_tag" in failure &&
        failure._tag === "DiscussionError" &&
        "reason" in failure &&
        failure.reason === "in_use";
      toastManager.add({
        type: "error",
        data: { appearance: "error-stripe" },
        title: inUse
          ? t.settings.discussions.inUseTitle(confirmation.target.name)
          : t.settings.discussions.updateError,
        description: inUse ? t.settings.discussions.inUseHint : String(failure),
      });
    }
  };

  if (!connected)
    return (
      <SettingsSection title={t.settings.discussions.title}>
        <div className="discussion-settings-state">
          <p className="flex items-center gap-2 text-foreground">
            <UnplugIcon className="size-4" />
            {t.settings.discussions.disconnected}
          </p>
          <p className="text-secondary-copy-medium">
            {t.settings.discussions.reconnectHint(environment.label)}
          </p>
        </div>
      </SettingsSection>
    );

  return (
    <>
      {(["persona", "summary"] as const).map((kind) => (
        <SettingsSection
          key={kind}
          id={kind === "persona" ? "discussion-personas" : "discussion-summaries"}
          title={
            kind === "persona" ? t.settings.discussions.personas : t.settings.discussions.summaries
          }
          headerAction={
            <Button
              size="settings-list"
              variant="ghost-muted"
              disabled={!canUpsert || busy}
              onClick={() => setEditor({ kind, prompt: null })}
            >
              <PlusIcon className="size-3.25" />
              {t.settings.discussions.new}
            </Button>
          }
        >
          {promptsQuery.error ? (
            <div
              className="discussion-settings-state py-2.5"
              role={discussionSettingsErrorRole(kind, templatesQuery.error)}
            >
              <p className="text-foreground">{t.settings.discussions.loadError}</p>
              <p className="text-secondary-copy-medium">{promptsQuery.error}</p>
            </div>
          ) : !prompts ? (
            <div className="discussion-settings-state" role="status">
              {t.settings.discussions.loading}
            </div>
          ) : prompts.filter((prompt) => prompt.kind === kind).length === 0 ? (
            <div className="discussion-settings-state">{t.settings.discussions.emptyPrompts}</div>
          ) : (
            prompts
              .filter((prompt) => prompt.kind === kind)
              .map((prompt) => {
                const row = discussionPromptRow(prompt);
                return (
                  <div key={prompt.id} className="discussion-settings-row">
                    {kind === "persona" ? (
                      <PixelSeat
                        role={prompt.avatar ?? "architect"}
                        seatIndex={-1}
                        size={32}
                        state="idle"
                        label={t.settings.discussions.avatars[prompt.avatar ?? "architect"]}
                      />
                    ) : (
                      <span className="discussion-settings-icon-well">
                        <ListChecksIcon className="size-4" />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                        <span className="truncate text-body font-bold">{prompt.name}</span>
                        {row.labels.map((label) => (
                          <Badge
                            key={label}
                            size="sm"
                            variant={label === "modified" ? "warning" : "secondary"}
                          >
                            {t.settings.discussions[label]}
                          </Badge>
                        ))}
                      </div>
                      <p className="truncate text-secondary-copy text-secondary-label">
                        {prompt.description}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {row.actions.map((action) =>
                        action === "restore" ? (
                          <Button
                            key={action}
                            size="settings-list"
                            variant="ghost"
                            disabled={!canRestore || busy}
                            onClick={() => setConfirmation({ action: "restore", target: prompt })}
                          >
                            <RotateCcwIcon className="size-3.25" />
                            {t.settings.discussions.restore}
                          </Button>
                        ) : action === "edit" ? (
                          <Button
                            key={action}
                            size="settings-list"
                            variant="dialog-secondary"
                            disabled={!canUpsert || busy}
                            onClick={() => setEditor({ kind, prompt })}
                          >
                            {t.settings.discussions.edit}
                          </Button>
                        ) : (
                          <Tooltip key={action}>
                            <TooltipTrigger
                              render={
                                <Button
                                  size="icon-sm"
                                  variant="ghost-destructive"
                                  aria-label={t.settings.discussions.delete}
                                  disabled={!canDeletePrompt || busy}
                                  onClick={() =>
                                    setConfirmation({ action: "deletePrompt", target: prompt })
                                  }
                                />
                              }
                            >
                              <Trash2Icon />
                            </TooltipTrigger>
                            <TooltipPopup>{t.settings.discussions.delete}</TooltipPopup>
                          </Tooltip>
                        ),
                      )}
                    </div>
                  </div>
                );
              })
          )}
        </SettingsSection>
      ))}
      <SettingsSection
        title={t.settings.discussions.templates}
        headerAction={
          <Button
            size="settings-list"
            variant="ghost-muted"
            disabled={!canUpsertTemplate || busy}
            onClick={() => setTemplateEditor({ template: null })}
          >
            <PlusIcon className="size-3.25" />
            {t.settings.discussions.new}
          </Button>
        }
      >
        {templatesLoadError ? (
          <div
            className="discussion-settings-state py-2.5"
            role={discussionSettingsErrorRole("templates", templatesQuery.error)}
          >
            <p className="text-foreground">{t.settings.discussions.loadError}</p>
            <p className="text-secondary-copy-medium">{templatesLoadError}</p>
          </div>
        ) : !templatesQuery.data || !prompts ? (
          <div className="discussion-settings-state" role="status">
            {t.settings.discussions.loading}
          </div>
        ) : templatesQuery.data.templates.length === 0 ? (
          <div className="discussion-settings-state">{t.settings.discussions.emptyTemplates}</div>
        ) : (
          templatesQuery.data.templates.map((template) => (
            <div key={template.id} className="discussion-settings-row">
              <div className="flex min-w-15.5 shrink-0 items-center -space-x-1.5">
                {keyedTemplateSeats(template.seats).map(({ seat, key }, index) => (
                  <span key={key} className="rounded-tag ring-2 ring-surface-raised">
                    <PixelSeat
                      role={
                        personas.find((prompt) => prompt.id === seat.personaPromptId)?.avatar ??
                        "architect"
                      }
                      seatIndex={index}
                      state="idle"
                      label={
                        personas.find((prompt) => prompt.id === seat.personaPromptId)?.name ??
                        t.settings.discussions.deletedPersona
                      }
                      size={24}
                    />
                  </span>
                ))}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-body font-bold">{template.name}</p>
                <p className="truncate text-secondary-copy text-secondary-label">
                  {discussionSeatSummary(
                    template.seats,
                    personas,
                    instanceEntries,
                    t.settings.discussions.deletedPersona,
                  )}
                </p>
              </div>
              <Button
                size="settings-list"
                variant="dialog-secondary"
                disabled={!canUpsertTemplate || busy}
                onClick={() => setTemplateEditor({ template })}
              >
                {t.settings.discussions.edit}
              </Button>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      size="icon-sm"
                      variant="ghost-destructive"
                      aria-label={t.settings.discussions.delete}
                      disabled={!canDeleteTemplate || busy}
                      onClick={() =>
                        setConfirmation({ action: "deleteTemplate", target: template })
                      }
                    />
                  }
                >
                  <Trash2Icon />
                </TooltipTrigger>
                <TooltipPopup>{t.settings.discussions.delete}</TooltipPopup>
              </Tooltip>
            </div>
          ))
        )}
      </SettingsSection>
      {templateEditor ? (
        <DiscussionTemplateEditor
          key={templateEditor.template?.id ?? "new-template"}
          environmentId={environmentId}
          template={templateEditor.template}
          onClose={() => setTemplateEditor(null)}
        />
      ) : null}
      {editor ? (
        <DiscussionPromptEditor
          key={editor.prompt?.id ?? editor.kind}
          environmentId={environmentId}
          editor={editor}
          onClose={() => setEditor(null)}
        />
      ) : null}
      <DiscussionConfirmation
        confirmation={confirmation}
        busy={busy}
        canConfirm={canConfirm}
        onCancel={() => {
          if (!mutationPending.current) setConfirmation(null);
        }}
        onConfirm={() => {
          void confirmMutation();
        }}
      />
    </>
  );
}

/**
 * Edits a persona or summary in L2; the 512px shell keeps the destination fixed until close.
 * @param props.environmentId Destination environment for the command and its permission atom.
 * @param props.editor Existing snapshot, or null prompt for custom creation.
 * @param props.onClose Removes the editor after cancellation or a successful save.
 * @returns A labelled, keyboard-accessible form; failed writes keep the draft and are not retried.
 */
function DiscussionPromptEditor({
  environmentId,
  editor,
  onClose,
}: {
  readonly environmentId: EnvironmentId;
  readonly editor: PromptEditor;
  readonly onClose: () => void;
}) {
  const fieldId = useId();
  const [name, setName] = useState(editor.prompt?.name ?? "");
  const [description, setDescription] = useState(editor.prompt?.description ?? "");
  const [prompt, setPrompt] = useState(editor.prompt?.prompt ?? "");
  const [avatar, setAvatar] = useState<DiscussionPersonaAvatar>(
    editor.prompt?.avatar ?? "architect",
  );
  const [saving, setSaving] = useState(false);
  const submissionPending = useRef(false);
  const canWrite = useAtomValue(
    serverEnvironment.upsertDiscussionPrompt.permissionAtom(environmentId),
  );
  const upsert = useAtomCommand(serverEnvironment.upsertDiscussionPrompt);
  const saveEnabled = canSaveDiscussionPrompt({ name, prompt }, canWrite, saving);
  const title =
    editor.kind === "persona"
      ? editor.prompt
        ? t.settings.discussions.editPersona
        : t.settings.discussions.newPersona
      : editor.prompt
        ? t.settings.discussions.editSummary
        : t.settings.discussions.newSummary;
  const save = async () => {
    if (!saveEnabled || submissionPending.current) return;
    submissionPending.current = true;
    setSaving(true);
    const result = await upsert({
      environmentId,
      input: {
        ...(editor.prompt ? { id: editor.prompt.id } : {}),
        kind: editor.kind,
        name: name.trim(),
        prompt: prompt.trim(),
        description,
        avatar: editor.kind === "persona" ? avatar : null,
      },
    });
    setSaving(false);
    if (result._tag === "Failure") {
      submissionPending.current = false;
      if (!isAtomCommandInterrupted(result))
        toastManager.add({
          type: "error",
          data: { appearance: "error-stripe" },
          title: t.settings.discussions.saveError,
          description: String(squashAtomCommandFailure(result)),
        });
      return;
    }
    onClose();
  };
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !submissionPending.current) onClose();
      }}
    >
      <DialogPortal>
        <DialogBackdrop />
        <DialogViewport>
          <DialogPrimitive.Popup
            className="dialog-glass relative row-start-2 flex max-h-full w-full max-w-128 flex-col overflow-y-auto rounded-dialog p-6 text-foreground outline-none"
            aria-describedby={`${fieldId}-hint`}
            render={
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void save();
                }}
              />
            }
          >
            <DialogPrimitive.Title className="font-serif text-discussion-template-heading font-bold">
              {title}
            </DialogPrimitive.Title>
            <div className="mt-4 space-y-4">
              <div className="space-y-1.5">
                <label
                  className="block text-secondary-copy-large font-semibold text-code-foreground"
                  htmlFor={`${fieldId}-name`}
                >
                  {t.settings.discussions.name}
                </label>
                <Input
                  id={`${fieldId}-name`}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  disabled={saving}
                  autoFocus
                />
              </div>
              {editor.kind === "persona" ? (
                <div className="space-y-1.5">
                  <label
                    className="block text-secondary-copy-large font-semibold text-code-foreground"
                    id={`${fieldId}-avatar`}
                  >
                    {t.settings.discussions.avatar}
                  </label>
                  <RadioGroup
                    aria-labelledby={`${fieldId}-avatar`}
                    value={avatar}
                    disabled={saving}
                    onValueChange={(value) => {
                      const selectedAvatar = DiscussionPersonaAvatar.literals.find(
                        (role) => role === value,
                      );
                      if (selectedAvatar) setAvatar(selectedAvatar);
                    }}
                  >
                    <div className="flex flex-wrap gap-2">
                      {DiscussionPersonaAvatar.literals.map((role) => (
                        <Radio.Root
                          key={role}
                          value={role}
                          aria-label={t.settings.discussions.avatars[role]}
                          className="discussion-settings-avatar"
                        >
                          <PixelSeat
                            role={role}
                            seatIndex={-1}
                            size={40}
                            state="idle"
                            label={t.settings.discussions.avatars[role]}
                          />
                          <span className="text-meta-large text-secondary-label">
                            {t.settings.discussions.avatars[role]}
                          </span>
                        </Radio.Root>
                      ))}
                    </div>
                  </RadioGroup>
                </div>
              ) : null}
              <div className="space-y-1.5">
                <label
                  className="block text-secondary-copy-large font-semibold text-code-foreground"
                  htmlFor={`${fieldId}-description`}
                >
                  {t.settings.discussions.description}
                </label>
                <Input
                  id={`${fieldId}-description`}
                  placeholder={t.settings.discussions.descriptionPlaceholder}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  disabled={saving}
                />
              </div>
              <div className="space-y-1.5">
                <label
                  className="block text-secondary-copy-large font-semibold text-code-foreground"
                  htmlFor={`${fieldId}-prompt`}
                >
                  {t.settings.discussions.prompt}
                </label>
                <div className="surface-glass discussion-settings-prompt-well">
                  <textarea
                    className="h-38.5 w-full resize-y rounded-overlay px-3.5 py-2.5 text-body leading-5.5 text-fg-detail outline-none focus-visible:inset-shadow-focus"
                    rows={7}
                    id={`${fieldId}-prompt`}
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    disabled={saving}
                  />
                </div>
              </div>
            </div>
            <div className="mt-4.5 flex items-center gap-2">
              <div className="flex flex-1 items-center">
                <p id={`${fieldId}-hint`} className="text-secondary-copy text-secondary-label">
                  {t.settings.discussions.futureOnly}
                </p>
              </div>
              <DialogClose
                disabled={saving}
                render={<Button variant="dialog-secondary" size="dialog-action" />}
              >
                {t.common.confirm.cancel}
              </DialogClose>
              <Button type="submit" size="dialog-action-wide" disabled={!saveEnabled}>
                {t.settings.discussions.save}
              </Button>
            </div>
          </DialogPrimitive.Popup>
        </DialogViewport>
      </DialogPortal>
    </Dialog>
  );
}

/**
 * Confirms deletion/restoration in the compact L4 shell with retained closing content.
 * @param props.confirmation Pending operation; null closes the dialog without blanking its last title.
 * @param props.busy Whether the confirmed mutation is in flight.
 * @param props.canConfirm Current permission for that destination operation.
 * @param props.onCancel Clears pending confirmation when no mutation is in flight.
 * @param props.onConfirm Starts the guarded mutation; the owner reports failures and updates the list through subscriptions.
 */
function DiscussionConfirmation({
  confirmation,
  busy,
  canConfirm,
  onCancel,
  onConfirm,
}: {
  readonly confirmation: Confirmation | null;
  readonly busy: boolean;
  readonly canConfirm: boolean;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}) {
  const [shown, setShown] = useState(confirmation);
  if (confirmation !== null && confirmation !== shown) setShown(confirmation);
  const restoring = shown?.action === "restore";
  const persona = shown?.action !== "deleteTemplate" && shown?.target.kind === "persona";
  const title = shown
    ? restoring
      ? t.settings.discussions.restoreTitle(shown.target.name)
      : shown.action === "deleteTemplate"
        ? t.settings.discussions.deleteTemplateTitle(shown.target.name)
        : persona
          ? t.settings.discussions.deletePersonaTitle(shown.target.name)
          : t.settings.discussions.deleteSummaryTitle(shown.target.name)
    : "";
  const hint = restoring
    ? persona
      ? t.settings.discussions.restorePersonaHint
      : t.settings.discussions.restoreSummaryHint
    : t.settings.discussions.deleteHint;
  return (
    <AlertDialog
      open={confirmation !== null}
      onOpenChange={(open) => {
        if (!open && !busy) onCancel();
      }}
    >
      <AlertDialogPopup size="compact" bottomStickOnMobile={false}>
        <div className="flex min-w-0 flex-col gap-2.5 px-6 pt-6 text-left">
          <AlertDialogTitle size="lg">{title}</AlertDialogTitle>
          <AlertDialogDescription variant="confirmation">{hint}</AlertDialogDescription>
        </div>
        <div data-slot="alert-dialog-footer" className="flex justify-end gap-2 px-6 pt-5 pb-6">
          <AlertDialogClose
            disabled={busy}
            render={<Button variant="dialog-secondary" size="dialog-action" />}
          >
            {t.common.confirm.cancel}
          </AlertDialogClose>
          <Button
            size="dialog-action-wide"
            variant={restoring ? "default" : "danger-key"}
            disabled={!canConfirm || busy}
            onClick={onConfirm}
          >
            {restoring ? t.settings.discussions.restore : t.settings.discussions.delete}
          </Button>
        </div>
      </AlertDialogPopup>
    </AlertDialog>
  );
}
