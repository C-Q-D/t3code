/** Loads each diagram type on demand; exported previews retain the active CSS colors. */
import { t } from "~/i18n";
import DOMPurify from "dompurify";
import type { DiagramType, MathResolver } from "pele/lazy";
import { use, useState } from "react";

import { serializeCodeBlockToMarkdown } from "../../markdown-clipboard";
import { Button } from "../ui/button";

type Pele = typeof import("pele/lazy");
type PeleLoad = { readonly status: "loaded"; readonly pele: Pele } | { readonly status: "failed" };

let coreLoad: Promise<PeleLoad> | null = null;
// Each diagram type is its own chunk, so a chat with one flowchart loads only
// the flowchart parser and layout.
const diagramLoads = new Map<DiagramType, Promise<PeleLoad>>();

function loadCore(): Promise<PeleLoad> {
  coreLoad ??= import("pele/lazy").then(
    (pele): PeleLoad => ({ status: "loaded", pele }),
    (): PeleLoad => ({ status: "failed" }),
  );
  return coreLoad;
}

function loadDiagramType(pele: Pele, type: DiagramType): Promise<PeleLoad> {
  let load = diagramLoads.get(type);
  if (!load) {
    load = pele.load(type).then(
      (): PeleLoad => ({ status: "loaded", pele }),
      (): PeleLoad => ({ status: "failed" }),
    );
    diagramLoads.set(type, load);
  }
  return load;
}

function detectDiagramType(pele: Pele, source: string): DiagramType | null {
  try {
    return pele.detectType(source);
  } catch {
    return null;
  }
}

let mathLoad: Promise<MathResolver | null> | null = null;

// Pele has no typesetter, so $$...$$ labels go through the KaTeX the chat
// already uses for math. It only loads for diagrams that contain math.
function loadMath(): Promise<MathResolver | null> {
  mathLoad ??= import("katex").then(
    ({ default: katex }) => {
      const typeset = new Map<string, ReturnType<MathResolver>>();
      let probe: HTMLDivElement | null = null;
      // Pele calls this on every layout, including resizes.
      return (tex, size) => {
        const key = `${size}:${tex}`;
        if (typeset.has(key)) return typeset.get(key);
        let markup: ReturnType<MathResolver> = null;
        try {
          if (!probe) {
            probe = document.createElement("div");
            probe.style.cssText =
              "position:absolute;left:-9999px;visibility:hidden;display:inline-block;white-space:nowrap";
            document.body.append(probe);
          }
          probe.style.fontSize = `${size}px`;
          probe.innerHTML = katex.renderToString(tex, {
            displayMode: true,
            output: "mathml",
            throwOnError: true,
            // No \href, \url, \htmlClass, or other commands that emit active HTML.
            trust: false,
            strict: "ignore",
            maxSize: 20,
            maxExpand: 1000,
          });
          const expression = probe.querySelector("math");
          // The annotation repeats the TeX source; the sanitizer would keep its text.
          expression?.querySelector("annotation")?.remove();
          if (expression) {
            const { width, height } = expression.getBoundingClientRect();
            markup = { html: expression.outerHTML, width, height };
          }
        } catch {
          // Unsupported TeX stays readable as its source.
        }
        typeset.set(key, markup);
        return markup;
      };
    },
    () => null,
  );
  return mathLoad;
}

// MathML element types KaTeX emits, without annotation (the resolver removes it),
// semantics (only a wrapper, so its content is kept), and mglyph (an image).
const KATEX_MATHML_TAGS = new Set([
  "math",
  "menclose",
  "mfrac",
  "mi",
  "mlabeledtr",
  "mn",
  "mo",
  "mover",
  "mpadded",
  "mphantom",
  "mroot",
  "mrow",
  "mspace",
  "msqrt",
  "mstyle",
  "msub",
  "msubsup",
  "msup",
  "mtable",
  "mtd",
  "mtext",
  "mtr",
  "munder",
  "munderover",
]);
// Presentation attributes KaTeX sets on those elements. The profiles already
// cover class, style, width, height, display, and xmlns.
const KATEX_MATHML_ATTRIBUTES = new Set([
  "accent",
  "accentunder",
  "columnalign",
  "columnlines",
  "columnspacing",
  "depth",
  "displaystyle",
  "fence",
  "largeop",
  "linebreak",
  "linethickness",
  "lspace",
  "mathbackground",
  "mathcolor",
  "mathsize",
  "mathvariant",
  "maxsize",
  "minsize",
  "notation",
  "rowlines",
  "rowspacing",
  "rspace",
  "scriptlevel",
  "separator",
  "stretchy",
  "voffset",
]);

let purifier: ReturnType<typeof DOMPurify> | null = null;

// Diagrams can come from untrusted PR descriptions. Pele escapes labels and
// links and images are off, so this is defense in depth against anything that
// could navigate, run script, or fetch remote content.
function sanitizeDiagramSvg(svg: string): Node {
  purifier ??= DOMPurify(window);
  return purifier.sanitize(svg, {
    FORBID_ATTR: ["href", "xlink:href", "src", "srcset"],
    FORBID_TAGS: ["a", "image", "foreignObject", "style"],
    USE_PROFILES: { svg: true, svgFilters: true },
    RETURN_DOM_FRAGMENT: true,
  });
}

// Pele puts MathML labels in a <foreignObject> with an HTML <div> around them.
function sanitizeMathDiagramSvg(svg: string): Node {
  purifier ??= DOMPurify(window);
  return purifier.sanitize(svg, {
    // DOMPurify still only accepts <math> under an HTML parent and checks every
    // MathML child's namespace.
    ADD_TAGS: ["foreignObject", ...KATEX_MATHML_TAGS],
    ADD_ATTR: (attribute, tagName) =>
      KATEX_MATHML_TAGS.has(tagName) && KATEX_MATHML_ATTRIBUTES.has(attribute),
    HTML_INTEGRATION_POINTS: { foreignobject: true },
    FORBID_ATTR: ["href", "xlink:href", "src", "srcset"],
    FORBID_TAGS: ["a", "img", "image", "script", "style"],
    USE_PROFILES: { svg: true, svgFilters: true, html: true },
    RETURN_DOM_FRAGMENT: true,
  });
}

// Pele colors diagrams through these, which a standalone image cannot inherit.
const PELE_COLOR_VARIABLES = [
  "--pele-bg",
  "--pele-fg",
  "--pele-muted",
  "--pele-line",
  "--pele-surface",
  "--pele-surface-alt",
  "--pele-border",
  "--pele-accent",
  "--pele-critical",
  ...Array.from({ length: 8 }, (_, index) => `--pele-series-${index + 1}`),
];

let expandedImageUrl: string | null = null;

/**
 * A blob URL, unlike a data URL, passes the desktop connect-src policy that media
 * save and copy actions fetch through.
 */
function diagramImageUrl(svg: SVGSVGElement): string {
  const element = svg.cloneNode(true) as SVGSVGElement;
  const computed = getComputedStyle(svg);
  for (const name of PELE_COLOR_VARIABLES) {
    const value = computed.getPropertyValue(name).trim();
    if (value) element.style.setProperty(name, value);
  }
  element.style.maxWidth = "none";
  element.style.backgroundColor = getComputedStyle(document.body).backgroundColor;
  if (expandedImageUrl) URL.revokeObjectURL(expandedImageUrl);
  expandedImageUrl = URL.createObjectURL(
    new Blob([new XMLSerializer().serializeToString(element)], { type: "image/svg+xml" }),
  );
  return expandedImageUrl;
}

/** Owns the pele mount so replacement, failure and unmount reset the outer expansion control.
 * @param source Mermaid text; empty text leaves the mount empty.
 * @param onExpand Receives an exported diagram image URL when expansion is requested.
 * @param presentation Optional timeline styling; omission uses the ordinary Markdown surface.
 * @param onRenderStateChange Optional readiness notification, reset on failure and cleanup.
 * @returns A sanitized diagram or localized recovery UI; load/render failures stay in the component. */
export function MermaidDiagram({
  source,
  onExpand,
  presentation,
  onRenderStateChange,
}: {
  source: string;
  onExpand: (imageUrl: string) => void;
  presentation?: "timeline" | undefined;
  /** Keeps the outer toolbar disabled until a sanitized diagram is mounted. */
  onRenderStateChange?: (rendered: boolean) => void;
}) {
  const [, setAttempt] = useState(0);
  const [renderError, setRenderError] = useState<string | null>(null);
  const trimmedSource = source.trim();
  const core = use(loadCore());
  const type = core.status === "loaded" ? detectDiagramType(core.pele, trimmedSource) : null;
  const load = core.status === "loaded" && type ? use(loadDiagramType(core.pele, type)) : core;
  const math = trimmedSource.includes("$$") ? use(loadMath()) : null;

  // Re-created, and so remounted, whenever the renderer, math support or source changes.
  const mountDiagram = (container: HTMLSpanElement) => {
    if (load.status !== "loaded") return;
    const mounted = load.pele.mount(container, trimmedSource, {
      links: false,
      images: false,
      zoom: false,
      // Keep the author's direction; a wide diagram scales down to fit instead of turning vertical.
      autoDirection: false,
      ...(math ? { math, sanitize: sanitizeMathDiagramSvg } : { sanitize: sanitizeDiagramSvg }),
      onRender: () => {
        setRenderError(null);
        onRenderStateChange?.(true);
      },
      onError: (error) => {
        onRenderStateChange?.(false);
        setRenderError(
          error instanceof Error ? error.message : t.chat.markdown.theDiagramCouldNotBeRendered,
        );
      },
    });
    return () => {
      mounted.destroy();
      onRenderStateChange?.(false);
    };
  };

  if (load.status === "failed") {
    return (
      <DiagramError
        message={t.chat.markdown.mermaidFailedToLoad}
        presentation={presentation}
        source={source}
        onRetry={() => {
          if (core.status === "failed") coreLoad = null;
          if (type) diagramLoads.delete(type);
          setAttempt((attempt) => attempt + 1);
        }}
      />
    );
  }

  return (
    <div
      className="chat-markdown-mermaid overflow-x-auto"
      data-markdown-mermaid=""
      data-markdown-copy={serializeCodeBlockToMarkdown(source, "mermaid")}
    >
      {renderError ? (
        <DiagramError message={renderError} source={source} presentation={presentation} />
      ) : null}
      <button
        type="button"
        aria-label={t.chat.markdown.expandDiagram}
        data-mermaid-expand=""
        hidden={renderError !== null}
        className="block w-full cursor-zoom-in rounded-md focus-visible:outline-2 focus-visible:outline-ring"
        onClick={(event) => {
          const svg = event.currentTarget.querySelector("svg");
          if (svg) onExpand(diagramImageUrl(svg));
        }}
      >
        <span ref={mountDiagram} className="flex w-full justify-center" />
      </button>
    </div>
  );
}

/** Preserves the source when rendering fails so an unreadable diagram does not hide its content.
 * @param message Renderer or loader failure detail.
 * @param source Original diagram text, excluded from duplicate thread-search matches.
 * @param onRetry Optional loader retry; omitted for failures without a retry action.
 * @param presentation Optional timeline error styling.
 * @returns Localized error and source fallback. */
function DiagramError({
  message,
  source,
  onRetry,
  presentation,
}: {
  message: string;
  source: string;
  onRetry?: () => void;
  presentation?: "timeline" | undefined;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <p
          className={
            presentation === "timeline"
              ? "m-0 text-secondary-copy text-error"
              : "m-0 text-xs text-destructive"
          }
        >
          {t.chat.markdown.renderError(message)}
        </p>
        {onRetry ? (
          <Button type="button" variant="ghost" size="xs" onClick={onRetry}>
            {t.chat.markdown.retry}
          </Button>
        ) : null}
      </div>
      <pre
        data-thread-find-ignore
        className="mt-2 mb-0 overflow-auto font-mono text-xs whitespace-pre-wrap"
      >
        {source}
      </pre>
    </div>
  );
}
