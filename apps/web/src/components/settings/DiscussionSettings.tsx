/** Manages discussion prompt templates and saved seat configurations for one settings environment. */
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
import { MessagesSquareIcon, PlusIcon, RotateCcwIcon, Trash2Icon } from "lucide-react";
import { useId, useRef, useState } from "react";
import { t } from "~/i18n";
import { deriveProviderInstanceEntries } from "../../providerInstances";
import type { EnvironmentPresentation } from "../../state/environments";
import { useEnvironmentQuery } from "../../state/query";
import { EMPTY_SERVER_PROVIDERS, serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { PixelAvatar } from "../discussions/PixelAvatar";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "../ui/alert-dialog";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogClose,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "../ui/empty";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { toastManager } from "../ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { useSettingsScope } from "./SettingsScopeContext";
import {
  canSaveDiscussionPrompt,
  discussionPromptRow,
  discussionSeatSummary,
  discussionTemplatesLoadError,
} from "./discussionSettings.logic";
import { SettingsPageContainer, SettingsRow, SettingsSection } from "./settingsLayout";

/** A prompt editor starts with either a server snapshot or an empty custom prompt of the chosen kind. */
type PromptEditor = {
  readonly kind: "persona" | "summary";
  readonly prompt: DiscussionPromptWithModified | null;
};
/** Destructive or restorative operation awaiting confirmation; template editing is outside this page. */
type Confirmation =
  | { readonly action: "deletePrompt" | "restore"; readonly target: DiscussionPromptWithModified }
  | { readonly action: "deleteTemplate"; readonly target: DiscussionTemplate };

/** Displays scope failures before mounting environment-specific subscriptions and commands. */
export function DiscussionSettings() {
  const { scope, environments, connectedEnvironments, environment } = useSettingsScope();
  const selected = environment ?? connectedEnvironments[0];
  return (
    <SettingsPageContainer>
      <div className="px-3 sm:px-4">
        <h1 className="text-lg font-semibold">{t.settings.discussions.title}</h1>
      </div>
      {scope.kind === "unavailable" ? (
        <SettingsSection title={t.settings.scheduledTasks.unavailableScope}>
          <SettingsRow title={scope.message} />
        </SettingsSection>
      ) : environments.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <MessagesSquareIcon />
            </EmptyMedia>
            <EmptyTitle>{t.settings.scheduledTasks.noEnvironments}</EmptyTitle>
            <EmptyDescription>{t.settings.scheduledTasks.connectHint}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : !selected ? (
        <SettingsSection title={t.settings.discussions.title}>
          <SettingsRow title={t.settings.scheduledTasks.disconnected} />
        </SettingsSection>
      ) : (
        <DiscussionEnvironmentSettings key={selected.environmentId} environment={selected} />
      )}
    </SettingsPageContainer>
  );
}

/**
 * Owns subscriptions and mutations for one selected destination; changing environments unmounts drafts.
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
  const removePrompt = useAtomCommand(serverEnvironment.deleteDiscussionPrompt);
  const restorePrompt = useAtomCommand(serverEnvironment.restoreDiscussionPromptBuiltin);
  const removeTemplate = useAtomCommand(serverEnvironment.deleteDiscussionTemplate);
  const [editor, setEditor] = useState<PromptEditor | null>(null);
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
        <SettingsRow
          title={t.settings.scheduledTasks.disconnected}
          description={t.settings.scheduledTasks.reconnectHint(environment.label)}
        />
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
              size="xs"
              variant="ghost-muted"
              disabled={!canUpsert || busy}
              onClick={() => setEditor({ kind, prompt: null })}
            >
              <PlusIcon className="size-3" />
              {t.settings.discussions.new}
            </Button>
          }
        >
          {promptsQuery.error ? (
            <SettingsRow
              title={t.settings.discussions.loadError}
              description={promptsQuery.error}
            />
          ) : !prompts ? (
            <SettingsRow title={t.settings.discussions.loading} role="status" />
          ) : prompts.filter((prompt) => prompt.kind === kind).length === 0 ? (
            <SettingsRow title={t.settings.discussions.emptyPrompts} />
          ) : (
            prompts
              .filter((prompt) => prompt.kind === kind)
              .map((prompt) => {
                const row = discussionPromptRow(prompt);
                return (
                  <div key={prompt.id} className="flex items-center gap-3 px-3 py-3 sm:px-4">
                    {kind === "persona" ? (
                      <PixelAvatar role={prompt.avatar ?? "architect"} seat={0} size={32} />
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-medium">{prompt.name}</span>
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
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {prompt.description}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {row.actions.map((action) =>
                        action === "restore" ? (
                          <Button
                            key={action}
                            size="xs"
                            variant="ghost"
                            disabled={!canRestore || busy}
                            onClick={() => setConfirmation({ action: "restore", target: prompt })}
                          >
                            <RotateCcwIcon className="size-3" />
                            {t.settings.discussions.restore}
                          </Button>
                        ) : action === "edit" ? (
                          <Button
                            key={action}
                            size="xs"
                            variant="outline"
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
                                  size="icon-xs"
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
      <SettingsSection title={t.settings.discussions.templates}>
        {templatesLoadError ? (
          <SettingsRow title={t.settings.discussions.loadError} description={templatesLoadError} />
        ) : !templatesQuery.data || !prompts ? (
          <SettingsRow title={t.settings.discussions.loading} role="status" />
        ) : templatesQuery.data.templates.length === 0 ? (
          <div className="px-3 py-4 text-xs text-muted-foreground sm:px-4">
            {t.settings.discussions.emptyTemplates}
          </div>
        ) : (
          templatesQuery.data.templates.map((template) => (
            <div key={template.id} className="flex items-center gap-3 px-3 py-3 sm:px-4">
              <div className="flex shrink-0 items-center -space-x-1.5">
                {template.seats.map((seat, index) => (
                  <span
                    key={`${index}:${seat.personaPromptId}`}
                    className="rounded-lg ring-2 ring-card"
                  >
                    <PixelAvatar
                      role={
                        personas.find((prompt) => prompt.id === seat.personaPromptId)?.avatar ??
                        "architect"
                      }
                      seat={index + 1}
                      size={24}
                    />
                  </span>
                ))}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{template.name}</p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {discussionSeatSummary(
                    template.seats,
                    personas,
                    instanceEntries,
                    t.settings.discussions.deletedPersona,
                  )}
                </p>
              </div>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      size="icon-xs"
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
 * Edits a persona or summary while keeping the destination fixed for the lifetime of the dialog.
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
      <DialogPopup
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
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <DialogPanel>
          <div className="space-y-1.5">
            <Label htmlFor={`${fieldId}-name`}>{t.settings.discussions.name}</Label>
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
              <Label id={`${fieldId}-avatar`}>{t.settings.discussions.avatar}</Label>
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
                <div className="flex flex-wrap gap-2.5">
                  {DiscussionPersonaAvatar.literals.map((role) => (
                    <Radio.Root
                      key={role}
                      value={role}
                      aria-label={t.settings.discussions.avatars[role]}
                      className="cursor-pointer rounded-xl p-1 outline-none hover:bg-accent data-checked:bg-accent data-checked:ring-2 data-checked:ring-inset data-checked:ring-primary focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring data-disabled:cursor-default data-disabled:opacity-64"
                    >
                      <PixelAvatar role={role} seat={0} size={40} />
                    </Radio.Root>
                  ))}
                </div>
              </RadioGroup>
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor={`${fieldId}-description`}>{t.settings.discussions.description}</Label>
            <Input
              id={`${fieldId}-description`}
              placeholder={t.settings.discussions.descriptionPlaceholder}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              disabled={saving}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${fieldId}-prompt`}>{t.settings.discussions.prompt}</Label>
            <Textarea
              rows={7}
              id={`${fieldId}-prompt`}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              disabled={saving}
            />
          </div>
        </DialogPanel>
        <DialogFooter>
          <div className="flex flex-1 items-center">
            <p id={`${fieldId}-hint`} className="text-xs text-muted-foreground">
              {t.settings.discussions.futureOnly}
            </p>
          </div>
          <DialogClose disabled={saving} render={<Button variant="outline" />}>
            {t.common.confirm.cancel}
          </DialogClose>
          <Button type="submit" disabled={!saveEnabled}>
            {t.settings.discussions.save}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

/**
 * Confirms deletions and restoration with operation-specific labels and retained closing content.
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
      <AlertDialogPopup>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{hint}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogClose disabled={busy} render={<Button variant="outline" />}>
            {t.common.confirm.cancel}
          </AlertDialogClose>
          <Button
            variant={restoring ? "default" : "destructive"}
            disabled={!canConfirm || busy}
            onClick={onConfirm}
          >
            {restoring ? t.settings.discussions.restore : t.settings.discussions.delete}
          </Button>
        </AlertDialogFooter>
      </AlertDialogPopup>
    </AlertDialog>
  );
}
