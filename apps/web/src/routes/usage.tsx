/** Authenticates the usage route and supplies its persistent window titlebar content. */
import { createFileRoute, redirect } from "@tanstack/react-router";
import { Columns3Icon, PanelBottomIcon, PanelRightIcon } from "lucide-react";

import { UsagePage } from "../components/usage/UsagePage";
import { useTitlebarSlot } from "../components/frame/titlebarSlot";
import { t } from "../i18n";

export const Route = createFileRoute("/usage")({
  beforeLoad: async ({ context }) => {
    if (
      context.authGateState.status !== "authenticated" &&
      context.authGateState.status !== "hosted-static"
    ) {
      throw redirect({ to: "/pair", replace: true });
    }
  },
  component: UsageRoute,
});

/** Keeps the M1 window controls visible but disabled outside a thread (c-1). */
function UsageRoute() {
  const titlebar = useTitlebarSlot({
    breadcrumb: <h1 className="font-serif text-plan-title font-bold">{t.tools.usage.usage}</h1>,
    actions: (
      <div className="mr-3 flex items-center gap-1 rounded-usage-titlebar bg-usage-titlebar-well p-0.75 shadow-well-track">
        <button
          type="button"
          className="flex h-7 w-7.5 items-center justify-center rounded-usage-titlebar-key border-0 bg-surface-raised p-0 text-fg-control-disabled shadow-raise-xs-control"
          disabled
          aria-label={t.chat.panelLayout.toggleThreadDetailsPanel}
        >
          <PanelRightIcon className="size-4" />
        </button>
        <button
          type="button"
          className="flex h-7 w-7.5 items-center justify-center rounded-usage-titlebar-key border-0 bg-transparent p-0 text-fg-control-disabled"
          disabled
          aria-label={t.chat.panelLayout.toggleTerminalDrawer}
        >
          <PanelBottomIcon className="size-4" />
        </button>
        <button
          type="button"
          className="flex h-7 w-7.5 items-center justify-center rounded-usage-titlebar-key border-0 bg-transparent p-0 text-fg-control-disabled"
          disabled
          aria-label={t.chat.panelLayout.toggleRightPanel}
        >
          <Columns3Icon className="size-4" />
        </button>
      </div>
    ),
  });
  return (
    <>
      {titlebar}
      <UsagePage />
    </>
  );
}
