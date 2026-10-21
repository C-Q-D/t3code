/** Browser address chrome; navigation and URL drafts stay independent of the mounted page surface. */
import { t } from "~/i18n";
import { RefreshIcon } from "~/components/ui/refresh-icon";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  ExternalLink,
  Globe,
  Square,
  SquareDashedMousePointer,
  PictureInPicture2,
} from "lucide-react";
import {
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";

import { Button } from "~/components/ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";

/** Navigation state and existing browser actions; optional actions retain their availability rules. */
interface Props {
  url: string;
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  refreshDisabled: boolean;
  inputDisabled?: boolean | undefined;
  focusUrlNonce?: number | undefined;
  onBack: () => void;
  onForward: () => void;
  onRefresh: () => void;
  onSubmit: (url: string) => void;
  onOpenInBrowser?: (() => void) | undefined;
  onCapture?: ((record: boolean) => void) | undefined;
  captureDisabled?: boolean | undefined;
  recording?: boolean | undefined;
  onPictureInPicture?: (() => void) | undefined;
  pictureInPicture?: boolean | undefined;
  pictureInPictureDisabled?: boolean | undefined;
  onPickElement?: (() => void) | undefined;
  pickActive?: boolean | undefined;
  pickDisabled?: boolean | undefined;
  pickDisabledReason?: string | undefined;
  trailingActions?: ReactNode;
  leadingActions?: ReactNode;
}

const NOOP = () => {};

/**
 * Renders browser navigation, URL entry, annotations, capture, and floating-window actions.
 * @param props View data, control flags, and callbacks defined by the component props type; optional fields retain their declared defaults.
 * @returns Rendered UI for the supplied props.
 */
export function PreviewChromeRow({
  url,
  loading,
  canGoBack,
  canGoForward,
  refreshDisabled,
  inputDisabled,
  focusUrlNonce,
  onBack,
  onForward,
  onRefresh,
  onSubmit,
  onOpenInBrowser,
  onCapture,
  captureDisabled,
  recording,
  onPictureInPicture,
  pictureInPicture,
  pictureInPictureDisabled,
  onPickElement,
  pickActive,
  pickDisabled,
  pickDisabledReason,
  trailingActions,
  leadingActions,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [draft, setDraft] = useState(url);
  const [inputFocused, setInputFocused] = useState(false);

  useEffect(() => {
    if (focusUrlNonce == null) return;
    const node = inputRef.current;
    if (!node) return;
    node.focus();
  }, [focusUrlNonce]);

  const submit = (event?: FormEvent | KeyboardEvent) => {
    event?.preventDefault();
    const next = draft.trim();
    if (next.length === 0) return;
    onSubmit(next);
    inputRef.current?.blur();
  };

  return (
    <div className="relative shrink-0">
      <form
        onSubmit={submit}
        className="flex h-9.5 min-h-9.5 min-w-0 items-center gap-0.5"
        aria-busy={loading}
        data-surface-subheader
      >
        <div
          className="flex items-center gap-0.5"
          role="group"
          aria-label={t.tools.preview.navigation}
        >
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-md"
                  onClick={canGoBack ? onBack : NOOP}
                  disabled={!canGoBack}
                  aria-label={t.tools.preview.back}
                  type="button"
                />
              }
            >
              <ArrowLeft className="size-3.75" />
            </TooltipTrigger>
            <TooltipPopup>{t.tools.preview.back}</TooltipPopup>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-md"
                  onClick={canGoForward ? onForward : NOOP}
                  disabled={!canGoForward}
                  aria-label={t.tools.preview.forward}
                  type="button"
                />
              }
            >
              <ArrowRight className="size-3.75" />
            </TooltipTrigger>
            <TooltipPopup>{t.tools.preview.forward}</TooltipPopup>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-md"
                  onClick={refreshDisabled ? NOOP : onRefresh}
                  disabled={refreshDisabled}
                  aria-label={loading ? t.tools.preview.stop : t.tools.preview.refresh}
                  type="button"
                />
              }
            >
              {loading ? <Square className="size-3.5" /> : <RefreshIcon size="sm" />}
            </TooltipTrigger>
            <TooltipPopup>
              {loading ? t.tools.preview.loading : t.tools.preview.refresh}
            </TooltipPopup>
          </Tooltip>
        </div>

        {leadingActions}

        {/* This browser-specific well keeps the address and its adornments in one 34px pill. */}
        <div
          role="group"
          className="group/address mx-1 flex h-8.5 min-w-0 flex-1 items-center gap-2 rounded-full bg-input px-3 shadow-browser-address focus-within:inset-shadow-focus"
        >
          <Globe className="size-3.25 shrink-0" strokeWidth={1.75} />
          <Tooltip>
            <TooltipTrigger
              render={
                <input
                  ref={inputRef}
                  value={inputFocused ? draft : url}
                  onChange={(event) => setDraft(event.target.value)}
                  onFocus={() => {
                    setDraft(url);
                    setInputFocused(true);
                    queueMicrotask(() => inputRef.current?.select());
                  }}
                  onBlur={() => {
                    setInputFocused(false);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") submit(event);
                    if (event.key === "Escape") {
                      event.preventDefault();
                      setDraft(url);
                      inputRef.current?.blur();
                    }
                  }}
                  placeholder={t.tools.preview.urlPlaceholder}
                  aria-label={t.tools.preview.urlPlaceholder}
                  spellCheck={false}
                  disabled={inputDisabled}
                  data-preview-url-input
                  className="h-full min-w-0 flex-1 bg-transparent font-mono text-secondary-copy text-fg-detail outline-none caret-message-action placeholder:text-placeholder disabled:text-fg-control-disabled"
                />
              }
            />
          </Tooltip>
          {onOpenInBrowser && !inputFocused ? (
            <div className="flex shrink-0 items-center">
              {/* Revealed on hover so a resting address bar reads as plain text. */}
              <span className="pointer-events-none flex opacity-0 transition-opacity focus-within:pointer-events-auto focus-within:opacity-100 group-hover/address:pointer-events-auto group-hover/address:opacity-100">
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon-micro"
                        onClick={onOpenInBrowser}
                        aria-label={t.tools.preview.openSystemBrowser}
                        type="button"
                      />
                    }
                  >
                    <ExternalLink className="size-3.25" />
                  </TooltipTrigger>
                  <TooltipPopup>{t.tools.preview.openSystemBrowser}</TooltipPopup>
                </Tooltip>
              </span>
            </div>
          ) : null}
        </div>

        {onPickElement ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant={pickActive ? "secondary" : "ghost"}
                  size="icon-md"
                  onClick={onPickElement}
                  disabled={pickDisabled}
                  aria-label={
                    pickActive ? t.tools.preview.cancelAnnotation : t.tools.preview.annotate
                  }
                  aria-pressed={pickActive ? "true" : "false"}
                  type="button"
                />
              }
            >
              <SquareDashedMousePointer className="size-3.75" strokeWidth={1.75} />
            </TooltipTrigger>
            <TooltipPopup>
              {pickDisabled && pickDisabledReason
                ? pickDisabledReason
                : pickActive
                  ? t.tools.preview.cancelAnnotationEsc
                  : t.tools.preview.annotateHint}
            </TooltipPopup>
          </Tooltip>
        ) : null}
        {onCapture ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant={recording ? "secondary" : "ghost"}
                  size="icon-md"
                  onClick={(event) => onCapture(event.shiftKey)}
                  aria-label={
                    recording ? t.tools.preview.stopRecording : t.tools.preview.captureScreenshot
                  }
                  type="button"
                  className="relative"
                  disabled={captureDisabled}
                />
              }
            >
              <Camera className="size-3.75" strokeWidth={1.75} />
              {recording ? (
                <span className="absolute right-0.5 top-0.5 size-1.5 rounded-full bg-attention" />
              ) : null}
            </TooltipTrigger>
            <TooltipPopup>
              {recording ? t.tools.preview.stopRecording : t.tools.preview.screenshotHint}
            </TooltipPopup>
          </Tooltip>
        ) : null}
        {onPictureInPicture ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant={pictureInPicture ? "secondary" : "ghost"}
                  size="icon-md"
                  onClick={onPictureInPicture}
                  aria-label={
                    pictureInPicture ? t.tools.preview.closeFloating : t.tools.preview.floatOverChat
                  }
                  aria-pressed={pictureInPicture ? "true" : "false"}
                  type="button"
                  disabled={pictureInPictureDisabled}
                />
              }
            >
              <PictureInPicture2 className="size-3.75" strokeWidth={1.75} />
            </TooltipTrigger>
            <TooltipPopup>
              {pictureInPicture ? t.tools.preview.closeFloating : t.tools.preview.floatOverChat}
            </TooltipPopup>
          </Tooltip>
        ) : null}
        {trailingActions}
      </form>
    </div>
  );
}
