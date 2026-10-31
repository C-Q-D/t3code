/** Project-specific action rows; persistence, inheritance and the shared editor remain unchanged. */
import { t } from "~/i18n";
import { useScopedSettingsWriteAllowed } from "./useScopedSettings";
import { AuthSettingsWriteScope } from "@t3tools/contracts";
import { EnvironmentId, type T3ProjectFileScript } from "@t3tools/contracts";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { DEFAULT_RESOLVED_KEYBINDINGS } from "@t3tools/shared/keybindings";
import { ChevronDownIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useT3ProjectFileState } from "../../hooks/useT3ProjectFileScripts";
import { useEnvironments } from "../../state/environments";
import {
  EMPTY_PROJECT_SCRIPT_INPUT,
  editorRequestForScript,
  ProjectScriptEditorDialog,
  ScriptIcon,
  type NewProjectScriptInput,
  type ProjectScriptEditorRequest,
} from "../projectScriptEditor";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Kbd } from "../ui/kbd";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { shortcutLabelForCommand } from "../../keybindings";
import { commandForProjectScript } from "../../projectScripts";
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from "../ui/menu";
import { useProjectScriptSettings } from "./useProjectScriptSettings";
import { SettingsRow, SettingsSection } from "./settingsLayout";
import { useSettingsScope } from "./SettingsScopeContext";

/**
 * Edits scoped project scripts while preserving inherited actions and returning focus after deletion.
 * @returns The action list and editor dialogs for the selected scope; existing scoped commands own writes and failure feedback.
 */
export function ProjectActionsSettings() {
  const { scope, targets, target } = useSettingsScope();
  const { environments } = useEnvironments();
  const isProjectScope = scope.kind === "project" || scope.kind === "checkout";
  const representativeConfig = target
    ? environments.find((environment) => environment.environmentId === target.environmentId)
        ?.serverConfig
    : undefined;
  const scripts = target?.settings.defaultProjectScripts ?? [];
  const keybindings = representativeConfig?.keybindings ?? DEFAULT_RESOLVED_KEYBINDINGS;
  const mixed = targets.some(
    (candidate) =>
      JSON.stringify(candidate.settings.defaultProjectScripts) !== JSON.stringify(scripts),
  );
  const canWriteSettings = useScopedSettingsWriteAllowed();
  const [request, setRequest] = useState<ProjectScriptEditorRequest | null>(null);
  const addActionRef = useRef<HTMLButtonElement>(null);
  const [deleteFocusRequest, setDeleteFocusRequest] = useState(0);
  useEffect(() => {
    // Persistence resolves before React commits the enabled button. Focus only after that commit;
    // a new request also handles deleting a script with the same ID after it is added again.
    if (deleteFocusRequest > 0) addActionRef.current?.focus();
  }, [deleteFocusRequest]);
  const memberById = new Map(
    isProjectScope ? scope.members.map((member) => [member.id, member]) : [],
  );
  const { saving, persist, submit } = useProjectScriptSettings(
    targets.flatMap((candidate) => {
      const environment = environments.find(
        (entry) => entry.environmentId === candidate.environmentId,
      );
      if (!environment?.serverConfig) return [];
      const member = candidate.projectId ? memberById.get(candidate.projectId) : undefined;
      return [
        {
          environmentId: candidate.environmentId,
          settings: environment.serverConfig.settings,
          keybindings: environment.serverConfig.keybindings,
          ...(member ? { project: member } : {}),
        },
      ];
    }),
  );

  const representativeMember = target?.projectId ? memberById.get(target.projectId) : undefined;
  const t3File = useT3ProjectFileState(
    representativeMember?.environmentId ?? EnvironmentId.make("none"),
    representativeMember?.workspaceRoot ?? null,
  );
  const importableScripts = t3File.scripts.filter(
    (fileScript) =>
      !scripts.some(
        (script) =>
          script.command === fileScript.command ||
          script.name.toLowerCase() === fileScript.name.toLowerCase(),
      ),
  );
  const importFileScript = async (fileScript: T3ProjectFileScript) => {
    const payload: NewProjectScriptInput = {
      name: fileScript.name,
      command: fileScript.command,
      icon: fileScript.icon ?? "play",
      runOnWorktreeCreate: fileScript.runOnWorktreeCreate ?? false,
      waitForSetup: fileScript.runOnWorktreeCreate === true && fileScript.async === false,
      runOnSettle: fileScript.runOnSettle ?? false,
      keybinding: null,
      previewUrl: fileScript.previewUrl ?? null,
      autoOpenPreview: fileScript.previewUrl ? (fileScript.autoOpenPreview ?? false) : false,
    };
    const result = await submit(null, payload);
    if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
      const error = squashAtomCommandFailure(result);
      setRequest({
        scriptId: null,
        initial: payload,
        error:
          error instanceof Error ? error.message : t.settings.projectActions.failedToImportAction,
      });
    }
  };

  return (
    <SettingsSection id="project-actions" title={t.settings.projectActions.sectionTitle}>
      {!mixed ? (
        <div className="flex flex-col gap-1.5 py-2.5 pr-3 pl-3.5">
          {scripts.length === 0 ? (
            <p className="rounded-settings-row-surface bg-settings-project-well px-3.5 py-2.5 text-secondary-copy-medium text-secondary-label shadow-settings-project-well">
              {t.settings.projectActionsList.noActionsConfigured}
            </p>
          ) : (
            scripts.map((script) => {
              const shortcutLabel = shortcutLabelForCommand(
                keybindings,
                commandForProjectScript(script.id),
              );
              return (
                <div
                  key={script.id}
                  className="flex min-h-11 flex-wrap items-center gap-2.5 rounded-settings-row-surface bg-settings-inheritance-surface py-1.75 pr-1.5 pl-3.5 text-control shadow-settings-connect-row"
                >
                  <ScriptIcon icon={script.icon} className="size-3.75 shrink-0" />
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <span
                          tabIndex={0}
                          className="w-16 shrink-0 truncate font-semibold outline-none focus-visible:inset-shadow-focus"
                        />
                      }
                    >
                      {script.name}
                    </TooltipTrigger>
                    <TooltipPopup>{script.name}</TooltipPopup>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <code
                          tabIndex={0}
                          className="min-w-0 flex-1 basis-20 truncate font-mono text-secondary-copy text-secondary-label outline-none focus-visible:inset-shadow-focus"
                        />
                      }
                    >
                      {script.command}
                    </TooltipTrigger>
                    <TooltipPopup>{script.command}</TooltipPopup>
                  </Tooltip>
                  {script.runOnWorktreeCreate ? (
                    <Badge variant="neutral" size="sm">
                      {t.settings.projectActionsList.setup}
                    </Badge>
                  ) : null}
                  {script.runOnSettle ? (
                    <Badge variant="neutral" size="sm">
                      {t.settings.projectActionsList.onSettle}
                    </Badge>
                  ) : null}
                  {script.previewUrl ? (
                    <Badge variant="neutral" size="sm">
                      {t.settings.projectActionsList.previewDesktopOnly}
                    </Badge>
                  ) : null}
                  {shortcutLabel ? <Kbd>{shortcutLabel}</Kbd> : null}
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          size="icon-md"
                          variant="ghost-muted"
                          aria-label={t.settings.projectActionsList.edit(script.name)}
                          disabled={saving || !canWriteSettings}
                          onClick={() => setRequest(editorRequestForScript(script, keybindings))}
                        />
                      }
                    >
                      <PencilIcon className="size-3.5" />
                    </TooltipTrigger>
                    <TooltipPopup>{t.settings.projectActions.editLabel}</TooltipPopup>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          size="icon-md"
                          variant="ghost-muted"
                          aria-label={t.settings.projectActions.deleteAction(script.name)}
                          disabled={saving || !canWriteSettings}
                          onClick={() => {
                            // The existing persistence path also removes unused shortcuts and reports failures.
                            void persist(
                              (current) => current.filter((entry) => entry.id !== script.id),
                              script.id,
                              null,
                            ).then((result) => {
                              if (result._tag === "Success")
                                setDeleteFocusRequest((count) => count + 1);
                            });
                          }}
                        />
                      }
                    >
                      <Trash2Icon className="size-3.5" />
                    </TooltipTrigger>
                    <TooltipPopup>{t.settings.projectActions.deleteLabel}</TooltipPopup>
                  </Tooltip>
                </div>
              );
            })
          )}
          <div className="self-start">
            <Button
              ref={addActionRef}
              size="toolbar"
              variant="outline"
              disabled={saving || !canWriteSettings || targets.length === 0}
              onClick={() => setRequest({ scriptId: null, initial: EMPTY_PROJECT_SCRIPT_INPUT })}
            >
              <PlusIcon className="size-3.25" />
              {t.settings.projectActions.addAction}
            </Button>
          </div>
        </div>
      ) : null}
      <SettingsRow
        serverScoped
        settingKeys={["defaultProjectScripts"]}
        mixed={mixed}
        title={t.settings.rows.projectActions.title}
        description={t.settings.projectActions.commandsRunProjectSCheckoutHint}
        onResetOverride={() => void persist(() => null)}
        control={
          <div className="flex flex-wrap items-center gap-1.5">
            {importableScripts.length > 0 ? (
              <Menu>
                <MenuTrigger
                  render={
                    <Button
                      id="import-scripts"
                      size="toolbar"
                      variant="ghost"
                      disabled={saving || !canWriteSettings}
                      type="button"
                    />
                  }
                >
                  {t.settings.projectActions.importScripts}
                  <ChevronDownIcon className="size-3.5" />
                </MenuTrigger>
                <MenuPopup align="end">
                  <MenuGroup>
                    <MenuGroupLabel>{t.settings.projectActions.importFromT3Json}</MenuGroupLabel>
                    <p className="px-2 pb-2 text-pretty text-sm text-muted-foreground">
                      {t.settings.projectActions.addActionsDeclaredCheckoutWithoutHint}
                    </p>
                  </MenuGroup>
                  <MenuSeparator />
                  {importableScripts.map((fileScript) => (
                    <MenuItem
                      key={`${fileScript.name} ${fileScript.command}`}
                      onClick={() => void importFileScript(fileScript)}
                    >
                      <ScriptIcon icon={fileScript.icon ?? "play"} className="size-4 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{fileScript.name}</div>
                        <div className="truncate font-mono text-muted-foreground">
                          {fileScript.command}
                        </div>
                      </div>
                    </MenuItem>
                  ))}
                </MenuPopup>
              </Menu>
            ) : null}
            {mixed ? (
              <Button
                size="toolbar"
                variant="outline"
                disabled={saving || !canWriteSettings || targets.length === 0}
                onClick={() => setRequest({ scriptId: null, initial: EMPTY_PROJECT_SCRIPT_INPUT })}
              >
                <PlusIcon className="size-3.5" />
                {t.settings.projectActions.addAction}
              </Button>
            ) : null}
          </div>
        }
      />
      {mixed ? (
        <SettingsRow
          title={t.settings.projectActions.differentActionsAcrossEnvironments}
          description={t.settings.projectActions.oneEnvironmentEditListAddingHint}
        />
      ) : null}
      {t3File.status === "invalid" ? (
        <SettingsRow
          title={t.settings.projectActions.t3JsonIsInvalid}
          description={t.settings.projectActions.tJsonExistsCheckoutButHint}
          className="text-warning"
        />
      ) : null}
      {target && (
        <ProjectScriptEditorDialog
          environmentId={target.environmentId}
          editScope={AuthSettingsWriteScope}
          request={request}
          scripts={scripts}
          onSubmit={submit}
          onDelete={(id) =>
            void persist((current) => current.filter((script) => script.id !== id), id, null)
          }
          onClose={() => setRequest(null)}
        />
      )}
    </SettingsSection>
  );
}
