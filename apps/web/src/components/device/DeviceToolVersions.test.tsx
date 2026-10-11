/** Exercises localized device tool selection; versions stay unmodified host data. */
import { act, type ReactNode } from "react";
import { create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { installMessages } from "~/i18n";
import { en } from "~/i18n/locales/en";
import { messages } from "~/i18n/locales/zh-CN";

// Popup visibility is presentation; the real component owns the tool filter being tested.
vi.mock("~/components/ui/popover", () => ({
  Popover: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverPopup: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverTitle: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

import { DeviceToolVersions } from "./DeviceToolVersions";

let renderer: ReactTestRenderer | undefined;
afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
  installMessages("en", en);
  vi.unstubAllGlobals();
});

it("shows the selected hub versions after messages switch to Chinese", async () => {
  installMessages("zh-CN", messages);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  await act(async () => {
    renderer = create(
      <DeviceToolVersions
        kind="hub"
        tools={{
          hub: { runningVersion: "11.1", requiredVersion: "11.2", installedVersions: ["11.1"] },
          agent: { runningVersion: "22.1", requiredVersion: "22.2", installedVersions: ["22.1"] },
        }}
      />,
    );
  });
  expect(renderer?.root.findAllByType("dd").map((node) => node.children.join(""))).toEqual([
    "11.1",
    "11.2",
    "11.1",
  ]);
});
