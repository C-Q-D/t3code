/** Localized palette UI and interactions; preserves user data, commands, and protocol values. */
import { t } from "~/i18n";
import { Autocomplete as AutocompletePrimitive } from "@base-ui/react/autocomplete";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ArrowUpDownIcon,
  CornerDownLeftIcon,
  DeleteIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import { type ComponentProps, type ReactNode, useEffect, useRef } from "react";

import { Command, CommandFooter, CommandInput, CommandPanel } from "./ui/command";
import { Kbd, KbdGroup } from "./ui/kbd";
import { cn } from "~/lib/utils";

/** Query and chrome inputs; result ownership and navigation remain with the caller. */
type CommandPaletteContentProps = Omit<ComponentProps<typeof Command>, "children"> & {
  readonly children: ReactNode;
  readonly escapeLabel?: ReactNode;
  readonly footerActionLabel?: ReactNode;
  readonly footerTrailing?: ReactNode;
  readonly inputAccessory?: ReactNode;
  readonly inputProps: ComponentProps<typeof CommandInput>;
  readonly panelSize?: "list" | "tall-list" | "fill";
  readonly showBackHint?: boolean;
  readonly testId?: string;
  /** K5 chrome is exclusive to command mode; file and content search keep their own shells. */
  readonly graphite?: boolean;
  readonly shortcutLabel?: string | null;
  /** Existing add-project navigation, displayed as the removable Palette8a breadcrumb. */
  readonly inputBreadcrumb?: { readonly label: string; readonly onBack: () => void };
};

/**
 * Shared command palette chrome. Palette modes provide their query behavior,
 * results, and optional input accessory while retaining one input, panel, and
 * keyboard-hint gutter.
 * @param props View data, control flags, and callbacks defined by the component props type; optional fields retain their declared defaults.
 * @returns Rendered UI for the supplied props.
 */
export function CommandPaletteContent({
  children,
  escapeLabel = t.tools.palette.close,
  footerActionLabel,
  footerTrailing,
  inputAccessory,
  inputProps,
  panelSize = "list",
  showBackHint,
  testId,
  graphite = false,
  shortcutLabel,
  inputBreadcrumb,
  ...commandProps
}: CommandPaletteContentProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Direct-open flows replace the initial palette view after the dialog has
  // already moved focus. Reclaim it when the replacement input mounts so
  // typing cannot continue in the composer behind the modal. Defer until the
  // dialog has recorded the previous focus target for restoration on close.
  useEffect(() => {
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div
      className={graphite ? "pn5-palette contents" : "contents"}
      data-pn5-submenu={showBackHint}
      data-testid={testId}
    >
      <Command {...commandProps}>
        <div className={graphite ? "pn5-search relative" : "relative"}>
          {graphite ? (
            <div className={cn("pn5-search-well", inputProps.className)}>
              <span className="pn5-search-icon">
                {inputBreadcrumb ? <SearchIcon /> : (inputProps.startAddon ?? <SearchIcon />)}
              </span>
              {inputBreadcrumb ? (
                <span className="pn5-breadcrumb">
                  {inputBreadcrumb.label}
                  <button
                    type="button"
                    aria-label={t.tools.palette.back}
                    onClick={inputBreadcrumb.onBack}
                    className="flex size-6 items-center justify-center rounded-full focus-visible:outline-ring"
                  >
                    <XIcon className="size-3" />
                  </button>
                </span>
              ) : null}
              <AutocompletePrimitive.Input
                autoFocus={false}
                ref={inputRef}
                placeholder={inputProps.placeholder}
                onKeyDown={inputProps.onKeyDown}
                data-slot="autocomplete-input"
                className="pn5-search-input"
              />
              {!inputAccessory && shortcutLabel ? <Kbd>{shortcutLabel}</Kbd> : null}
            </div>
          ) : (
            <CommandInput autoFocus={false} {...inputProps} ref={inputRef} />
          )}
          {inputAccessory}
        </div>
        {graphite ? (
          <div className="pn5-results relative min-h-0 overflow-hidden">{children}</div>
        ) : (
          <CommandPanel
            className={
              panelSize === "fill"
                ? "flex min-h-0 flex-1 flex-col"
                : panelSize === "tall-list"
                  ? "max-h-[min(34rem,76vh)]"
                  : "flex max-h-[min(28rem,70vh)] min-h-0 flex-col"
            }
          >
            {children}
          </CommandPanel>
        )}
        {graphite ? (
          <div className="pn5-footer">
            <span>
              <kbd>
                <ArrowUpDownIcon />
              </kbd>
              {t.tools.palette.navigate}
            </span>
            {footerActionLabel !== undefined ? (
              <span>
                <kbd>
                  <CornerDownLeftIcon />
                </kbd>
                {footerActionLabel}
              </span>
            ) : null}
            <span>
              <kbd>Esc</kbd>
              {escapeLabel}
            </span>
            <span>
              <kbd>
                <DeleteIcon />
              </kbd>
              {t.tools.palette.back}
            </span>
            {footerTrailing}
          </div>
        ) : (
          <CommandFooter className="max-sm:flex-col max-sm:items-start">
            <div className="flex items-center gap-3">
              <KbdGroup>
                <Kbd>
                  <ArrowUpIcon />
                </Kbd>
                <Kbd>
                  <ArrowDownIcon />
                </Kbd>
                <span>{t.tools.palette.navigate}</span>
              </KbdGroup>
              {footerActionLabel !== undefined ? (
                <KbdGroup>
                  <Kbd>Enter</Kbd>
                  <span>{footerActionLabel}</span>
                </KbdGroup>
              ) : null}
              {showBackHint ? (
                <KbdGroup>
                  <Kbd>Backspace</Kbd>
                  <span>{t.tools.palette.back}</span>
                </KbdGroup>
              ) : null}
              <KbdGroup>
                <Kbd>Esc</Kbd>
                <span>{escapeLabel}</span>
              </KbdGroup>
            </div>
            {footerTrailing}
          </CommandFooter>
        )}
      </Command>
    </div>
  );
}
