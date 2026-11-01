import { t } from "~/i18n";
/**
 * Verifies visible opt-out feedback against the real browser preference store.
 * @vitest-environment jsdom
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";

const auth = vi.hoisted(() => ({
  isLoaded: true,
  isSignedIn: false,
  userId: null as string | null,
}));
vi.mock("@clerk/react", () => ({ useAuth: () => auth }));
vi.mock("~/cloud/publicConfig", () => ({ hasCloudPublicConfig: () => true }));
vi.mock("~/state/environments", () => ({
  useEnvironments: () => ({ isReady: true, environments: [] }),
  usePrimaryEnvironmentId: () => null,
  usePrimaryEnvironment: () => null,
}));
vi.mock("~/state/session", () => ({
  environmentSession: {},
  useEnvironmentScope: () => false,
  readEnvironmentScope: () => false,
}));
vi.mock("~/cloud/useCloudLinkController", () => ({
  useCloudLinkController: () => ({ linkState: { target: null, data: null, error: null } }),
}));
vi.mock("./CloudEnvironmentConnectList", () => ({ CloudEnvironmentConnectRows: () => null }));

import { ConnectOnboardingDialog } from "./ConnectOnboardingDialog";
import { CONNECT_ONBOARDING_OPT_OUT_STORAGE_KEY } from "~/cloud/connectOnboarding";

let root: Root;
let container: HTMLDivElement;

/** Finds an actual rendered action, including buttons portaled outside the React root. */
function button(label: string) {
  const found = Array.from(document.querySelectorAll("button")).find(
    (element) => element.textContent === label,
  );
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  auth.isSignedIn = false;
  auth.userId = null;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  localStorage.clear();
  vi.unstubAllGlobals();
});

/** Opens after sign-in and checks both toggle transitions before either completion choice. */
async function toggleOnThenOff() {
  await act(async () => root.render(<ConnectOnboardingDialog />));
  await act(async () => {
    auth.isSignedIn = true;
    auth.userId = "onboarding-test-account";
    root.render(<ConnectOnboardingDialog />);
  });
  const toggle = button(t.account.onboarding.dontShowAgain);
  expect(toggle.getAttribute("aria-pressed")).toBe("false");
  expect(toggle.querySelector("svg")).toBeNull();
  await act(async () => toggle.click());
  expect(toggle.getAttribute("aria-pressed")).toBe("true");
  // The glyph must stay rendered after the click; aria-pressed alone is not visible feedback.
  expect(toggle.querySelector("svg")).not.toBeNull();
  await act(async () => toggle.click());
  expect(toggle.getAttribute("aria-pressed")).toBe("false");
  expect(toggle.querySelector("svg")).toBeNull();
  return toggle;
}

it("does not opt out after the visible check is toggled on and off", async () => {
  await toggleOnThenOff();
  await act(async () => button(t.account.onboarding.done).click());
  expect(localStorage.getItem(CONNECT_ONBOARDING_OPT_OUT_STORAGE_KEY)).toBeNull();
});

it("persists opt-out when completion follows the visible checked state", async () => {
  const toggle = await toggleOnThenOff();
  await act(async () => toggle.click());
  expect(toggle.getAttribute("aria-pressed")).toBe("true");
  expect(toggle.querySelector("svg")).not.toBeNull();
  await act(async () => button(t.account.onboarding.done).click());
  expect(JSON.parse(localStorage.getItem(CONNECT_ONBOARDING_OPT_OUT_STORAGE_KEY)!)).toEqual({
    optOutAccounts: ["onboarding-test-account"],
  });
});
