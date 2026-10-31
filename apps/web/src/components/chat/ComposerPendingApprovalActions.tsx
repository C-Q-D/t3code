import { t } from "~/i18n";
import {
  type ProviderApprovalDecision,
  type ProviderApprovalOption,
  type RuntimeRequestId,
} from "@t3tools/contracts";
import { memo } from "react";
import { ChevronDownIcon, TriangleAlertIcon } from "lucide-react";
import { cn } from "~/lib/utils";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { composerFloatingLayerProps } from "./composerEventScope";

interface ComposerPendingApprovalActionsProps {
  presentation?: "composer" | "inline";
  requestId: RuntimeRequestId;
  isResponding: boolean;
  canRespond: boolean;
  disabled?: boolean;
  options?: ReadonlyArray<ProviderApprovalOption> | undefined;
  onRespondToApproval: (
    requestId: RuntimeRequestId,
    decision: ProviderApprovalDecision,
  ) => Promise<unknown>;
}

const DEFAULT_APPROVAL_OPTIONS = [
  { decision: "cancel", label: t.composer.approval.cancel },
  { decision: "decline", label: t.composer.approval.decline },
  { decision: "acceptForSession", label: t.composer.approval.allowSession },
  { decision: "accept", label: t.composer.approval.approve },
] satisfies ReadonlyArray<ProviderApprovalOption>;

/** E1's 38px decisions share the existing provider commands and warning disclosures. */
export const ComposerPendingApprovalActions = memo(function ComposerPendingApprovalActions({
  requestId,
  isResponding,
  canRespond,
  disabled = false,
  options = DEFAULT_APPROVAL_OPTIONS,
  onRespondToApproval,
}: ComposerPendingApprovalActionsProps) {
  const moreOptions = options.filter(
    (option) => option.decision !== "decline" && option.decision !== "accept",
  );

  // Session and cancel keep their menu availability; main decisions still require a live request.
  const renderDecision = (option: ProviderApprovalOption) => {
    const isPrimary = option.decision === "accept";
    const isMainDecision = isPrimary || option.decision === "decline";
    const buttonDisabled = disabled || isResponding || (isMainDecision && !canRespond);
    const button = (
      <button
        type="button"
        key={option.decision}
        className={cn(
          "composer-approval-action",
          isPrimary
            ? "composer-primary-key bg-primary px-4.5 font-extrabold text-primary-foreground text-shadow-none shadow-composer-panel-primary enabled:hover:bg-message-action-hover disabled:bg-accent"
            : option.decision === "cancel"
              ? "ml-auto bg-transparent px-3.5 font-normal text-secondary-label enabled:hover:bg-secondary enabled:hover:text-foreground"
              : "bg-secondary px-4 font-semibold shadow-raise-xs-control enabled:hover:bg-accent",
          option.decision === "decline" && "composer-primary-key text-error",
          option.decision === "acceptForSession" && "text-foreground",
          isPrimary && moreOptions.length > 0 && "rounded-r-composer-split",
        )}
        disabled={buttonDisabled}
        aria-description={option.warning}
        onClick={() => {
          if (!disabled && !isResponding) {
            void onRespondToApproval(requestId, option.decision);
          }
        }}
      >
        {option.warning ? <TriangleAlertIcon className="size-3 shrink-0" /> : null}
        <span className="max-w-40 truncate">{option.label}</span>
      </button>
    );
    return option.warning ? (
      <Tooltip key={option.decision}>
        <TooltipTrigger render={button} />
        <TooltipPopup side="top">{option.warning}</TooltipPopup>
      </Tooltip>
    ) : (
      button
    );
  };

  return (
    <div className="flex w-full flex-wrap items-center gap-2 px-0.5">
      <div className="flex items-center gap-0.5">
        {options.filter((option) => option.decision === "accept").map(renderDecision)}
        {moreOptions.length > 0 ? (
          <Menu>
            <MenuTrigger
              disabled={disabled || isResponding}
              render={
                <button
                  type="button"
                  className="composer-approval-action composer-primary-key w-8.5 rounded-l-composer-split bg-primary p-0 text-primary-foreground shadow-composer-panel-primary enabled:hover:bg-message-action-hover disabled:bg-accent"
                  aria-label={t.composer.approval.moreOptions}
                />
              }
            >
              <ChevronDownIcon className="size-3.75" strokeWidth={2.25} />
            </MenuTrigger>
            <MenuPopup {...composerFloatingLayerProps} side="top" align="end" width="content">
              {moreOptions.map((option) => {
                const item = (
                  <MenuItem
                    key={option.decision}
                    disabled={disabled || isResponding}
                    aria-description={option.warning}
                    onClick={() => {
                      if (!disabled && !isResponding)
                        void onRespondToApproval(requestId, option.decision);
                    }}
                    variant="ghost"
                    className="mb-1 last:mb-0"
                  >
                    {option.warning ? <TriangleAlertIcon className="size-3 text-warning" /> : null}
                    <span className="min-w-0 whitespace-normal wrap-break-word">
                      {option.label}
                    </span>
                  </MenuItem>
                );
                return option.warning ? (
                  <Tooltip key={option.decision}>
                    <TooltipTrigger render={item} />
                    <TooltipPopup side="top">{option.warning}</TooltipPopup>
                  </Tooltip>
                ) : (
                  item
                );
              })}
            </MenuPopup>
          </Menu>
        ) : null}
      </div>
      {options.filter((option) => option.decision === "acceptForSession").map(renderDecision)}
      {options.filter((option) => option.decision === "decline").map(renderDecision)}
      {options.filter((option) => option.decision === "cancel").map(renderDecision)}
    </div>
  );
});
