/** Owns the project, topic and controlled seats for discussion creation; templates never start providers. */
import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { useEffect, useId, useRef, useState } from "react";
import { t } from "~/i18n";
import { isElectron } from "~/env";
import { useEnvironments } from "~/state/environments";
import {
  useAllEnvironmentShellsBootstrapped,
  useProjects,
  useThreadShells,
} from "~/state/entities";
import { useEnvironmentQuery } from "~/state/query";
import { serverEnvironment } from "~/state/server";
import { useAtomCommand } from "~/state/use-atom-command";
import { sortScopedProjectsForSidebar } from "../Sidebar.logic";
import { SidebarInset } from "../ui/sidebar";
import { Button } from "../ui/button";
import {
  Combobox,
  ComboboxTrigger,
  ComboboxPopup,
  ComboboxSearchInput,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty,
} from "../ui/combobox";
import { Select, SelectTrigger, SelectValue, SelectPopup, SelectItem } from "../ui/select";
import { toastManager } from "../ui/toast";
import { WorkspacePageHeader } from "../WorkspacePageHeader";
import { DiscussionSeats } from "./DiscussionSeats";
import { DiscussionTemplateEditor } from "./DiscussionTemplateEditor";
import type { DiscussionDraftSeat } from "./discussionSeats.logic";
import {
  canStartDiscussion,
  buildDiscussionCreateInput,
  discussionCreatedRoute,
} from "./discussionCreate.logic";

/** Uses the same recent-project default as the new-thread landing page and keeps topic text across project changes. */
export function DiscussionSeatDraftPage() {
  const projects = useProjects();
  const threads = useThreadShells();
  const bootstrapped = useAllEnvironmentShellsBootstrapped();
  const { environments } = useEnvironments();
  const orderedProjects = sortScopedProjectsForSidebar(projects, threads, "updated_at");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [topic, setTopic] = useState("");
  const [query, setQuery] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const keyFor = (project: (typeof projects)[number]) =>
    JSON.stringify([project.environmentId, project.id]);
  const project =
    projects.find((item) => keyFor(item) === selectedKey) ??
    (bootstrapped ? orderedProjects[0] : null);
  // Freeze the landing default once catalogs arrive, so background thread activity cannot retarget a draft.
  if (project && selectedKey !== keyFor(project)) setSelectedKey(keyFor(project));
  const items = orderedProjects.map((item) => ({
    value: keyFor(item),
    label: item.title,
    project: item,
  }));
  const selectedItem = items.find((item) => item.value === selectedKey) ?? null;
  const filteredItems = items.filter((item) =>
    item.label.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  const connected =
    environments.find((item) => item.environmentId === project?.environmentId)?.connection.phase ===
    "connected";
  return (
    <SidebarInset>
      <WorkspacePageHeader electron={isElectron} className="border-b">
        <h1 className="truncate text-sm font-medium">{t.discussions.newTitle}</h1>
      </WorkspacePageHeader>
      <div className="scrollbar-gutter-both flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-10 pb-14">
        <div className="flex w-full max-w-192 flex-col gap-7 py-6">
          <h2
            className="text-center text-2xl font-normal leading-tight"
            aria-label={t.discussions.hero(project?.title ?? t.discussions.chooseProject)}
          >
            {t.discussions.heroPrefix}
            <Combobox
              items={items}
              filteredItems={filteredItems}
              itemToStringLabel={(item) => item.label}
              isItemEqualToValue={(a, b) => a.value === b.value}
              value={selectedItem}
              open={pickerOpen}
              onOpenChange={(open) => {
                setPickerOpen(open);
                if (!open) setQuery("");
              }}
              onValueChange={(item) => {
                if (item && !saving) {
                  setSelectedKey(item.value);
                  setPickerOpen(false);
                }
              }}
            >
              <ComboboxTrigger
                aria-label={t.discussions.chooseProject}
                disabled={saving || items.length === 0}
                render={
                  <button
                    type="button"
                    className="inline cursor-pointer font-normal text-muted-foreground underline decoration-dotted underline-offset-6 outline-none hover:text-foreground focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  />
                }
              >
                {project?.title ?? t.discussions.chooseProject}
              </ComboboxTrigger>
              <ComboboxPopup>
                <ComboboxSearchInput
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  aria-label={t.discussions.chooseProject}
                  placeholder={t.discussions.chooseProject}
                />
                <ComboboxEmpty>{t.discussions.noProjects}</ComboboxEmpty>
                <ComboboxList>
                  {(item) => (
                    <ComboboxItem key={item.value} value={item}>
                      {item.label}
                    </ComboboxItem>
                  )}
                </ComboboxList>
              </ComboboxPopup>
            </Combobox>
            {t.discussions.heroSuffix}
          </h2>
          {project && connected ? (
            <SeatDraft
              key={project.environmentId}
              environmentId={project.environmentId}
              projectId={project.id}
              topic={topic}
              onTopicChange={setTopic}
              onSavingChange={setSaving}
            />
          ) : (
            <p className="text-center text-sm text-muted-foreground">
              {!project ? t.discussions.noProjects : t.settings.scheduledTasks.disconnected}
            </p>
          )}
        </div>
      </div>
    </SidebarInset>
  );
}

/**
 * Retains the B4 seat state and initializes it once from the environment's first template.
 * @param props.environmentId Fixed catalog/command destination; changing environments remounts seats.
 * @param props.projectId Selected project in that environment.
 * @param props.topic Parent-owned text retained across project changes.
 * @param props.onTopicChange Replaces raw topic text without trimming.
 * @param props.onSavingChange Locks the parent project picker while create is pending.
 * @returns Complete creation controls and a prefilled template editor; only explicit start submits a discussion.
 */
function SeatDraft({
  environmentId,
  projectId,
  topic,
  onTopicChange,
  onSavingChange,
}: {
  readonly environmentId: EnvironmentId;
  readonly projectId: ProjectId;
  readonly topic: string;
  readonly onTopicChange: (topic: string) => void;
  readonly onSavingChange: (saving: boolean) => void;
}) {
  const templateLabelId = useId();
  const templates = useEnvironmentQuery(
    serverEnvironment.discussionTemplatesLive({ environmentId, input: {} }),
  );
  const support = useEnvironmentQuery(
    serverEnvironment.discussionProviderSupport({ environmentId, input: {} }),
  );
  const [seats, setSeats] = useState<readonly DiscussionDraftSeat[]>([]);
  const [templateId, setTemplateId] = useState<string>("none");
  const [initialized, setInitialized] = useState(false);
  const [templateEditorOpen, setTemplateEditorOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const submissionPending = useRef(false);
  const unmounted = useRef(false);
  useEffect(() => {
    unmounted.current = false;
    return () => {
      unmounted.current = true;
    };
  }, []);
  const navigate = useNavigate();
  const create = useAtomCommand(serverEnvironment.createDiscussion);
  const canCreate = useAtomValue(serverEnvironment.createDiscussion.permissionAtom(environmentId));
  const canSaveTemplate = useAtomValue(
    serverEnvironment.upsertDiscussionTemplate.permissionAtom(environmentId),
  );
  if (!initialized && templates.data) {
    const first = templates.data.templates[0];
    setTemplateId(first?.id ?? "none");
    setSeats(first?.seats ?? []);
    setInitialized(true);
  }
  const startEnabled = canStartDiscussion(
    { projectId, topic, seats },
    support.data ?? null,
    canCreate,
    saving,
  );
  const start = async () => {
    if (!startEnabled || submissionPending.current) return;
    // Lock synchronously, since configuration queues cannot deduplicate separate creates.
    // No local timeout or automatic retry: an interrupted response can have an unknown write outcome.
    submissionPending.current = true;
    setSaving(true);
    onSavingChange(true);
    const result = await create({
      environmentId,
      input: buildDiscussionCreateInput(projectId, topic, seats),
    });
    if (result._tag === "Failure") {
      submissionPending.current = false;
      setSaving(false);
      onSavingChange(false);
      if (!isAtomCommandInterrupted(result))
        toastManager.add({
          type: "error",
          title: t.discussions.startFailed,
          description: String(squashAtomCommandFailure(result)),
        });
      return;
    }
    // Leaving is allowed: suppress navigation after unmount, without cancelling the server's
    // create. The discussion still exists in the list; failures retain the existing toast path.
    if (unmounted.current) return;
    // Keep the successful create locked until navigation replaces and unmounts this form.
    await navigate(discussionCreatedRoute(environmentId, result.value.discussion.id));
  };
  const templateItems = [
    { value: "none", label: t.discussions.noTemplate },
    ...(templates.data?.templates ?? []).map((item) => ({ value: item.id, label: item.name })),
  ];
  return (
    <>
      <div className="flex flex-col gap-4">
        {templates.error ? (
          <p role="alert" className="text-sm text-destructive">
            {templates.error}
          </p>
        ) : null}
        {!initialized ? (
          <p role="status" className="text-sm text-muted-foreground">
            {t.discussions.loadingTemplates}
          </p>
        ) : null}
        <fieldset disabled={saving || !initialized} className="min-w-0">
          <DiscussionSeats
            environmentId={environmentId}
            seats={seats}
            onChange={setSeats}
            headerAction={
              <div className="flex items-center gap-2">
                <span id={templateLabelId} className="text-xs text-muted-foreground">
                  {t.discussions.template}
                </span>
                <div className="min-w-33">
                  <Select
                    items={templateItems}
                    value={templateId}
                    onValueChange={(value) => {
                      if (!value) return;
                      setTemplateId(value);
                      setSeats(
                        templates.data?.templates.find((item) => item.id === value)?.seats ?? [],
                      );
                    }}
                  >
                    <SelectTrigger aria-labelledby={templateLabelId}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectPopup>
                      {templateItems.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectPopup>
                  </Select>
                </div>
              </div>
            }
          />
        </fieldset>
        <form
          className="rounded-3xl border bg-card shadow-sm dark:shadow-none"
          onSubmit={(event) => {
            event.preventDefault();
            void start();
          }}
        >
          <div className="px-5 pt-4.5 pb-2.5">
            <textarea
              aria-label={t.discussions.topicLabel}
              value={topic}
              disabled={saving}
              onChange={(event) => onTopicChange(event.target.value)}
              placeholder={t.discussions.topicPlaceholder}
              rows={2}
              className="field-sizing-content block max-h-52 min-h-11 w-full resize-none overflow-y-auto bg-transparent text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            />
          </div>
          <div className="flex items-center gap-2 pt-2 pr-3 pb-3 pl-5">
            <span className="min-w-0 flex-1 text-xs text-muted-foreground">
              {t.discussions.permissionsHint}
            </span>
            <Button
              type="button"
              variant="secondary"
              disabled={!canSaveTemplate || saving || !initialized}
              onClick={() => setTemplateEditorOpen(true)}
            >
              {t.discussions.saveAsTemplate}
            </Button>
            <Button type="submit" disabled={!startEnabled}>
              {t.discussions.start}
            </Button>
          </div>
        </form>
      </div>
      {templateEditorOpen ? (
        <DiscussionTemplateEditor
          environmentId={environmentId}
          initialSeats={seats}
          onClose={() => setTemplateEditorOpen(false)}
        />
      ) : null}
    </>
  );
}
