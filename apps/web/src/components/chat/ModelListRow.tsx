/** Model options retain provider metadata, availability explanations, favorites, and jump shortcuts. */
import { t } from "~/i18n";
import { type ProviderDriverKind, type ProviderInstanceId } from "@t3tools/contracts";
import { memo } from "react";
import { CheckIcon, StarIcon } from "lucide-react";
import {
  getDisplayModelName,
  getProviderRowLabel,
  getTriggerDisplayModelLabel,
} from "./providerIconUtils";
import { ComboboxItem } from "../ui/combobox";
import { Button } from "../ui/button";
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
  shortName?: string | undefined;
  subProvider?: string | undefined;
  instanceId: ProviderInstanceId;
  driverKind: ProviderDriverKind;
  providerDisplayName: string;
  providerAccentColor?: string | undefined;
  acpRegistryAgentId?: string | undefined;
  acpRegistryIconUrl?: string | undefined;
  isFavorite: boolean;
  isSelected: boolean;
  showProvider: boolean;
  preferShortName?: boolean;
  useTriggerLabel?: boolean;
  showNewBadge?: boolean;
  unavailable?: boolean;
  jumpLabel?: string | null;
  disabledReason?: string | null;
  onToggleFavorite: (instanceId: ProviderInstanceId, slug: string) => void;
}) {
  const model = {
    slug: props.slug,
    name: props.name,
    shortName: props.shortName,
    subProvider: props.subProvider,
  };
  const providerLabel = getProviderRowLabel(props.providerDisplayName, props.subProvider);

  const row = (
    <ComboboxItem
      hideIndicator
      index={props.index}
      value={modelPickerModelKey(props.instanceId, props.slug)}
      disabled={Boolean(props.disabledReason)}
      className={cn(
        "group relative w-full min-w-0 max-w-full cursor-pointer",
        props.disabledReason &&
          "data-disabled:pointer-events-auto data-disabled:cursor-not-allowed",
      )}
    >
      <span className="composer-model-check" data-checked={props.isSelected} aria-hidden="true">
        {props.isSelected ? <CheckIcon className="size-2.75" /> : null}
      </span>
      <div className={cn("min-w-0 flex-1 text-left", props.unavailable && "text-placeholder")}>
        <div className="flex min-w-0 items-center gap-2">
          <div className={cn("min-w-0 truncate", props.isSelected && "font-semibold")}>
            {props.useTriggerLabel
              ? getTriggerDisplayModelLabel(model)
              : getDisplayModelName(
                  model,
                  props.preferShortName ? { preferShortName: true } : undefined,
                )}
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
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="icon-xs"
                variant="ghost-muted"
                className="-mr-1 shrink-0"
                onClick={(event) => {
                  event.stopPropagation();
                  props.onToggleFavorite(props.instanceId, props.slug);
                }}
                onKeyDown={(event) => {
                  event.stopPropagation();
                }}
                disabled={Boolean(props.disabledReason)}
                aria-label={
                  props.isFavorite
                    ? t.composer.modelPicker.removeFavorite
                    : t.composer.modelPicker.addFavorite
                }
              >
                <StarIcon className={cn("size-3.5", props.isFavorite && "fill-current")} />
              </Button>
            }
          />
          <TooltipPopup side="top" align="center">
            {props.isFavorite
              ? t.composer.modelPicker.removeFavorite
              : t.composer.modelPicker.addFavorite}
          </TooltipPopup>
        </Tooltip>
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
