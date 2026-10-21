/** Shares measured canvas layout and its pure preview resolver without publishing gesture frames. */
import { createContext, useContext } from "react";
import type { ChatCanvasPreview, resolveChatCanvasLayout } from "./chatCanvasLayout";
import type { PreviewMiniPlayerObstacles } from "../preview/previewMiniPlayerLayout";

export const ChatCanvasContext = createContext<{
  container: { width: number; height: number };
  lane: { padding: number; minChatWidth: number };
  layout: ReturnType<typeof resolveChatCanvasLayout>;
  previewKey: string | null;
  /** Resolves a local gesture using the same measured constraints as committed layout. */
  resolvePreviewFrame: (
    preview: ChatCanvasPreview,
  ) => ReturnType<typeof resolveChatCanvasLayout>["frame"];
  reportPreview: (preview: ChatCanvasPreview) => void;
  clearPreview: (key: string) => void;
  registerTimeline: (element: HTMLElement | null) => void;
  reportDetailsCard: (card: PreviewMiniPlayerObstacles["detailsCard"]) => void;
  detailsCardTopInset: number;
} | null>(null);

export const useChatCanvas = () => useContext(ChatCanvasContext);
