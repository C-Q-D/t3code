import { createMemoryHistory } from "@tanstack/react-router";
import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { ThreadId } from "@t3tools/contracts";
import { DEFAULT_CLIENT_SETTINGS } from "@t3tools/contracts/settings";
import type * as Context from "effect/Context";
import { expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";

import { AppRoot } from "~/AppRoot";
import "~/index.css";
import { t } from "~/i18n";
import { DraftId, useComposerDraftStore } from "~/composerDraftStore";
import { __setClientSettingsForTests } from "~/hooks/useSettings";
import { getRouter } from "~/router";
import {
  ENVIRONMENT_ID,
  PROJECT_ID,
  installFakeEnvironment,
  threadWithHistory,
  type FakeDriver,
} from "../../test/fakeEnvironment";
import { render } from "../../test/render";

// The socket is the only fake layer; see test/appScenarios.renders.tsx.
vi.mock("../../../../packages/client-runtime/src/connection/driver.ts", async (importOriginal) => {
  const [actual, { fakeDriver }, Layer] = await Promise.all([
    importOriginal<{ readonly ConnectionDriver: Context.Key<unknown, FakeDriver> }>(),
    import("../../test/fakeEnvironment"),
    import("effect/Layer"),
  ]);
  return { ...actual, layer: Layer.succeed(actual.ConnectionDriver, fakeDriver) };
});

vi.mock(import("~/rpc/requestLatencyState"), async (original) => ({
  ...(await original()),
  trackRpcRequestSent: () => {},
}));

it("a new draft does not load its reserved thread before the server lists it", async () => {
  await page.viewport(1400, 900);
  using _environment = installFakeEnvironment([], { fileAttachments: { maxUploadBytes: 1048576 } });
  using fetchSpy = vi.spyOn(globalThis, "fetch");
  __setClientSettingsForTests({
    ...DEFAULT_CLIENT_SETTINGS,
    onboardingCompletedAt: "2026-01-01T00:00:00.000Z",
  });
  const draftId = DraftId.make("draft-27443");
  const threadId = ThreadId.make("thread-27443");
  useComposerDraftStore
    .getState()
    .setProjectDraftThreadId(scopeProjectRef(ENVIRONMENT_ID, PROJECT_ID), draftId, { threadId });

  const router = getRouter(createMemoryHistory({ initialEntries: [`/draft/${draftId}`] }));
  await router.load();
  const container = document.createElement("div");
  container.style.cssText = "width: 1400px; height: 900px;";
  await using _app = await render(<AppRoot router={router} />, {
    container,
    // AppRoot brings its own router.
    router: false,
  });
  await expect.element(page.getByTestId("composer-editor")).toBeVisible();
  // The shell snapshot has arrived once the sidebar lists the project, so the connection is up.
  await expect.element(page.getByText("render", { exact: true }).first()).toBeVisible();

  const threadRequests = fetchSpy.mock.calls
    .map(([input]) => String(input instanceof Request ? input.url : input))
    .filter((url) => url.includes(`/api/orchestration/threads/${threadId}/`));
  // A 404 here marks the thread deleted, and the view never loads it once the send creates it.
  expect(threadRequests).toEqual([]);
  expect(
    _app.container.querySelectorAll(
      `[data-chat-composer-footer] button[aria-label="${t.composer.attachments.attach}"]`,
    ),
  ).toHaveLength(1);
});

it("keeps hosted resting controls labeled when their strip has room after a narrow expanded footer", async () => {
  await page.viewport(1400, 900);
  const thread = threadWithHistory("resting-controls", 20);
  using _environment = installFakeEnvironment([thread]);
  __setClientSettingsForTests({
    ...DEFAULT_CLIENT_SETTINGS,
    composerCollapseOnScroll: true,
    persistComposerContextStrip: true,
    onboardingCompletedAt: "2026-01-01T00:00:00.000Z",
  });
  const router = getRouter(
    createMemoryHistory({ initialEntries: [`/${ENVIRONMENT_ID}/${thread.id}`] }),
  );
  await router.load();
  const container = document.createElement("div");
  container.style.cssText = "width: 1200px; height: 700px;";
  await using screen = await render(<AppRoot router={router} />, {
    container,
    // AppRoot brings its own router.
    router: false,
  });
  await expect.element(screen.getByTestId("composer-editor")).toBeVisible();
  const form = container.querySelector<HTMLElement>("[data-chat-composer-form]")!;
  form.style.width = "312px";
  await vi.waitFor(() => {
    expect(form.querySelector('[data-composer-block-icon-only="true"]')).not.toBeNull();
  });
  const viewport = container.querySelector<HTMLElement>("[data-assistant-citation-viewport]")!;
  const scrollNode = Array.from(viewport.querySelectorAll<HTMLElement>("div")).find(
    (element) =>
      element.scrollHeight > element.clientHeight &&
      ["auto", "scroll"].includes(getComputedStyle(element).overflowY),
  )!;
  expect(scrollNode).toBeDefined();
  scrollNode.dispatchEvent(new WheelEvent("wheel", { deltaY: -200, bubbles: true }));
  const host = container.querySelector<HTMLElement>(
    '[data-chat-resting-composer-controls-host="true"]',
  )!;
  await vi.waitFor(() => {
    expect(host.querySelector("[data-chat-composer-resting-controls]")).not.toBeNull();
  });
  await vi.waitFor(() => {
    expect(host.querySelectorAll('[data-composer-block-icon-only="true"]')).toHaveLength(0);
    expect(host.querySelectorAll('[data-resting-block][aria-hidden="true"]')).toHaveLength(0);
    const modelLabel = host.querySelector<HTMLElement>("[data-chat-provider-model-picker-label]")!;
    expect(modelLabel.textContent).toContain("GPT-5.4");
    expect(modelLabel.clientWidth).toBeGreaterThan(0);
  });
});
