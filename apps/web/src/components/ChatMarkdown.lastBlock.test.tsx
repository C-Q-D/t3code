/**
 * Verifies streaming cursor metadata at commit time, across updates and independent instances.
 * @vitest-environment jsdom
 */
import { EnvironmentId, type AuthEnvironmentScope } from "@t3tools/contracts";
import { act, StrictMode, useLayoutEffect, type ComponentProps, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";
import type * as Settings from "../hooks/useSettings";
import type * as Session from "../state/session";
import ChatMarkdown from "./ChatMarkdown";
vi.mock("../hooks/useFileMetadata", () => ({ useFileMetadata: () => null }));
vi.mock("@effect/atom-react", () => ({
  useAtomValue: () => ({
    pullRequestsEnabled: false,
    availableEditors: [],
    revealInFileManagerLabel: "Reveal",
  }),
}));
vi.mock("../hooks/useTheme", () => ({
  useTheme: () => ({ resolvedTheme: "dark" }),
  useRenderedAppearance: () => "dark",
}));
vi.mock("../hooks/useSettings", async (importOriginal) => {
  const actual = await importOriginal<typeof Settings>();
  const settings = actual.getClientSettings();
  return {
    ...actual,
    useClientSettings: (select?: (value: typeof settings) => unknown) =>
      select ? select(settings) : settings,
  };
});
vi.mock("./ui/tooltip", async () => {
  const { cloneElement, isValidElement } = await import("react");
  return {
    Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
    TooltipTrigger({
      render,
      children,
    }: ComponentProps<typeof import("./ui/tooltip").TooltipTrigger>) {
      if (!isValidElement(render)) return <>{children}</>;
      return children === undefined ? render : cloneElement(render, undefined, children);
    },
    TooltipPopup: () => null,
  };
});
vi.mock("../state/use-atom-query-runner", () => ({ useAtomQueryRunner: () => vi.fn() }));
vi.mock("../state/use-atom-command", () => ({ useAtomCommand: () => vi.fn() }));
vi.mock("../state/session", async (importOriginal) => {
  const actual = await importOriginal<typeof Session>();
  const { AuthStandardClientScopes } = await import("@t3tools/contracts");
  const grantedScopes = new Set<AuthEnvironmentScope>(AuthStandardClientScopes);
  const hasScope = (environmentId: EnvironmentId | null, scope: AuthEnvironmentScope) =>
    environmentId !== null && grantedScopes.has(scope);
  return {
    ...actual,
    useEnvironmentScope: hasScope,
    readEnvironmentScope: hasScope,
    usePreparedConnection: () => ({ _tag: "Loading" }),
  };
});
vi.mock("../state/entities", () => ({
  readThreadShell: () => null,
  useProjects: () => [],
  useServerConfigs: () => new Map(),
}));
vi.mock("../remoteOpen", () => ({
  useRemoteOpenResolution: () => ({ state: { mode: "local-exec" }, isResolved: true }),
}));
vi.mock("../editorPreferences", () => ({
  useOpenInPreferredEditor: () => vi.fn(),
  usePreferredEditor: () => [null, vi.fn()],
}));
vi.mock("~/lib/openPullRequestLink", () => ({
  findProjectOnChangeRequestHost: () => undefined,
  parseChangeRequestUrl: () => null,
  resolvePullRequestPreviewTarget: () => null,
  useOpenChangeRequestLink: () => vi.fn(),
}));

/** Records DOM state after child layout effects but before passive effects. */
function LastBlockCommitProbe({
  children,
  onCommit,
}: {
  children: ReactNode;
  onCommit: () => void;
}) {
  useLayoutEffect(onCommit);
  return children;
}

it.each([true, false])(
  "commits independent cursor endings before ancestor layout effects (raw HTML %s)",
  async (parseRawHtml) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const commits: (string | null)[][] = [];
    const paragraph = "A paragraph at the end.\n\n";
    const code = "```\nconst value = 1;\n```\n";
    const capture = () => {
      commits.push(
        [...container.querySelectorAll(".chat-markdown")].map((root) =>
          root.getAttribute("data-last-block"),
        ),
      );
    };
    const content = (primary: string, secondary: string) => (
      <StrictMode>
        <LastBlockCommitProbe onCommit={capture}>
          <ChatMarkdown cwd="/tmp/project" isStreaming parseRawHtml={parseRawHtml} text={primary} />
          <ChatMarkdown
            cwd="/tmp/project"
            isStreaming
            parseRawHtml={parseRawHtml}
            text={secondary}
          />
        </LastBlockCommitProbe>
      </StrictMode>
    );
    try {
      await act(async () => root.render(content(paragraph, code)));
      expect(
        commits.at(-1),
        "initial commit must classify each root before ancestor layout",
      ).toEqual(["p", "pre"]);
      await act(async () => root.render(content(code, paragraph)));
      expect(
        commits.at(-1),
        "streaming updates must replace both endings without sharing refs",
      ).toEqual(["pre", "p"]);
      await act(async () => root.render(content("", paragraph)));
      expect(commits.at(-1), "empty content must clear the previous block marker").toEqual([
        null,
        "p",
      ]);
    } finally {
      await act(async () => root.unmount());
      container.remove();
      vi.unstubAllGlobals();
    }
  },
);
