/** K3's compact source/render selector; delegates file mode changes to the existing preview owner. */
import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { t } from "~/i18n";

/** K3's 24px file-view segments fit the 30px track without changing shared toggle sizes. */
const FILE_PREVIEW_MODE_ITEM_CLASS =
  "flex h-6 items-center rounded-compact-row px-2.25 text-secondary-copy text-secondary-label outline-none hover:text-foreground focus-visible:inset-shadow-focus data-pressed:bg-segmented-selected data-pressed:font-bold data-pressed:text-foreground data-pressed:shadow-raise-tab";

/** Controlled file view selector. Base UI owns arrow-key navigation; an empty selection is ignored. */
export function FilePreviewModeControl(props: {
  readonly rendered: boolean;
  readonly onRenderedChange: (rendered: boolean) => void;
}) {
  return (
    <ToggleGroup
      aria-label={t.tools.files.previewMode}
      value={[props.rendered ? "rendered" : "source"]}
      onValueChange={(values) => {
        if (values.length > 0) props.onRenderedChange(values[0] === "rendered");
      }}
      className="flex h-7.5 shrink-0 rounded-full bg-input p-0.75 shadow-files-track"
    >
      <Toggle value="source" className={FILE_PREVIEW_MODE_ITEM_CLASS}>
        {t.tools.files.sourceTab}
      </Toggle>
      <Toggle value="rendered" className={FILE_PREVIEW_MODE_ITEM_CLASS}>
        {t.tools.files.renderedTab}
      </Toggle>
    </ToggleGroup>
  );
}
