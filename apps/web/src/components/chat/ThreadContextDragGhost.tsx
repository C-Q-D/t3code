/** Renders the pointer-local thread attachment preview; the drag store owns movement and drops. */
import { PaperclipIcon } from "lucide-react";
import { createPortal } from "react-dom";

import { t } from "~/i18n";
import { ProjectFavicon, type ProjectFaviconProject } from "../ProjectFavicon";
import { useThreadContextDragGhost } from "./threadContextDrag";
import { ComposerThrowToken } from "./ComposerThrowToken";

/**
 * Follows the pointer without subscribing the sidebar list to movement.
 * @param props The source project, or null when its record is unavailable.
 * @returns A non-interactive body portal while dragging, otherwise null.
 */
export function ThreadContextDragGhost({ project }: { project: ProjectFaviconProject | null }) {
  const ghost = useThreadContextDragGhost();
  return (
    <>
      <ComposerThrowToken channel="thread" />
      {ghost === null
        ? null
        : createPortal(
            <div
              aria-hidden="true"
              className="pointer-events-none fixed left-0 top-0 z-100 flex w-62.5 flex-col gap-0.75 rounded-card-row bg-sidebar-row-drag px-3 py-2.5 text-foreground text-shadow-stone shadow-sidebar-context-drag"
              style={{ transform: `translate(${ghost.x + 12}px, ${ghost.y + 12}px) rotate(-2deg)` }}
            >
              <div className="flex min-w-0 items-center gap-1.5 text-secondary-copy leading-sidebar-context-drag text-secondary-label">
                {project ? <ProjectFavicon project={project} className="size-4" /> : null}
                <span className="min-w-0 flex-1 truncate">{project?.title}</span>
                <span className="sidebar-context-attach flex h-5.5 shrink-0 items-center gap-1 rounded-full bg-primary pr-2.25 pl-1.75 text-meta-large leading-sidebar-context-drag font-bold text-primary-foreground text-shadow-none">
                  <PaperclipIcon className="size-2.75" strokeWidth={2.25} />
                  {t.sidebar.thread.attachContext}
                </span>
              </div>
              <div className="flex min-w-0 items-center gap-1.5 text-body leading-sidebar-context-drag font-semibold">
                <span className="min-w-0 flex-1 truncate">{ghost.title}</span>
                {ghost.count > 1 ? (
                  <span className="shrink-0 text-secondary-copy text-secondary-label">
                    +{ghost.count - 1}
                  </span>
                ) : null}
              </div>
            </div>,
            document.body,
          )}
    </>
  );
}
