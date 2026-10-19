/** Edits the device-local background through the native bridge, without server settings writes. */
import { useState } from "react";
import { t } from "~/i18n";
import { useBackgroundImage } from "../../hooks/useBackgroundImage";
import { Button } from "../ui/button";
import { SettingsRow } from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";

/** Shows the shared selection, keeps native actions exclusive, and reports failed changes inline. */
export function BackgroundImageSetting() {
  const { url, isCustom, busy, canPick, canClear, pick, clear } = useBackgroundImage();
  const [failed, setFailed] = useState(false);
  const labels = t.settings.rows.backgroundImage;

  /** Runs one native action without retry; cancellation retains the current image. */
  async function changeBackground(action: () => Promise<void>) {
    setFailed(false);
    try {
      await action();
    } catch {
      setFailed(true);
    }
  }

  return (
    <SettingsRow
      {...searchableSetting("background-image")}
      description={<span role="status">{isCustom ? labels.custom : labels.default}</span>}
      control={
        <div className="flex max-w-full flex-wrap items-center justify-end gap-2">
          <img className="h-8.5 w-14 rounded-sm object-cover" src={url} alt="" />
          <Button
            variant="outline"
            size="sm"
            disabled={busy || !canPick}
            onClick={() => void changeBackground(pick)}
          >
            {labels.choose}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={busy || !isCustom || !canClear}
            onClick={() => void changeBackground(clear)}
          >
            {labels.restoreDefault}
          </Button>
        </div>
      }
    >
      {failed ? <p role="alert">{labels.error}</p> : null}
    </SettingsRow>
  );
}
