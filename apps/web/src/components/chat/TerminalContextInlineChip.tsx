/** Displays captured terminal excerpts and their expiry state. */
import { t } from "~/i18n";
import { TerminalIcon } from "lucide-react";

import type { ContextPresentationCapability } from "../contextPresentationRegistry";
import { ContextChipPopover, ContextChipShell } from "../contextChipParts";

interface TerminalContextInlineChipProps {
  label: string;
  terminalLabel: string;
  lineStart: number;
  lineEnd: number;
  text: string;
  detailsMode: ContextPresentationCapability["details"];
  expired?: boolean;
}

/**
 * Renders a captured terminal excerpt as a chip with the permitted detail presentation.
 * @param props - Required display/terminal labels, inclusive captured line bounds, text (possibly
 * empty), and detailsMode. expired defaults to false; no required field accepts null.
 * @returns The terminal chip, with a popover only for non-expired nonempty text when allowed; never
 * null.
 */
export function TerminalContextInlineChip(props: TerminalContextInlineChipProps) {
  const { label, terminalLabel, lineStart, lineEnd, text, detailsMode, expired = false } = props;

  if (!expired && text.length > 0 && detailsMode === "popover") {
    return (
      <ContextChipPopover
        kind="terminal"
        icon={<TerminalIcon />}
        label={label}
        accessibleLabel={t.chat.terminalContext.excerpt(label)}
      >
        <div className="overflow-hidden rounded-md border border-border/70 bg-background/80">
          <div className="flex items-center gap-2 border-b border-border/70 px-3 py-2">
            <TerminalIcon className="size-4 shrink-0 text-success" aria-hidden />
            <span className="min-w-0 truncate text-sm font-medium text-foreground">
              {terminalLabel}
            </span>
            <span className="ml-auto shrink-0 text-secondary-label text-xs">
              {t.chat.terminalContext.lines(lineStart, lineEnd)}
            </span>
          </div>
          <pre
            className="max-h-80 overflow-auto whitespace-pre bg-muted p-3 font-mono text-foreground text-xs leading-relaxed outline-none [tab-size:4] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            aria-label={t.chat.terminalContext.capturedTerminalOutput}
            tabIndex={0}
          >
            {text}
          </pre>
        </div>
      </ContextChipPopover>
    );
  }

  return (
    <ContextChipShell
      kind="terminal"
      {...(expired ? { state: "invalid" as const } : {})}
      icon={<TerminalIcon />}
      label={label}
      aria-label={t.chat.terminalContext.expiredLabel(label, expired)}
      data-terminal-context-expired={expired ? "true" : undefined}
      tooltip={
        expired
          ? t.chat.terminalContext.expiredHint(label)
          : detailsMode === "none"
            ? undefined
            : text
      }
    />
  );
}
