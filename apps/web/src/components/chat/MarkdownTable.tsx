/** Adds table navigation and export controls without changing copied table content. */
import { cn } from "../../lib/utils";
import { FileTextIcon, FileSpreadsheetIcon } from "lucide-react";
import { MarkdownTimelineContext } from "./MarkdownCodeBlock";
import { t } from "~/i18n";
import { Check, Copy, Maximize2, Minimize2 } from "lucide";
import React, {
  Children,
  isValidElement,
  use,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type ComponentProps,
} from "react";

import { getClientSettings } from "../../hooks/useSettings";
import { observeResize } from "../../lib/observeResize";
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
 * Whether any cell is clipped in the unwrapped layout. Only then does the wrap
 * toggle change anything, so short tables hide it. Measures with the container
 * briefly unwrapped and restores it before the browser paints.
 */
function tableHasClippedCells(container: HTMLElement, table: HTMLTableElement): boolean {
  const viewport = table.closest<HTMLElement>('[data-slot="scroll-area-viewport"]');
  const scrollLeft = viewport?.scrollLeft ?? 0;
  const previous = container.dataset.expanded;
  container.dataset.expanded = "false";
  try {
    for (const row of table.rows) {
      for (const cell of row.cells) {
        if (cell.scrollWidth > cell.clientWidth) return true;
      }
    }
    return false;
  } finally {
    if (previous === undefined) delete container.dataset.expanded;
    else container.dataset.expanded = previous;
    // The unwrapped layout can be narrower and clamp a sideways scroll.
    if (viewport && scrollLeft > 0) viewport.scrollLeft = scrollLeft;
  }
}

/**
 * Renders a Markdown table with cell expansion and clipboard export controls.
 * @param props - Native table attributes and children; children may be null or empty. Copy actions
 * write Markdown or CSV to the clipboard and report failures to the console.
 * @returns The table and cell-expansion control; timeline exports sit in the last header, while
 * other surfaces retain the footer export menu. Never null.
 */
export function MarkdownTable({ children, ...props }: ComponentProps<"table">) {
  const timeline = use(MarkdownTimelineContext);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const tableRef = useRef<HTMLTableElement | null>(null);
  const [expanded, setExpanded] = useState(() => getClientSettings().wordWrap);
  const [hasClippedCells, setHasClippedCells] = useState(false);
  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expandLabel = expanded
    ? t.chat.markdown.collapseTableCells
    : t.chat.markdown.expandTableCells;
  const copyLabel = copied ? t.chat.markdown.copied : t.chat.markdown.copyTable;

  const measureClippedCells = () => {
    const container = containerRef.current;
    const table = tableRef.current;
    if (!container || !table) return;
    setHasClippedCells(tableHasClippedCells(container, table));
  };

  // A streamed cell can grow until it clips while the table keeps its size,
  // so remeasure after every render, not only on resize.
  useLayoutEffect(measureClippedCells);

  // Column width changes can clip a cell without rendering this table.
  useLayoutEffect(() => {
    const table = tableRef.current;
    if (!table) return;
    return observeResize(table, measureClippedCells);
  }, [measureClippedCells]);

  const handleCopy = (format: "markdown" | "csv") => {
    const table = containerRef.current?.querySelector("table");
    if (!table || typeof navigator === "undefined" || navigator.clipboard == null) {
      return;
    }
    const text =
      format === "markdown"
        ? serializeTableElementToMarkdown(table)
        : serializeTableElementToCsv(table);
    void navigator.clipboard
      .writeText(text)
      .then(() => {
        if (copiedTimerRef.current != null) {
          clearTimeout(copiedTimerRef.current);
        }
        setCopied(true);
        copiedTimerRef.current = setTimeout(() => {
          setCopied(false);
          copiedTimerRef.current = null;
        }, 1200);
      })
      .catch((cause) => {
        reportMarkdownActionFailure({ operation: "copy-table", format }, cause);
      });
  };

  useEffect(
    () => () => {
      if (copiedTimerRef.current != null) {
        clearTimeout(copiedTimerRef.current);
        copiedTimerRef.current = null;
      }
    },
    [],
  );

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
      data-expanded={expanded ? "true" : "false"}
    >
      <div
        className={
          timeline
            ? "overflow-hidden rounded-card-row bg-timeline-file shadow-timeline-table"
            : undefined
        }
      >
        <ScrollArea radius="none" chainVerticalScroll scrollFade className="w-full max-w-full">
          <table ref={tableRef} {...props}>
            {headerTable?.children ?? children}
          </table>
        </ScrollArea>
      </div>
      <div className="mt-0.5 flex items-center justify-between select-none">
        {hasClippedCells ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant={expanded ? "secondary" : "ghost-muted"}
                  size="icon-xs"
                  aria-pressed={expanded}
                  onClick={() => setExpanded((value) => !value)}
                  aria-label={expandLabel}
                />
              }
            >
              <MorphIcon className="size-3" icon={expanded ? Minimize2 : Maximize2} />
            </TooltipTrigger>
            <TooltipPopup side="top">{expandLabel}</TooltipPopup>
          </Tooltip>
        ) : (
          <span />
        )}
        {headerTable?.inserted ? null : copyMenu}
      </div>
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
