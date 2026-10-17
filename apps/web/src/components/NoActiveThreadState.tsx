/** Displays the empty web workspace when no thread is active; navigation remains with the workspace shell. */
import { t } from "~/i18n";
import { MessagesSquareIcon } from "lucide-react";
import { SidebarInset } from "./ui/sidebar";
import { isElectron } from "../env";
import { WorkspacePageHeader } from "./WorkspacePageHeader";

/** Renders the inactive workspace with guidance to select or create a thread. */
export function NoActiveThreadState() {
  return (
    <SidebarInset className="h-full min-h-0 overflow-hidden overscroll-y-none">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden stone-base">
        <WorkspacePageHeader electron={isElectron} className="border-b border-border">
          {isElectron ? (
            <span className="text-xs text-muted-foreground/50">{t.chat.view.noActiveThread}</span>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground md:text-muted-foreground/60">
                {t.chat.view.noActiveThread}
              </span>
            </div>
          )}
        </WorkspacePageHeader>

        <div className="flex min-h-0 flex-1 p-4">
          <section className="flex min-w-0 flex-1 flex-col items-center justify-center gap-3 overflow-auto scrollbar-gutter-both rounded-slab bg-card p-6 text-center text-foreground shadow-ov3-slab text-shadow-stone">
            <span className="flex size-13 shrink-0 items-center justify-center rounded-card-row text-secondary-label shadow-ov3-inactive-icon">
              <MessagesSquareIcon className="size-5.5" strokeWidth={1.75} aria-hidden="true" />
            </span>
            <h1 className="font-serif text-ov3-inactive-title font-bold">
              {t.chat.view.noActiveThread}
            </h1>
            <p className="text-body font-semibold text-fg-detail">{t.chat.view.pickThread}</p>
            <p className="text-body text-secondary-label">{t.chat.view.pickThreadDescription}</p>
          </section>
        </div>
      </div>
    </SidebarInset>
  );
}
