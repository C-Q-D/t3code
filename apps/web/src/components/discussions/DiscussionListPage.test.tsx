/**
 * Guards discussion link names with the real seat markup and Testing Library's accessibility-aware role queries.
 * Transport and routing are replaced; no browser process or CSS layout is required.
 * @vitest-environment jsdom
 */
import * as NodeModule from "node:module";
import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vite-plus/test";
import { en } from "~/i18n/locales/en";
import { DiscussionListPage } from "./DiscussionListPage";

// Vite+ already owns Testing Library through its preview provider. Resolve that dependency
// from its owner to use its DOM accessibility algorithm in jsdom without starting a browser.
const require = NodeModule.createRequire(import.meta.url);
const requireVite = NodeModule.createRequire(require.resolve("vite-plus"));
const requirePreview = NodeModule.createRequire(requireVite.resolve("@vitest/browser-preview"));
const {
  queryAllByRole,
}: {
  queryAllByRole: (
    container: HTMLElement,
    role: string,
    options?: { name: string | RegExp; exact: boolean },
  ) => HTMLElement[];
} = requirePreview("@testing-library/dom");

vi.mock("@effect/atom-react", () => ({ useAtomValue: () => snapshot }));
vi.mock("../../state/entities", () => ({
  useProjects: () => [{ environmentId: "env", id: "project", title: "Workspace" }],
}));
vi.mock("../../state/presentation", () => ({ environmentSummaries: {} }));
vi.mock("../../state/query", () => ({ formatEnvironmentQueryError: () => "" }));
vi.mock("../../state/server", () => ({ serverEnvironment: {} }));
vi.mock("~/i18n", () => ({ t: en }));
vi.mock("../../timestampFormat", () => ({ formatRelativeTimeLabel: () => "2 days ago" }));
vi.mock("../frame/titlebarSlot", () => ({ useTitlebarSlot: () => null }));
vi.mock("../ui/sidebar", () => ({
  SidebarInset: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, className }: { children: ReactNode; className?: string }) => (
    <a href="/discussion" className={className}>
      {children}
    </a>
  ),
}));

const snapshot = {
  errors: [],
  pending: false,
  items: ["paused", "ended"].map((status) => ({
    environmentId: "env",
    id: status,
    projectId: "project",
    title: status === "paused" ? "Active topic" : "Archived topic",
    status,
    seats: [
      { id: "a", personaName: "Architect", avatar: "architect" },
      { id: "b", personaName: "Reviewer", avatar: "reviewer" },
    ],
    cursor: { seatIndex: 0, round: 3 },
    pause: { reason: "stopped" },
    updatedAt: "2026-10-13T01:00:00.000Z",
  })),
};

it("names cards and archive rows with one participant summary and no separate seat images", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(<DiscussionListPage />));

    // jsdom has no Tailwind layout: allow only inter-element whitespace to differ.
    const cards = queryAllByRole(container, "link", {
      name: /^Architect、Reviewer\s*Active topic\s*Stopped\s*Workspace · Round 3\s*2 days ago$/,
      exact: true,
    });
    const rows = queryAllByRole(container, "link", {
      name: /^Architect、Reviewer\s*Archived topic\s*Workspace · 3 rounds total\s*Ended\s*2 days ago$/,
      exact: true,
    });
    expect.soft(cards).toHaveLength(1);
    expect.soft(rows).toHaveLength(1);
    expect.soft(queryAllByRole(container, "img")).toHaveLength(0);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});
