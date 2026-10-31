/** Presents entry actions when the current workspace has no projects. */
import { workspaceAreaProps } from "../lib/workspaceFocus";
import { t } from "~/i18n";
import { FolderOpenIcon, FolderPlusIcon } from "lucide-react";

import { openCommandPalette } from "../commandPaletteBus";
import { isElectron } from "../env";
import { useScratchProject } from "../hooks/useScratchProject";
import { usePrimaryEnvironmentId } from "../state/environments";
import { SidebarInset } from "./ui/sidebar";
import { WorkspacePageHeader } from "./WorkspacePageHeader";

/** Offers project creation and, when an eligible environment exists, starting a scratch conversation. */
export function NoProjectsHero() {
  const contentArea = workspaceAreaProps("home", 1, "Home");
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const { scratchEnvironmentId, startScratchThread } = useScratchProject();
  const scratchTargetEnvironmentId = scratchEnvironmentId(primaryEnvironmentId);

  return (
    <SidebarInset
      {...contentArea}
      role="main"
      className="h-full min-h-0 overflow-hidden overscroll-y-none"
    >
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden stone-base">
        {/* The desktop window only moves where CSS opts in, so keep a titlebar strip. */}
        {isElectron ? <WorkspacePageHeader electron /> : null}
        <div className="flex min-h-0 flex-1 p-4">
          <section className="flex min-w-0 flex-1 flex-col items-center justify-center gap-3 overflow-auto scrollbar-gutter-both rounded-slab bg-card p-6 text-center text-foreground shadow-ov3-slab text-shadow-stone">
            <h1 className="font-serif text-ov3-project-title font-semibold">
              {t.app.projects.heroTitle}
            </h1>
            <p className="text-body text-secondary-label">{t.app.projects.addFirst}</p>
            <div className="mt-1.5 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                className="ov3-action ov3-action-primary gap-1.5 pr-4 pl-3"
                onClick={() => openCommandPalette({ open: "add-project" })}
              >
                <FolderPlusIcon className="size-3.75" aria-hidden="true" />
                {t.sidebar.header.addProject}
              </button>
              {/* S3 draws a separate folder action; no standalone command is exposed by the current palette. */}
              <button
                type="button"
                className="ov3-action ov3-action-secondary gap-1.5 pr-4 pl-3"
                aria-disabled="true"
              >
                <FolderOpenIcon className="size-3.75" strokeWidth={1.75} aria-hidden="true" />
                {t.app.projects.open}
              </button>
            </div>
            {scratchTargetEnvironmentId === null ? null : (
              <button
                type="button"
                className="cursor-pointer text-secondary-copy-large text-secondary-label underline decoration-border underline-offset-4 outline-none hover:text-foreground focus-visible:inset-shadow-focus"
                onClick={() => void startScratchThread(scratchTargetEnvironmentId)}
              >
                {t.app.projects.startWithout}
              </button>
            )}
          </section>
        </div>
      </div>
    </SidebarInset>
  );
}
