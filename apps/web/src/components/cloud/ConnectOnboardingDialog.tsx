/** Localized onboarding presentation and existing interaction behavior. */
import { t } from "~/i18n";
import { useAuth } from "@clerk/react";
import { useAtomValue } from "@effect/atom-react";
import { AuthRelayReadScope, AuthRelayWriteScope, type AuthSessionState } from "@t3tools/contracts";
import { AsyncResult, Atom } from "effect/reactivity";
import { useState } from "react";
import { CheckIcon } from "lucide-react";

import {
  CONNECT_ONBOARDING_OPT_OUT_STORAGE_KEY,
  ConnectOnboardingOptOutSchema,
  EMPTY_CONNECT_ONBOARDING_OPT_OUT_STATE,
} from "~/cloud/connectOnboarding";
import { hasCloudPublicConfig } from "~/cloud/publicConfig";
import { useCloudLinkController } from "~/cloud/useCloudLinkController";
import { useLocalStorage } from "~/hooks/useLocalStorage";
import { isHostedStaticApp } from "~/hostedPairing";
import {
  useEnvironments,
  usePrimaryEnvironment,
  usePrimaryEnvironmentId,
} from "~/state/environments";
import { environmentSession, readEnvironmentScope, useEnvironmentScope } from "~/state/session";
import { CloudEnvironmentConnectRows } from "./CloudEnvironmentConnectList";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { Dialog } from "../ui/dialog";
import { cn } from "~/lib/utils";
import { toastManager } from "../ui/toast";
import {
  OnboardingSteps as WizardSteps,
  OnboardingPopup as WizardPopup,
  OnboardingHeader as WizardHeader,
  OnboardingPanel as WizardPanel,
  OnboardingFooter as WizardFooter,
} from "../onboarding/OnboardingSurface";

export function ConnectOnboardingDialog() {
  if (!hasCloudPublicConfig()) return null;

  return <ConfiguredConnectOnboardingDialog />;
}

type OnboardingStep = "publish" | "devices";

const EMPTY_SESSION_STATE_ATOM = Atom.make(AsyncResult.initial<AuthSessionState>());

/** Coordinates publish preferences and device discovery for the signed-in account; saves the dismissal preference only through the existing completion flow. */
function ConfiguredConnectOnboardingDialog() {
  // Mirrors ManagedRelayAuthProvider: a pending Clerk session must not read as
  // signed-out, or its later activation would look like a fresh sign-in.
  const { isLoaded, isSignedIn, userId } = useAuth({ treatPendingAsSignedOut: false });
  const [optOutState, setOptOutState] = useLocalStorage(
    CONNECT_ONBOARDING_OPT_OUT_STORAGE_KEY,
    EMPTY_CONNECT_ONBOARDING_OPT_OUT_STATE,
    ConnectOnboardingOptOutSchema,
  );

  const { environments, isReady: environmentsReady } = useEnvironments();
  // The empty hosted home already adds account computers after sign-in.
  const homeScreenAddsComputers =
    isHostedStaticApp() && environmentsReady && environments.length === 0;
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const primarySessionState = useAtomValue(
    primaryEnvironmentId === null
      ? EMPTY_SESSION_STATE_ATOM
      : environmentSession.sessionStateAtom(primaryEnvironmentId),
  );
  const canReadRelay = useEnvironmentScope(primaryEnvironmentId, AuthRelayReadScope);
  const canWriteRelay = useEnvironmentScope(primaryEnvironmentId, AuthRelayWriteScope);
  const canManageRelay = canReadRelay && canWriteRelay;
  const sessionScopesKnown =
    primaryEnvironmentId === null ? environmentsReady : primarySessionState._tag !== "Initial";

  const controller = useCloudLinkController();
  const showPublishStep = canManageRelay && controller.linkState.target !== null;
  const steps: ReadonlyArray<OnboardingStep> = showPublishStep
    ? ["publish", "devices"]
    : ["devices"];

  const [requestedAccount, setRequestedAccount] = useState<string | null>(null);
  const [openForAccount, setOpenForAccount] = useState<string | null>(null);
  const [step, setStep] = useState<OnboardingStep>("devices");
  const [exposeEnvironment, setExposeEnvironment] = useState(true);
  const [publishAgentActivity, setPublishAgentActivity] = useState(true);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [prefilledFromLinkState, setPrefilledFromLinkState] = useState(false);
  // undefined until auth first settles, so the account already signed in at load
  // never reads as a fresh sign-in.
  const [observedAccount, setObservedAccount] = useState<string | null | undefined>(undefined);

  if (step === "publish" && sessionScopesKnown && !showPublishStep && !isApplying) {
    setStep("devices");
  }

  const optOutAccounts = optOutState.optOutAccounts;

  // A loaded-but-incomplete snapshot (signed in, user id not yet populated)
  // must not be recorded as signed-out — the next render would then look
  // like a fresh sign-in on a cold load.
  if (isLoaded && !(isSignedIn && !userId)) {
    const nextAccount = isSignedIn && userId ? userId : null;
    if (nextAccount !== observedAccount) {
      setObservedAccount(nextAccount);
      if (observedAccount !== undefined && nextAccount !== null) {
        setRequestedAccount(nextAccount);
      }
    }
  }

  if (openForAccount !== null && (!isSignedIn || userId !== openForAccount)) {
    setOpenForAccount(null);
  }
  if (requestedAccount !== null && (!isSignedIn || userId !== requestedAccount)) {
    setRequestedAccount(null);
  }

  // A manageable session implies a primary environment, so when the scopes
  // allow publishing, wait for the connection target too — otherwise the
  // wizard could open on the devices step moments before the publish step
  // becomes available and freeze there.
  const publishStepDecided = !canManageRelay || controller.linkState.target !== null;

  if (requestedAccount !== null && openForAccount === null) {
    if (homeScreenAddsComputers || optOutAccounts.includes(requestedAccount)) {
      setRequestedAccount(null);
    } else if (sessionScopesKnown && publishStepDecided) {
      setRequestedAccount(null);
      setPrefilledFromLinkState(false);
      setExposeEnvironment(true);
      setPublishAgentActivity(true);
      setDontShowAgain(false);
      setStep(canManageRelay && controller.linkState.target !== null ? "publish" : "devices");
      setOpenForAccount(requestedAccount);
    }
  }

  const linkStateData = controller.linkState.data;
  if (openForAccount !== null && !prefilledFromLinkState && linkStateData !== null) {
    setPrefilledFromLinkState(true);
    if (
      linkStateData.linked &&
      linkStateData.linkRevoked !== true &&
      linkStateData.cloudUserId === openForAccount
    ) {
      setExposeEnvironment(linkStateData.managedTunnelActive ?? linkStateData.linked);
      setPublishAgentActivity(linkStateData.publishAgentActivity);
    }
  }

  const complete = () => {
    if (isApplying) return;
    const account = openForAccount;
    setOpenForAccount(null);
    if (account !== null && dontShowAgain) {
      setOptOutState((state) =>
        state.optOutAccounts.includes(account)
          ? state
          : { optOutAccounts: [...state.optOutAccounts, account] },
      );
    }
  };

  const applyPublishSelection = async () => {
    if (isApplying) return;
    if (
      primaryEnvironmentId === null ||
      !readEnvironmentScope(primaryEnvironmentId, AuthRelayReadScope) ||
      !readEnvironmentScope(primaryEnvironmentId, AuthRelayWriteScope)
    ) {
      setStep("devices");
      return;
    }
    if (linkStateData === null || controller.linkState.error !== null) return;
    // The wizard only ever enables — with both toggles off there is nothing to
    // apply, and an existing link must not be torn down from onboarding.
    if (!exposeEnvironment && !publishAgentActivity) {
      setStep("devices");
      return;
    }
    setIsApplying(true);
    const ok = await controller.reconcileCloudState({
      managedTunnel: exposeEnvironment,
      publish: publishAgentActivity,
    });
    setIsApplying(false);
    if (!ok) return;
    toastManager.add({
      type: "success",
      title: t.account.onboarding.connectEnabled,
      description: exposeEnvironment
        ? t.account.onboarding.availableToDevices
        : t.account.onboarding.publishesActivity,
    });
    setStep("devices");
  };

  return (
    <Dialog
      open={openForAccount !== null}
      onOpenChange={(open) => {
        if (!open && !isApplying) complete();
      }}
    >
      <WizardPopup>
        <WizardHeader
          cloud
          title={t.account.onboarding.setupConnect}
          description={<>{t.account.onboarding.meshHint}</>}
        >
          {steps.length > 1 ? (
            <WizardSteps
              steps={steps.map((id) => STEP_LABELS[id])}
              currentStep={steps.indexOf(step)}
              isStepDisabled={() => isApplying}
              onStepChange={(index) => {
                const next = steps[index];
                if (
                  next === "publish" &&
                  (primaryEnvironmentId === null ||
                    !readEnvironmentScope(primaryEnvironmentId, AuthRelayReadScope) ||
                    !readEnvironmentScope(primaryEnvironmentId, AuthRelayWriteScope))
                )
                  return;
                if (next) setStep(next);
              }}
            />
          ) : null}
        </WizardHeader>
        <WizardPanel>
          {step === "publish" ? (
            <PublishStep
              exposeEnvironment={exposeEnvironment}
              publishAgentActivity={publishAgentActivity}
              disabled={isApplying || !canManageRelay || linkStateData === null}
              operationError={controller.operationError ?? controller.linkState.error}
              onExposeEnvironmentChange={(enabled) => {
                if (
                  primaryEnvironmentId !== null &&
                  readEnvironmentScope(primaryEnvironmentId, AuthRelayReadScope) &&
                  readEnvironmentScope(primaryEnvironmentId, AuthRelayWriteScope)
                )
                  setExposeEnvironment(enabled);
              }}
              onPublishAgentActivityChange={(enabled) => {
                if (
                  primaryEnvironmentId !== null &&
                  readEnvironmentScope(primaryEnvironmentId, AuthRelayReadScope) &&
                  readEnvironmentScope(primaryEnvironmentId, AuthRelayWriteScope)
                )
                  setPublishAgentActivity(enabled);
              }}
            />
          ) : (
            <DevicesStep />
          )}
        </WizardPanel>
        <WizardFooter
          leading={
            <Button
              size="dialog-action"
              variant="ghost-muted"
              aria-pressed={dontShowAgain}
              onClick={() => setDontShowAgain((value) => !value)}
            >
              {dontShowAgain ? <CheckIcon aria-hidden className="size-4" /> : null}
              {t.account.onboarding.dontShowAgain}
            </Button>
          }
        >
          {step === "publish" ? (
            <>
              <Button
                size="dialog-action"
                variant="outline"
                disabled={isApplying}
                onClick={() => setStep("devices")}
              >
                {t.account.onboarding.notNow}
              </Button>
              <Button
                size="dialog-action"
                disabled={isApplying || !canManageRelay || linkStateData === null}
                onClick={() => void applyPublishSelection()}
              >
                {isApplying ? t.account.onboarding.enabling : t.account.onboarding.continue}
              </Button>
            </>
          ) : (
            <Button size="dialog-action" disabled={isApplying} onClick={complete}>
              {t.account.onboarding.done}
            </Button>
          )}
        </WizardFooter>
      </WizardPopup>
    </Dialog>
  );
}

const STEP_LABELS: Record<OnboardingStep, string> = {
  publish: t.account.onboarding.publish,
  devices: t.account.onboarding.connectDevices,
};

/** Renders the supplied publication toggles and validation state; invokes parent callbacks without applying cloud settings itself. */
function PublishStep({
  exposeEnvironment,
  publishAgentActivity,
  disabled,
  operationError,
  onExposeEnvironmentChange,
  onPublishAgentActivityChange,
}: {
  readonly exposeEnvironment: boolean;
  readonly publishAgentActivity: boolean;
  readonly disabled: boolean;
  readonly operationError: string | null;
  readonly onExposeEnvironmentChange: (enabled: boolean) => void;
  readonly onPublishAgentActivityChange: (enabled: boolean) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <OnboardingToggleRow
          title={t.account.onboarding.publishEnvironment}
          description={t.account.onboarding.publishHint}
          checked={exposeEnvironment}
          disabled={disabled}
          onCheckedChange={onExposeEnvironmentChange}
        />
        <OnboardingToggleRow
          title={t.account.onboarding.publishActivity}
          description={t.account.onboarding.activityHint}
          checked={publishAgentActivity}
          disabled={disabled}
          onCheckedChange={onPublishAgentActivityChange}
        />
      </div>
      {operationError ? (
        <p className="text-secondary-copy text-destructive">{operationError}</p>
      ) : null}
    </div>
  );
}

/** Makes the whole publication option selectable while preserving disabled state and parent callbacks. */
function OnboardingToggleRow({
  title,
  description,
  checked,
  disabled,
  onCheckedChange,
}: {
  readonly title: string;
  readonly description: string;
  readonly checked: boolean;
  readonly disabled: boolean;
  readonly onCheckedChange: (enabled: boolean) => void;
}) {
  return (
    <label
      className={cn(
        "flex min-h-11 cursor-pointer items-center gap-2.5 rounded-ov5-row px-3 text-control",
        disabled && "cursor-default",
        checked ? "bg-accent inset-shadow-selected-control" : "bg-ov5-row",
      )}
    >
      <Checkbox
        aria-label={title}
        checked={checked}
        disabled={disabled}
        onCheckedChange={(value) => onCheckedChange(value === true)}
      />
      <span>{title}</span>
      <span className="sr-only">{description}</span>
    </label>
  );
}

/** Shows other published environments available to connect and guidance when discovery is empty. */
function DevicesStep() {
  const { environments } = useEnvironments();
  const primaryEnvironment = usePrimaryEnvironment();
  const savedEnvironments = environments.filter(
    (environment) => environment.entry.target._tag !== "PrimaryConnectionTarget",
  );

  return (
    <div className="overflow-hidden rounded-ov5-row bg-ov5-well shadow-well-pressed">
      <CloudEnvironmentConnectRows
        primaryEnvironmentId={primaryEnvironment?.environmentId ?? null}
        savedEnvironments={savedEnvironments}
        showSavedEnvironments
        empty={
          <p className="px-4 py-6 text-center text-control text-muted-foreground">
            {t.account.onboarding.noOtherEnvironments}
          </p>
        }
      />
    </div>
  );
}
