/** K6 content-search chrome; the dialog owner retains dismissal and the caller owns search/navigation. */
import { Autocomplete } from "@base-ui/react/autocomplete";
import { Search } from "lucide-react";
import { useLayoutEffect, useRef, type ComponentProps, type ReactNode } from "react";

/** Controlled query, native input behavior and result content for project content search. */
interface ProjectContentSearchShellProps {
  readonly "aria-label": string;
  readonly children: ReactNode;
  readonly inputAccessory?: ReactNode;
  readonly inputProps: ComponentProps<typeof Autocomplete.Input>;
  readonly value: string;
  readonly onValueChange?: (value: string) => void;
}

/**
 * Mounts the K6 search well and reclaims focus when a palette switches to content search.
 * @param props Controlled query and input events; children provide status and windowed results.
 * @returns Search chrome within the existing modal, without changing its Escape behavior.
 */
export function ProjectContentSearchShell({
  children,
  inputAccessory,
  inputProps,
  value,
  onValueChange,
  "aria-label": label,
}: ProjectContentSearchShellProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    inputRef.current?.focus();
  }, []);
  return (
    <Autocomplete.Root inline open mode="none" value={value} onValueChange={onValueChange}>
      <div data-testid="project-content-search" className="flex min-h-0 flex-1 flex-col gap-2 p-3">
        <div className="surface-glass flex h-9 shrink-0 items-center gap-1 rounded-full">
          <div className="flex h-full w-full items-center gap-1 rounded-full bg-input pl-3 pr-1 shadow-well-track focus-within:inset-shadow-focus">
            <Search className="size-3.5 shrink-0" />
            <Autocomplete.Input
              {...inputProps}
              ref={inputRef}
              aria-label={label}
              className="ml-1 h-full min-w-0 flex-1 bg-transparent text-secondary-copy-large text-foreground outline-none placeholder:text-placeholder disabled:text-fg-control-disabled"
            />
            {inputAccessory}
          </div>
        </div>
        {children}
      </div>
    </Autocomplete.Root>
  );
}
