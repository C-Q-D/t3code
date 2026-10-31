/** Model options retain provider metadata, availability explanations, favorites, and jump shortcuts. */
import { t } from "~/i18n";
import { type ProviderDriverKind, type ProviderInstanceId } from "@t3tools/contracts";
import { memo } from "react";
import { ModelSelectionCheck } from "./ModelSelectionCheck";
import { getDisplayModelName, getProviderRowLabel } from "./providerIconUtils";
import { ComboboxItem } from "../ui/combobox";
import { ModelFavoriteButton } from "./ModelFavoriteButton";
import { Badge } from "../ui/badge";
import { Kbd } from "../ui/kbd";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { cn } from "~/lib/utils";
import { modelPickerModelKey } from "./modelPickerKeys";
import { ProviderInstanceIcon } from "./ProviderInstanceIcon";

/** Renders one virtualized model option; selection and persistence stay with the picker. */
export const ModelListRow = memo(function ModelListRow(props: {
  index: number;
  slug: string;
  name: string;
  subProvider?: string | undefined;
  instanceId: ProviderInstanceId;
  driverKind: ProviderDriverKind;
  providerDisplayName: string;
  providerAccentColor?: string | undefined;
  acpRegistryAgentId?: string | undefined;
  acpRegistryIconUrl?: string | undefined;
  isFavorite: boolean;
  isSelected: boolean;
  selectionRequest?: object | undefined;
  showProvider: boolean;
  showInstanceBadge: boolean;
  showNewBadge?: boolean;
  unavailable?: boolean;
  jumpLabel?: string | null;
  disabledReason?: string | null;
  onToggleFavorite: (instanceId: ProviderInstanceId, slug: string) => void;
}) {
  const model = {
    slug: props.slug,
    name: props.name,
    subProvider: props.subProvider,
  };
  const providerLabel = getProviderRowLabel(props.providerDisplayName, props.subProvider);

  const row = (
    <ComboboxItem
      hideIndicator
      index={props.index}
      value={modelPickerModelKey(props.instanceId, props.slug)}
      data-model-picker-key={modelPickerModelKey(props.instanceId, props.slug)}
      disabled={Boolean(props.disabledReason)}
      className={cn(
        "group relative w-full min-w-0 max-w-full cursor-pointer",
        props.disabledReason &&
          "data-disabled:pointer-events-auto data-disabled:cursor-not-allowed",
      )}
    >
      <ModelSelectionCheck
        key={modelPickerModelKey(props.instanceId, props.slug)}
        checked={props.isSelected}
        request={props.selectionRequest}
      />
      <div className={cn("min-w-0 flex-1 text-left", props.unavailable && "text-placeholder")}>
        <div className="flex min-w-0 items-center gap-2">
          <div className={cn("min-w-0 truncate", props.isSelected && "font-semibold")}>
            {getDisplayModelName(model)}
          </div>
          {props.showNewBadge ? (
            <Badge variant="action" size="sm" aria-label={t.composer.modelPicker.newAriaLabel}>
              {t.composer.modelPicker.newBadge}
            </Badge>
          ) : null}
          {props.disabledReason && !props.unavailable ? (
            <Badge variant="restricted" size="sm">
              {t.composer.modelPicker.limited}
            </Badge>
          ) : null}
          {props.unavailable ? (
            <Badge variant="outline" size="sm">
              {t.composer.modelPicker.unavailable}
            </Badge>
          ) : null}
        </div>
        {props.showProvider && (
          <div className="mt-1 flex items-center gap-1.5">
            <ProviderInstanceIcon
              driverKind={props.driverKind}
              displayName={props.providerDisplayName}
              accentColor={props.providerAccentColor}
              showBadge={props.showInstanceBadge}
              acpRegistryAgentId={props.acpRegistryAgentId}
              acpRegistryIconUrl={props.acpRegistryIconUrl}
              className="size-3"
              iconClassName="size-3"
            />
            <span className="truncate text-secondary-copy font-normal text-secondary-label">
              {providerLabel}
            </span>
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {props.jumpLabel ? <Kbd>{props.jumpLabel}</Kbd> : null}
        <ModelFavoriteButton
          key={modelPickerModelKey(props.instanceId, props.slug)}
          isFavorite={props.isFavorite}
          disabled={Boolean(props.disabledReason)}
          onToggle={() => props.onToggleFavorite(props.instanceId, props.slug)}
        />
      </div>
    </ComboboxItem>
  );

  if (!props.disabledReason) {
    return row;
  }

  return (
    <Tooltip>
      <TooltipTrigger render={row} />
      <TooltipPopup side="left" align="center">
        {props.disabledReason}
      </TooltipPopup>
    </Tooltip>
  );
});
