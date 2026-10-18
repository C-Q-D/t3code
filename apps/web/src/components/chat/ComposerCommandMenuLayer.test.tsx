/** Exercises the drawer layer with the production CSS inset and real React effects. */
// @vitest-environment jsdom
import * as NodeURL from "node:url";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import { it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, vi } from "vite-plus/test";

import { ComposerCommandMenuLayer } from "./ComposerCommandMenuLayer";

let root: Root | undefined;

afterEach(async () => {
  await act(() => root?.unmount());
  root = undefined;
  document.head.replaceChildren();
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.effect(
  "keeps both menu drawers inset from the main surface as the composer moves and resizes",
  () =>
    Effect.gen(function* () {
      vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
      const fs = yield* FileSystem.FileSystem;
      const composerCss = yield* fs.readFileString(
        NodeURL.fileURLToPath(new NodeURL.URL("../../styles/composer.css", import.meta.url)),
      );
      yield* Effect.promise(async () => {
        const shell = composerCss.match(/@utility composer-shell\s*\{([^}]+)\}/)?.[1];
        expect(shell).toBeDefined();
        const style = document.createElement("style");
        style.textContent = `html { font-size: 16px; --spacing: 0.25rem; } .composer-shell { ${shell} }`;
        document.head.append(style);
        const form = document.createElement("form");
        form.className = "composer-shell";
        form.dataset.chatComposerForm = "true";
        const surface = document.createElement("div");
        surface.dataset.chatComposerMainSurface = "true";
        const anchor = document.createElement("textarea");
        surface.append(anchor);
        form.append(surface);
        document.body.append(form);
        // JSDOM has no layout engine; only geometry is supplied, not the inset or menu result.
        const bounds = vi.spyOn(surface, "getBoundingClientRect");
        bounds.mockReturnValue(new DOMRect(100, 500, 760, 120));
        const host = document.createElement("div");
        document.body.append(host);
        root = createRoot(host);
        await act(() => {
          root?.render(<ComposerCommandMenuLayer anchor={anchor}>/model</ComposerCommandMenuLayer>);
        });
        const drawer = document.querySelector<HTMLElement>("[data-composer-drawer-layer]");
        expect(drawer?.style.left).toBe("122px");
        expect(drawer?.style.width).toBe("716px");

        bounds.mockReturnValue(new DOMRect(250, 500, 320, 120));
        await act(() => {
          root?.render(
            <ComposerCommandMenuLayer anchor={anchor}>Stashed draft</ComposerCommandMenuLayer>,
          );
          window.dispatchEvent(new Event("resize"));
        });
        expect(drawer?.style.left).toBe("272px");
        expect(drawer?.style.width).toBe("276px");
      });
    }).pipe(Effect.provide(NodeFileSystem.layer)),
);
