/** Hosts the Diff toolbar and loading states inside the existing right-panel slab. */
import type { ReactNode } from "react";

import { isElectron } from "~/env";
import { cn } from "~/lib/utils";

import { Skeleton } from "./ui/skeleton";

/** Placement selected by the existing right-panel host. */
export type DiffPanelMode = "inline" | "sheet" | "sidebar" | "embedded";

/** Preserve native drag regions only where this Diff owns window chrome. */
function getDiffPanelHeaderRowClassName(mode: DiffPanelMode) {
  const shouldUseDragRegion = isElectron && mode !== "sheet" && mode !== "embedded";
  return cn(
    "pn3-toolbar flex min-h-8.5 shrink-0 flex-wrap items-center justify-between gap-0.5",
    shouldUseDragRegion
      ? "drag-region min-h-(--workspace-topbar-height) wco:pr-(--workspace-native-controls-inset)"
      : "h-auto",
  );
}

/** Render the scope toolbar and body; panel tabs remain owned by the parent. */
export function DiffPanelShell(props: {
  mode: DiffPanelMode;
  header: ReactNode;
  children: ReactNode;
}) {
  const shouldUseDragRegion = isElectron && props.mode !== "sheet" && props.mode !== "embedded";

  return (
    <div
      className={cn(
        "flex h-full min-h-0 min-w-0 flex-col gap-2 bg-transparent px-3 pb-3",
        props.mode === "inline"
          ? "w-[42vw] min-w-[360px] max-w-[560px] shrink-0 border-l border-border"
          : "w-full",
      )}
    >
      {shouldUseDragRegion ? (
        <div className={getDiffPanelHeaderRowClassName(props.mode)}>{props.header}</div>
      ) : (
        <div className={getDiffPanelHeaderRowClassName(props.mode)} data-surface-subheader>
          {props.header}
        </div>
      )}
      {props.children}
    </div>
  );
}

/** Match the 38px K4 file header while metadata is loading. */
export function DiffFileHeaderSkeleton({
  titleWidth,
}: {
  titleWidth: "short" | "medium" | "long";
}) {
  return (
    <div className="flex h-9.5 items-center gap-2.5 rounded-compact-row bg-input px-3.5 shadow-pn3-header">
      <div className="flex size-5 shrink-0 items-center justify-center">
        <Skeleton className="size-2.5" />
      </div>
      <Skeleton className="size-5 shrink-0" />
      <Skeleton
        shape="pill"
        className={
          titleWidth === "short"
            ? "h-3 w-2/5 max-w-52"
            : titleWidth === "medium"
              ? "h-3 w-1/2 max-w-64"
              : "h-3 w-3/5 max-w-72"
        }
      />
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <Skeleton shape="pill" className="h-3 w-5" />
        <Skeleton shape="pill" className="h-3 w-5" />
      </div>
    </div>
  );
}

/** Reserve one code placeholder row without starting a viewer or worker. */
function DiffCodeLineSkeleton({ width }: { width: "short" | "medium" | "long" }) {
  return (
    <div className="flex items-center gap-3">
      <Skeleton shape="pill" className="h-2.5 w-5 shrink-0" />
      <Skeleton
        shape="pill"
        className={
          width === "short" ? "h-2.5 w-3/5" : width === "medium" ? "h-2.5 w-2/3" : "h-2.5 w-4/5"
        }
      />
    </div>
  );
}

/** Announce loading while preserving the file-list structure. */
export function DiffPanelLoadingState(props: { label: string }) {
  return (
    <div
      className="min-h-0 flex-1 overflow-hidden bg-background"
      role="status"
      aria-live="polite"
      aria-label={props.label}
    >
      <DiffFileHeaderSkeleton titleWidth="medium" />
      <div className="flex h-6 items-center gap-2 px-2 pr-3">
        <div className="h-px flex-1 bg-border/40" />
        <Skeleton shape="pill" className="h-2.5 w-24" />
        <div className="h-px flex-1 bg-border/40" />
      </div>
      <div className="space-y-2 px-3 py-2">
        <DiffCodeLineSkeleton width="medium" />
        <DiffCodeLineSkeleton width="long" />
        <DiffCodeLineSkeleton width="short" />
      </div>
      <DiffFileHeaderSkeleton titleWidth="short" />
      <DiffFileHeaderSkeleton titleWidth="long" />
      <span className="sr-only">{props.label}</span>
    </div>
  );
}
