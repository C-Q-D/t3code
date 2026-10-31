/** Renders shell commands; the opt-in timeline view uses D1 truncation without changing other callers. */
import {
  commandHighlightLanguage,
  withVisibleControlCharacters,
} from "@t3tools/client-runtime/work-log/command-label";
import { Suspense, use } from "react";

import { useRenderedAppearance } from "../../hooks/useTheme";
import { RenderErrorBoundary } from "../RenderErrorBoundary";
import { HighlightedTokens } from "./HighlightedTokens";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

const WORD_CLASS_NAME = "inline-block max-w-full [overflow-wrap:anywhere]";

let embeddedScriptsModule: Promise<typeof import("../../lib/embeddedScripts")> | undefined;
function loadEmbeddedScripts() {
  embeddedScriptsModule ??= import("../../lib/embeddedScripts");
  return embeddedScriptsModule;
}

// Match highlighted layout to prevent reflow when the grammar arrives.
function PlainWords({ code }: { code: string }) {
  return code.split(/(\s+)/u).map((part, index) =>
    index % 2 === 1 || part === "" ? (
      part
    ) : (
      // oxlint-disable-next-line react/no-array-index-key -- positions are stable for one string
      <span key={index} className={WORD_CLASS_NAME}>
        {part}
      </span>
    ),
  );
}

function HighlightedCommand({ code, theme }: { code: string; theme: "light" | "dark" }) {
  const { embeddedScripts } = use(loadEmbeddedScripts());
  const language = commandHighlightLanguage(code);
  const embedded = language === "shellscript" ? embeddedScripts(code) : [];
  return (
    <HighlightedTokens
      code={code}
      language={language}
      embedded={embedded}
      theme={theme}
      wordClassName={WORD_CLASS_NAME}
    />
  );
}

/**
 * Display a retained command without changing its source text.
 * @param props command may be blank (renders nothing). presentation="timeline" selects D1's
 * single-line command and full-text tooltip; absent presentation preserves highlighted wrapping.
 * @returns A command block or null for blank input. Grammar failures retain the plain fallback.
 */
export function ShellCommandBlock({
  command,
  presentation,
}: {
  command: string;
  presentation?: "timeline" | undefined;
}) {
  const resolvedTheme = useRenderedAppearance();
  const code = withVisibleControlCharacters(command.trim());
  if (!code) return null;
  if (presentation === "timeline") {
    return (
      <Tooltip>
        <TooltipTrigger render={<div tabIndex={0} className="min-w-0 truncate text-foreground" />}>
          <span aria-hidden className="text-primary select-none">
            ${" "}
          </span>
          {code}
        </TooltipTrigger>
        <TooltipPopup variant="code">
          <span className="whitespace-pre-wrap">{command.trim()}</span>
        </TooltipPopup>
      </Tooltip>
    );
  }
  const plain = <PlainWords code={code} />;
  return (
    <div className="text-foreground/85">
      <RenderErrorBoundary fallback={plain} resetKeys={[code]}>
        <Suspense fallback={plain}>
          <HighlightedCommand code={code} theme={resolvedTheme} />
        </Suspense>
      </RenderErrorBoundary>
    </div>
  );
}
