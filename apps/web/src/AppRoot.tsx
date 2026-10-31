/** Mounts renderer-wide providers and services independently of route lifetimes. */
import { RouterProvider } from "@tanstack/react-router";
import { DesktopWindowHost } from "./components/frame/DesktopWindowHost";
import { PhysicsMotionRoot } from "./components/PhysicsMotionRoot";

import { ElectronBrowserHost } from "./browser/ElectronBrowserHost";
import { WebPagesHost } from "./webPages/WebPagesHost";
import { QuitHoldOverlay } from "./components/QuitHoldOverlay";
import { AppAtomRegistryProvider } from "./rpc/atomRegistry";
import type { AppRouter } from "./router";

// Keep webviews outside the router but inside its atom registry so route changes preserve them.
/** Keeps desktop and embedded web-page hosts mounted across router transitions. */
export function AppRoot({ router }: { readonly router: AppRouter }) {
  return (
    <AppAtomRegistryProvider>
      <PhysicsMotionRoot />
      <DesktopWindowHost>
        <RouterProvider router={router} />
      </DesktopWindowHost>
      <ElectronBrowserHost />
      <WebPagesHost />
      <QuitHoldOverlay />
    </AppAtomRegistryProvider>
  );
}
