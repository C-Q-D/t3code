/** Localized media presentation and existing interaction behavior. */
import { t } from "~/i18n";
import type { MediaActionId } from "@t3tools/client-runtime/media-actions";
import {
  mediaReferenceFileName,
  type MediaReference,
} from "@t3tools/client-runtime/media-reference";
import { resolveAssetUrl } from "@t3tools/client-runtime/state/assets";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import {
  AuthFilesystemReadScope,
  type AssetResource,
  type AuthSessionState,
  type ContextMenuItem,
  type EnvironmentId,
  sessionGrantsScope,
  type SessionGrantInput,
} from "@t3tools/contracts";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/reactivity";
import { useCallback, useRef, useState, type ReactElement } from "react";

import { writeTextToClipboard } from "../../hooks/useCopyToClipboard";
import { readLocalApi } from "../../localApi";
import { appAtomRegistry } from "../../rpc/atomRegistry";
import { assetEnvironment } from "../../state/assets";
import { useEnvironmentQuery } from "../../state/query";
import { environmentSession, readPreparedConnection } from "../../state/session";
import { useAtomQueryRunner } from "../../state/use-atom-query-runner";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { downloadMedia, readMediaPng } from "./mediaContent";

export interface MediaActionSource {
  readonly kind: "image" | "video";
  readonly name: string;
  readonly src: string | null;
  readonly reference?: MediaReference;
  readonly asset?: { readonly environmentId: EnvironmentId; readonly resource: AssetResource };
  readonly onOpenFile?: () => void;
}

function mediaFileName(source: MediaActionSource): string {
  return (
    (source.reference && mediaReferenceFileName(source.reference)) || source.name || source.kind
  );
}

/** An explicit action may ask the server while its grant is still unresolved. */
function allowsHostMedia(session: SessionGrantInput | null) {
  return session === null || sessionGrantsScope(session, AuthFilesystemReadScope);
}

function canReadHostMedia(environmentId: EnvironmentId | null): boolean {
  if (environmentId === null) return true;
  const result = appAtomRegistry.get(environmentSession.sessionStateAtom(environmentId));
  return result._tag !== "Failure" && allowsHostMedia(Option.getOrNull(AsyncResult.value(result)));
}

/** Explicit byte operations get fresh capabilities without replacing a player's active source. */
/** Exported for tests that drive the byte operations without the menu. */
export function useMediaActions(source: MediaActionSource) {
  const hostEnvironmentId =
    source.asset &&
    (source.asset.resource._tag === "workspace-file" || source.asset.resource._tag === "media-file")
      ? source.asset.environmentId
      : null;
  const fileSession = useEnvironmentQuery(
    hostEnvironmentId === null ? null : environmentSession.sessionStateAtom(hostEnvironmentId),
  );
  const canReadMedia =
    hostEnvironmentId === null ||
    (fileSession.error === null && fileSession.data !== null && allowsHostMedia(fileSession.data));
  const assertCanReadMedia = useCallback(() => {
    if (!canReadHostMedia(hostEnvironmentId)) {
      throw new Error(t.tools.media.cannotRead);
    }
  }, [hostEnvironmentId]);
  const createAssetUrl = useAtomQueryRunner(assetEnvironment.createUrl, {
    reportFailure: false,
    refresh: true,
  });
  const actionUrl = useCallback(async () => {
    assertCanReadMedia();
    if (!source.asset) {
      if (!source.src) throw new Error(t.tools.media.unavailable);
      return source.src;
    }
    const { environmentId, resource } = source.asset;
    const connection = readPreparedConnection(environmentId);
    if (!connection) throw new Error(t.tools.media.reconnect);
    const result = await createAssetUrl({ environmentId, input: { resource } });
    if (result._tag === "Failure") throw squashAtomCommandFailure(result);
    assertCanReadMedia();
    const url = resolveAssetUrl(connection.httpBaseUrl, result.value.relativeUrl);
    if (!url) throw new Error(t.tools.media.invalidUrl);
    return url;
  }, [source, createAssetUrl, assertCanReadMedia]);
  const save = useCallback(async () => {
    await downloadMedia(await actionUrl(), mediaFileName(source));
  }, [actionUrl, source]);
  const copyImage = useCallback(async () => {
    assertCanReadMedia();
    if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
      throw new Error(t.tools.media.copyUnavailableHint);
    }
    // Start the clipboard write in the user gesture; fetching/decoding may finish later.
    await navigator.clipboard.write([
      new ClipboardItem({ "image/png": actionUrl().then(readMediaPng) }),
    ]);
  }, [actionUrl, assertCanReadMedia]);
  return { save, copyImage, canReadMedia, assertCanReadMedia };
}

/** Adds source-aware actions and a tooltip to the existing media element without a layout wrapper. */
export function MediaActions({
  source,
  children,
}: {
  source: MediaActionSource;
  children: ReactElement;
}) {
  const { save, copyImage, canReadMedia, assertCanReadMedia } = useMediaActions(source);
  const [tooltipOpen, setTooltipOpen] = useState(false);
  const menuOpen = useRef(false);
  const reference = source.reference;
  const tooltip = reference?.kind === "file" ? reference.path : (reference?.url ?? source.name);

  const showMenu = async (position: { x: number; y: number }) => {
    const api = readLocalApi();
    if (!api || menuOpen.current) return;
    menuOpen.current = true;
    setTooltipOpen(false);
    let failureTitle = t.tools.media.menuFailed;
    let progressToast: ReturnType<typeof toastManager.add> | undefined;
    try {
      const noun = source.kind === "image" ? t.tools.media.image : t.tools.media.video;
      const unavailable = !canReadMedia || (source.src === null && source.asset === undefined);
      const canCopyImage =
        typeof navigator !== "undefined" &&
        Boolean(navigator.clipboard?.write) &&
        typeof ClipboardItem !== "undefined";
      const items: ContextMenuItem<MediaActionId>[] = [];
      if (reference?.kind === "file") {
        items.push({ id: "copy-full-path", label: t.tools.media.copyFullPath });
        if (reference.relativePath)
          items.push({ id: "copy-relative-path", label: t.tools.media.copyRelativePath });
      } else if (reference?.kind === "url") {
        items.push({ id: "copy-url", label: t.tools.media.copyUrl });
      }
      if (source.onOpenFile)
        items.push({ id: "open-file", label: t.tools.media.openViewer, disabled: !canReadMedia });
      items.push({ id: "save", label: t.tools.media.saveMedia(noun), disabled: unavailable });
      if (source.kind === "image") {
        items.push({
          id: "copy-image",
          label: t.tools.media.copyImage,
          disabled: unavailable || !canCopyImage,
        });
      }

      const action = await api.contextMenu.show(items, position);
      if (!action) return;
      failureTitle = t.tools.media.actionFailure(items.find((item) => item.id === action)?.label);
      const text =
        action === "copy-full-path" && reference?.kind === "file"
          ? reference.path
          : action === "copy-relative-path" && reference?.kind === "file"
            ? reference.relativePath
            : action === "copy-url" && reference?.kind === "url"
              ? reference.url
              : undefined;
      if (text !== undefined) {
        await writeTextToClipboard(
          text,
          reference?.kind === "file" ? t.tools.media.filePath : "URL",
        );
        toastManager.add({
          type: "success",
          title: action === "copy-url" ? t.tools.media.urlCopied : t.tools.media.pathCopied,
        });
      } else if (action === "open-file") {
        assertCanReadMedia();
        source.onOpenFile?.();
      } else if (action === "save" || action === "copy-image") {
        progressToast = toastManager.add({
          type: "loading",
          title:
            action === "save" ? t.tools.media.preparingDownload(noun) : t.tools.media.copyingImage,
        });
        await (action === "save" ? save() : copyImage());
        toastManager.update(progressToast, {
          type: "success",
          title: action === "save" ? t.tools.media.downloadStarted : t.tools.media.imageCopied,
        });
      }
    } catch (error) {
      const toast = stackedThreadToast({
        type: "error",
        title: failureTitle,
        description: error instanceof Error ? error.message : t.tools.media.actionFailed,
      });
      if (progressToast) toastManager.update(progressToast, toast);
      else toastManager.add(toast);
    } finally {
      menuOpen.current = false;
    }
  };

  return (
    <Tooltip open={tooltipOpen} onOpenChange={setTooltipOpen}>
      <TooltipTrigger
        render={children}
        tabIndex={0}
        onContextMenu={(event) => {
          if (event.defaultPrevented) return;
          event.preventDefault();
          event.stopPropagation();
          const bounds = event.currentTarget.getBoundingClientRect();
          void showMenu(
            event.clientX === 0 && event.clientY === 0
              ? { x: bounds.left, y: bounds.bottom }
              : { x: event.clientX, y: event.clientY },
          );
        }}
        onKeyDown={(event) => {
          if (
            event.defaultPrevented ||
            !(event.key === "ContextMenu" || (event.shiftKey && event.key === "F10"))
          )
            return;
          event.preventDefault();
          event.stopPropagation();
          const bounds = event.currentTarget.getBoundingClientRect();
          void showMenu({ x: bounds.left, y: bounds.bottom });
        }}
      />
      <TooltipPopup variant="code">{tooltip}</TooltipPopup>
    </Tooltip>
  );
}
