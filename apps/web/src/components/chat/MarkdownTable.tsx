/** Adds table navigation and export controls without changing copied table content. */
import { cn } from "../../lib/utils";
import { FileTextIcon, FileSpreadsheetIcon } from "lucide-react";
import { MarkdownTimelineContext } from "./MarkdownCodeBlock";
import { t } from "~/i18n";
import { Check, Copy } from "lucide";
import React, {
  Children,
  isValidElement,
  use,
  useRef,
  type ReactNode,
  type ComponentProps,
} from "react";

import { useCopyToClipboard } from "../../hooks/useCopyToClipboard";
import {
  serializeTableElementToCsv,
  serializeTableElementToMarkdown,
} from "../../markdown-clipboard";
import { MorphIcon } from "../MorphIcon";
import { Button } from "../ui/button";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { ScrollArea } from "../ui/scroll-area";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { reportMarkdownActionFailure } from "./markdownActionFailure";

/**
 * Renders a Markdown table with clipboard export controls. Cells always wrap (see index.css).
 * @param props - Native table attributes and children; children may be null or empty. Copy actions
 * write Markdown or CSV to the clipboard and report failures to the console.
 * @returns The table; timeline exports sit in the last header, while other surfaces and
 * headerless tables keep the footer export menu. Never null.
 */
export function MarkdownTable({ children, ...props }: ComponentProps<"table">) {
  const timeline = use(MarkdownTimelineContext);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { copyToClipboard, isCopied: copied } = useCopyToClipboard<"markdown" | "csv">({
    timeout: 1200,
    onError: (cause, format) =>
      reportMarkdownActionFailure({ operation: "copy-table", format }, cause),
  });
  const copyLabel = copied ? t.chat.markdown.copied : t.chat.markdown.copyTable;

  const handleCopy = (format: "markdown" | "csv") => {
    const table = containerRef.current?.querySelector("table");
    if (!table) return;
    copyToClipboard(
      format === "markdown"
        ? serializeTableElementToMarkdown(table)
        : serializeTableElementToCsv(table),
      format,
    );
  };

  const copyMenu = (
    <Menu>
      <Tooltip>
        <TooltipTrigger
          render={
            <MenuTrigger
              render={
                timeline ? (
                  <button
                    type="button"
                    aria-label={copyLabel}
                    className="-my-1 -me-1.5 flex size-6.5 shrink-0 cursor-pointer items-center justify-center rounded-timeline-table-copy bg-accent text-foreground shadow-raise-tab hover:bg-secondary focus-visible:outline-none focus-visible:inset-shadow-focus"
                  />
                ) : (
                  <Button
                    type="button"
                    variant="ghost-muted"
                    size="icon-xs"
                    aria-label={copyLabel}
                  />
                )
              }
            />
          }
        >
          <MorphIcon className={timeline ? "size-3.25" : "size-3"} icon={copied ? Check : Copy} />
        </TooltipTrigger>
        <TooltipPopup side="top">{copyLabel}</TooltipPopup>
      </Tooltip>
      <MenuPopup align="end">
        <MenuItem onClick={() => handleCopy("markdown")}>
          {timeline ? <FileTextIcon aria-hidden className="size-3.5" /> : null}
          {t.chat.markdown.copyAsMarkdown}
        </MenuItem>
        <MenuItem onClick={() => handleCopy("csv")}>
          {timeline ? <FileSpreadsheetIcon aria-hidden className="size-3.5" /> : null}
          {t.chat.markdown.copyAsCSV}
        </MenuItem>
      </MenuPopup>
    </Menu>
  );
  const headerTable = timeline ? tableWithHeaderAction(children, copyMenu) : null;
  return (
    <div
      ref={containerRef}
      className={cn("chat-markdown-table-container", timeline && "timeline-markdown-table")}
    >
      <div
        className={
          timeline
            ? "overflow-hidden rounded-card-row bg-timeline-file shadow-timeline-table"
            : undefined
        }
      >
        <ScrollArea radius="none" chainVerticalScroll scrollFade className="w-full max-w-full">
          <table {...props}>{headerTable?.children ?? children}</table>
        </ScrollArea>
      </div>
      {headerTable?.inserted ? null : (
        <div className="mt-0.5 flex items-center justify-end select-none">{copyMenu}</div>
      )}
    </div>
  );
}

/**
 * Put the existing export menu inside the last header cell, without adding an exported column.
 * @param children Markdown's table sections, possibly empty; non-header content passes through.
 * @param action Existing copy menu; its icon-only trigger contributes no text to clipboard exports.
 * @returns Sections and whether the action was inserted. Headerless HTML tables retain the footer
 * export entry rather than losing a previously available operation.
 */
function tableWithHeaderAction(children: ReactNode, action: ReactNode) {
  let inserted = false;
  const sections = Children.map(children, (section) => {
    if (!isValidElement<ComponentProps<"thead">>(section) || section.type !== "thead")
      return section;
    return React.cloneElement(
      section,
      undefined,
      Children.map(section.props.children, (row) => {
        if (inserted || !isValidElement<ComponentProps<"tr">>(row) || row.type !== "tr") return row;
        const cells = Children.toArray(row.props.children);
        const lastHeader = cells.findLastIndex(
          (cell) => isValidElement(cell) && cell.type === "th",
        );
        if (lastHeader < 0) return row;
        inserted = true;
        return React.cloneElement(
          row,
          undefined,
          cells.map((cell, index) =>
            index === lastHeader && isValidElement<ComponentProps<"th">>(cell)
              ? React.cloneElement(
                  cell,
                  undefined,
                  <span className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate">{cell.props.children}</span>
                    <span data-thread-find-ignore>{action}</span>
                  </span>,
                )
              : cell,
          ),
        );
      }),
    );
  });
  return { children: sections, inserted };
}
