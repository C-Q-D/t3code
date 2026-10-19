/** Shared subagent status, model and detail wording for the timeline card, lineage rows and hover card. */
import { t } from "~/i18n";
import { isTerminalSubagentStatus } from "@t3tools/client-runtime/state/subagentRuntime";
import { resolveSubagentMetadata } from "@t3tools/client-runtime/state/subagent-display";
import type {
  OrchestrationV2Subagent,
  OrchestrationV2ThreadShell,
  OrchestrationV2TurnItem,
  ProviderInstanceId,
  ServerProvider,
} from "@t3tools/contracts";
import { getModelSelectionStringOptionValue, resolveSelectableModel } from "@t3tools/shared/model";

import { cn } from "~/lib/utils";
import { deriveProviderInstanceEntries, shouldShowInstanceBadge } from "../../providerInstances";
import { PixelIcon } from "../icons/PixelIcon";
import type { PixelIconName } from "../icons/pixelSprites";
import { getTraitsSpeedDisplay } from "./TraitsSpeed";

type SubagentStatus = OrchestrationV2TurnItem["status"];

/**
 * In-flight states all present as Working, the way the agents fleet view did:
 * detail belongs in the activity line, and a waiting or queued subagent is
 * still the fleet doing its job. Only settled states differentiate. Idle reads
 * as settled rather than in progress, since a resting child looks done unless
 * resumed.
 */
const STATUS_VISUALS: Record<
  SubagentStatus,
  { readonly dotClass: string; readonly textClass: string; readonly label: string }
> = {
  pending: {
    dotClass: "bg-info",
    textClass: "text-update-foreground",
    label: t.chat.timeline.queued,
  },
  running: {
    dotClass: "bg-info",
    textClass: "text-update-foreground",
    label: t.chat.timeline.running,
  },
  waiting: {
    dotClass: "bg-info",
    textClass: "text-update-foreground",
    label: t.chat.timeline.waiting,
  },
  idle: {
    dotClass: "bg-muted-foreground/50",
    textClass: "text-muted-foreground",
    label: t.chat.timeline.idleResumable,
  },
  completed: {
    dotClass: "bg-success",
    textClass: "text-success-foreground",
    label: t.chat.timeline.completed,
  },
  failed: { dotClass: "bg-destructive", textClass: "text-error", label: t.chat.timeline.failed },
  cancelled: {
    dotClass: "bg-muted-foreground/60",
    textClass: "text-muted-foreground",
    label: t.chat.timeline.stopped,
  },
  interrupted: {
    dotClass: "bg-muted-foreground/60",
    textClass: "text-muted-foreground",
    label: t.chat.timeline.stopped,
  },
};

/** Dot color, label color and wording for one subagent status; the same everywhere a child appears. */
export function subagentStatusVisual(status: SubagentStatus) {
  return STATUS_VISUALS[status];
}

/** Status dot followed by its label, colored by state. */
export function SubagentStatusLabel(props: {
  readonly status: SubagentStatus;
  /** Overrides the wording, e.g. a notification's frozen outcome; the color still follows status. */
  readonly label?: string | undefined;
  readonly className?: string | undefined;
}) {
  const visual = subagentStatusVisual(props.status);
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 text-meta-large font-medium whitespace-nowrap",
        visual.textClass,
        props.className,
      )}
    >
      <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", visual.dotClass)} />
      {props.label ?? visual.label}
    </span>
  );
}

/** The child's pixel character on a rounded tile, with its status dot in the corner. */
export function SubagentAvatar(props: {
  /** Computed from run/parent groups in the loaded projection, never the visible row order. */
  readonly pixelIconName?: PixelIconName | undefined;
  /** Omitted when the row states the status elsewhere and a dot would only add noise. */
  readonly status?: SubagentStatus | undefined;
  /** md is the timeline card's 32px tile; sm is the 26px lineage tile. */
  readonly size?: "md" | "sm";
  /** Ring color classes matching the surface behind the tile, including its hover surface. */
  readonly ringClassName: string;
}) {
  const size = props.size ?? "md";
  return (
    <span
      aria-hidden
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center bg-surface-raised",
        size === "md" ? "size-8 rounded-toast-icon" : "size-6.5 rounded-lg",
      )}
    >
      <PixelIcon name={props.pixelIconName ?? "subagent"} size={size === "md" ? 16 : 14} />
      {props.status ? (
        <span
          className={cn(
            "absolute -right-0.5 -bottom-0.5 size-2.25 rounded-full ring-2",
            props.ringClassName,
            subagentStatusVisual(props.status).dotClass,
          )}
        />
      ) : null}
    </span>
  );
}

/** The server's placeholder when a child ends without output; the status already says it. */
const GENERIC_CHILD_END = /^Child task ended with status\b/i;

/** One line of a markdown result: drop list bullets, code ticks, and link targets. */
function plainDetail(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`/g, "")
    .replace(/^[ \t]*[-*][ \t]+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * One-line activity or outcome for a row: live work leads with progress, settled work with its result.
 * @param input Status plus the child's latest progress and result text; either may be missing.
 * @returns Plain text without markdown, at most DETAIL_LINE_MAX_CHARS plus an ellipsis, or null
 * when there is nothing beyond the status to say.
 */
export function subagentDetailLine(input: {
  readonly status: SubagentStatus;
  readonly result: string | null | undefined;
  readonly progress: string | null | undefined;
}): string | null {
  const result = input.result?.trim();
  const progress = input.progress?.trim();
  const raw = isTerminalSubagentStatus(input.status) ? result || progress : progress || result;
  if (!raw || GENERIC_CHILD_END.test(raw)) return null;
  const line = plainDetail(raw);
  // Rows truncate visually; capping keeps a long final report out of every row's DOM.
  return line.length > DETAIL_LINE_MAX_CHARS
    ? `${line.slice(0, DETAIL_LINE_MAX_CHARS).trimEnd()}…`
    : line || null;
}

/** Matches the hover card's preview cap, so a row never carries more text than its card. */
const DETAIL_LINE_MAX_CHARS = 280;

/** Everything that decides how a child's model reads; the same props the hover card receives. */
export interface SubagentModelInput {
  readonly model: string | null;
  readonly providerInstanceId: ProviderInstanceId;
  readonly origin: OrchestrationV2Subagent["origin"];
  readonly modelSelection?: OrchestrationV2Subagent["modelSelection"];
  readonly provider?: ServerProvider | undefined;
  /** The environment's instances; with several accounts on one provider, the summary names this one. */
  readonly providers?: ReadonlyArray<ServerProvider> | undefined;
  readonly childThread?: Pick<OrchestrationV2ThreadShell, "modelSelection"> | undefined;
}

/**
 * Resolves the child's model name, reasoning effort, speed tier and account the way the composer names them.
 * @param input Reported model and provider context; the selection only counts when it names the same model.
 * @returns modelLabel is null when the provider has not reported a model; effort, speed and
 * instanceName are null when they do not apply.
 */
export function resolveSubagentModelSummary(input: SubagentModelInput) {
  const model = input.model?.trim();
  const { modelLabel } = resolveSubagentMetadata({ model: input.model, provider: input.provider });
  const provider = input.provider;
  const modelSlug = provider
    ? resolveSelectableModel(provider.driver, model, provider.models)
    : model;
  const providerModel = provider?.models.find((candidate) => candidate.slug === modelSlug);
  const childSelection =
    input.modelSelection ??
    (input.origin === "app_owned" ? input.childThread?.modelSelection : undefined);
  const childModel = provider
    ? (resolveSelectableModel(provider.driver, childSelection?.model, provider.models) ??
      childSelection?.model.trim())
    : childSelection?.model.trim();
  const matchingSelection =
    childModel === (modelSlug ?? model) && childSelection?.instanceId === input.providerInstanceId
      ? childSelection
      : undefined;
  const effort =
    ["reasoningEffort", "effort", "reasoning", "variant"]
      .map((id) => getModelSelectionStringOptionValue(matchingSelection, id))
      .find(Boolean) ?? null;
  const speed = provider
    ? (providerModel?.capabilities?.optionDescriptors
        ?.map((descriptor) => {
          const saved = matchingSelection?.options?.find((option) => option.id === descriptor.id);
          if (
            descriptor.id === "fastMode" &&
            descriptor.type === "boolean" &&
            typeof saved?.value === "boolean"
          ) {
            return getTraitsSpeedDisplay(provider.driver, {
              ...descriptor,
              currentValue: saved.value,
            });
          }
          if (
            provider.driver === "codex" &&
            descriptor.id === "serviceTier" &&
            descriptor.type === "select" &&
            typeof saved?.value === "string" &&
            descriptor.options.some((option) => option.id === saved.value)
          ) {
            return getTraitsSpeedDisplay(provider.driver, {
              ...descriptor,
              currentValue: saved.value,
            });
          }
          return null;
        })
        .find(Boolean) ?? null)
    : null;
  const entries = deriveProviderInstanceEntries(input.providers ?? []);
  const entry = entries.find((candidate) => candidate.instanceId === provider?.instanceId);
  const instanceName =
    entry !== undefined && shouldShowInstanceBadge(entry, entries) ? entry.displayName : null;
  return { modelLabel: model ? modelLabel : null, effort, speed, instanceName };
}

/** "Fable 5.1 · high" for rows too narrow for the account name; null when no model was reported. */
export function formatSubagentModelText(
  summary: Pick<ReturnType<typeof resolveSubagentModelSummary>, "modelLabel" | "effort">,
): string | null {
  if (summary.modelLabel === null) return null;
  return summary.effort ? `${summary.modelLabel} · ${summary.effort}` : summary.modelLabel;
}
