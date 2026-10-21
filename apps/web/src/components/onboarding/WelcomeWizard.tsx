/** Localized onboarding presentation and existing interaction behavior. */
import { t } from "~/i18n";
import { useAuth } from "@clerk/react";
import { useAtomValue } from "@effect/atom-react";
import type {
  AgentSessionProjectCandidate,
  EnvironmentId,
  ProjectId,
  ProviderInstanceId,
  ScopedProjectRef,
  ServerConfig,
  ServerProvider,
} from "@t3tools/contracts";
import { scopeProjectRef, scopeThreadRef } from "@t3tools/client-runtime/environment";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import {
  AuthTerminalOperateScope,
  CommandId,
  defaultInstanceIdForDriver,
  AuthOrchestrationOperateScope,
  ProviderDriverKind,
  ThreadId,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import {
  CheckIcon,
  ChevronRightIcon,
  CloudIcon,
  PlusIcon,
  ShieldIcon,
  MonitorIcon,
  TerminalIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { TYPOGRAPHY_ADVANCED_STORAGE_KEY } from "../../appearanceFonts";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { hasCloudPublicConfig } from "../../cloud/publicConfig";
import { PRIVACY_POLICY_URL } from "../../legalLinks";
import { useT3ConnectAuthPrompt } from "../clerk/useT3ConnectAuthPrompt";
import { completeOnboarding } from "../../onboarding/firstRun";
import {
  groupOnboardingProjects,
  partitionOnboardingProjects,
  onboardingProjectKey,
  resolveOnboardingLandingProject,
  resolveOnboardingProjectId,
  type OnboardingProjectGroup,
  splitOnboardingProjectPath,
} from "../../onboarding/projectImport.logic";
import {
  getOnboardingProviderState,
  resolveOnboardingProviderInstallCommand,
  resolveOnboardingProviderLoginCommand,
  selectOnboardingProvidersByDriver,
} from "../../onboarding/providerReadiness.logic";
import { newProjectId, randomUUID } from "../../lib/utils";
import { agentSessionImport } from "../../state/agentSessions";
import { readProjects, useProjects } from "../../state/entities";
import { useEnvironments, usePrimaryEnvironment } from "../../state/environments";
import {
  isOnboardingRelayEnvironment,
  resolveOnboardingSetup,
} from "../../onboarding/targetEnvironment.logic";
import { useProjectScans } from "../../onboarding/useProjectScans";
import { projectEnvironment } from "../../state/projects";
import { serverEnvironment } from "../../state/server";
import {
  readEnvironmentScope,
  useEnvironmentScope,
  useEnvironmentsWithScope,
} from "../../state/session";
import { terminalEnvironment } from "../../state/terminal";
import { useAtomCommand } from "../../state/use-atom-command";
import { connectPairing } from "../../connection/onboarding";
import { getProviderSummary } from "../settings/providerStatus";
import { providerClients } from "../settings/providerDriverMeta";
import { ChatGptWelcomeCoordinator } from "../settings/ChatGptWelcomeCoordinator";
import { AddManagedCodexAccountDialog, CodexSetupSection } from "../settings/CodexSetupSection";
import { readCodexSetupMode } from "../settings/CodexSetupSection.logic";
import { buildProviderInstanceUpdatePatch } from "../settings/SettingsPanels.logic";
import { TerminalViewport } from "../ThreadTerminalDrawer";
import { CloudEnvironmentConnectRows } from "../cloud/CloudEnvironmentConnectList";
import { presentSavedCloudEnvironmentConnection } from "../cloud/cloudEnvironmentConnectionPresentation";
import { ProviderInstanceIcon } from "../chat/ProviderInstanceIcon";
import { PixelIcon } from "../icons/PixelIcon";
import { Alert, AlertDescription } from "../ui/alert";
import { Button } from "../ui/button";
import { CommandBlock } from "../CommandBlock";
import { Checkbox } from "../ui/checkbox";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "../ui/collapsible";
import { Input } from "../ui/input";
import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";
import { ScrollArea } from "../ui/scroll-area";
import { Spinner } from "../ui/spinner";
import {
  OnboardingPanel as WizardPanel,
  OnboardingSteps as WizardSteps,
  OnboardingPopup as WizardPopup,
  OnboardingHeader as WizardHeader,
} from "./OnboardingSurface";
import { Dialog } from "../ui/dialog";
import { toastManager } from "../ui/toast";
import { cn } from "../../lib/utils";
import { formatRelativeTime } from "../../timestampFormat";

type WizardStep = "connection" | "agents" | "import";
const NO_ENVIRONMENTS: readonly EnvironmentId[] = [];

const AGENT_ONBOARDING_THREAD_ID = ThreadId.make("onboarding-agent-setup");
const ONBOARDING_STAGES = [
  t.account.onboarding.connectComputers,
  t.account.onboarding.connectAgents,
  t.account.onboarding.chooseProjects,
] as const;
const SCAN_LIMIT_MESSAGE = t.account.onboarding.scanLimit;

/** Coordinates computer selection, agent setup and optional project/history import; supplied completion callbacks run after the existing settings/import flow. */
export function WelcomeWizard({
  localAvailable,
  onDone,
  resumeEnvironmentId,
}: {
  readonly localAvailable: boolean;
  readonly resumeEnvironmentId?: EnvironmentId | undefined;
  readonly onDone: (projectRef?: ScopedProjectRef) => void | Promise<void>;
}) {
  const [step, setStep] = useState<WizardStep>(resumeEnvironmentId ? "agents" : "connection");
  const { environments } = useEnvironments();
  const [selection, setSelection] = useState<ReadonlySet<EnvironmentId> | null>(null);
  // One registry for the wizard's lifetime, shared with the connect list, so a computer is
  // auto-selected once even after the user unchecks it.
  const [autoSelectedComputers] = useState(() => new Set<EnvironmentId>());
  const [setupIds, setSetupIds] = useState<readonly EnvironmentId[]>(
    resumeEnvironmentId ? [resumeEnvironmentId] : [],
  );
  const [isImporting, setIsImporting] = useState(false);
  const finishingPromiseRef = useRef<Promise<boolean> | null>(null);
  const completionErrorToastIdRef = useRef<ReturnType<typeof toastManager.add> | null>(null);
  const primaryEnvironment = usePrimaryEnvironment();
  useEffect(() => {
    const newComputers = environments.filter(
      (environment) => !autoSelectedComputers.has(environment.environmentId),
    );
    if (newComputers.length === 0) return;
    for (const environment of newComputers) {
      autoSelectedComputers.add(environment.environmentId);
    }
    const enabledComputers = newComputers.filter((environment) => environment.entry.enabled);
    if (enabledComputers.length === 0) return;
    // oxlint-disable-next-line react/set-state-in-effect -- The registry marks each computer once, and only after commit; render must not mutate it.
    setSelection(
      (current) =>
        new Set([
          ...(current ?? []),
          ...enabledComputers.map((environment) => environment.environmentId),
        ]),
    );
  }, [autoSelectedComputers, environments]);
  const selectedIds =
    selection ?? new Set(primaryEnvironment ? [primaryEnvironment.environmentId] : []);
  const scans = useProjectScans(step === "import" ? setupIds : NO_ENVIRONMENTS);
  const isLoadingProjects =
    step === "import" &&
    scans.every((scan) => scan.data === null) &&
    scans.some((scan) => scan.isPending);
  const startSetup = (ids: readonly EnvironmentId[]) => {
    if (ids.length === 0) return;
    setSetupIds(ids);
    setStep("agents");
  };
  const stageIndex = step === "agents" ? 1 : step === "import" ? 2 : 0;
  const finish = (
    projectRef?: ScopedProjectRef,
    importWarning?: string,
    importedThreadCount = 0,
  ) => {
    if (finishingPromiseRef.current !== null) return finishingPromiseRef.current;
    if (completionErrorToastIdRef.current !== null) {
      toastManager.close(completionErrorToastIdRef.current);
      completionErrorToastIdRef.current = null;
    }

    const completion = completeOnboarding()
      .then(async () => {
        if (completionErrorToastIdRef.current !== null) {
          toastManager.close(completionErrorToastIdRef.current);
          completionErrorToastIdRef.current = null;
        }
        await onDone(projectRef);
        if (importWarning) {
          toastManager.add({
            type: "warning",
            title: t.account.onboarding.partialImport,
            description: importWarning,
            timeout: 0,
          });
        } else if (importedThreadCount > 0) {
          toastManager.add({
            type: "success",
            title: t.account.onboarding.importedThreads(importedThreadCount),
          });
        }
        return true;
      })
      .catch(() => {
        const errorToast = {
          type: "error",
          title: t.account.onboarding.setupFailed,
          description: t.account.onboarding.saveFailed,
        } as const;
        if (completionErrorToastIdRef.current === null) {
          completionErrorToastIdRef.current = toastManager.add(errorToast);
        } else {
          toastManager.update(completionErrorToastIdRef.current, errorToast);
        }
        return false;
      })
      .finally(() => {
        if (finishingPromiseRef.current === completion) {
          finishingPromiseRef.current = null;
        }
      });
    finishingPromiseRef.current = completion;
    return completion;
  };

  return (
    <Dialog
      open
      disablePointerDismissal
      onOpenChange={(_, event) => {
        event.cancel();
        if (event.reason === "close-press" && !isImporting) void finish();
      }}
    >
      <WizardPopup
        welcome
        initialFocus={() => document.getElementById("onboarding-pairing-url") ?? true}
      >
        <WizardHeader title={t.account.onboarding.setup}>
          <WizardSteps
            steps={ONBOARDING_STAGES}
            currentStep={stageIndex}
            isStepDisabled={(index) => isImporting || index >= stageIndex}
            onStepChange={(index) => {
              if (isImporting || index > stageIndex) return;
              setStep(index === 0 ? "connection" : "agents");
            }}
          />
        </WizardHeader>

        <WizardPanel holdHeight={isLoadingProjects}>
          {step === "connection" ? (
            <ConnectionStep
              expandPairingInitially={!localAvailable && !hasCloudPublicConfig()}
              selectedIds={selectedIds}
              autoSelectedComputers={autoSelectedComputers}
              onSelectionChange={setSelection}
              onToggleEnvironment={(environmentId, checked) =>
                setSelection((current) => {
                  const next = new Set(current ?? selectedIds);
                  if (checked) next.add(environmentId);
                  else next.delete(environmentId);
                  return next;
                })
              }
              onContinue={() =>
                startSetup(resolveOnboardingSetup(environments, selectedIds).environmentIds)
              }
              onPaired={(environmentId) => {
                setSelection(new Set([...selectedIds, environmentId]));
              }}
            />
          ) : step === "agents" ? (
            <AgentsStep
              environmentIds={setupIds}
              onBack={() => setStep("connection")}
              onContinue={() => setStep("import")}
            />
          ) : (
            <ImportStep
              onBack={() => setStep("agents")}
              scans={scans}
              isImporting={isImporting}
              setIsImporting={setIsImporting}
              onDone={finish}
            />
          )}
        </WizardPanel>
      </WizardPopup>
      <ChatGptWelcomeCoordinator />
    </Dialog>
  );
}

// ── Step 1: connection choice ────────────────────────────────

/** Renders the supplied selected computers and pairing flow; enables continuation only when the selection is ready and not pairing. */
function ConnectionStep({
  autoSelectedComputers,
  expandPairingInitially,
  selectedIds,
  onSelectionChange,
  onToggleEnvironment,
  onContinue,
  onPaired,
}: {
  readonly autoSelectedComputers: Set<EnvironmentId>;
  readonly expandPairingInitially: boolean;
  readonly selectedIds: ReadonlySet<EnvironmentId>;
  readonly onSelectionChange: (ids: ReadonlySet<EnvironmentId>) => void;
  readonly onToggleEnvironment: (environmentId: EnvironmentId, checked: boolean) => void;
  readonly onContinue: () => void;
  readonly onPaired: (environmentId: EnvironmentId) => void;
}) {
  const { environments } = useEnvironments();
  const cloudEnabled = hasCloudPublicConfig();
  const directEnvironments = environments.filter(
    (environment) => !cloudEnabled || !isOnboardingRelayEnvironment(environment),
  );
  const [pairingOpen, setPairingOpen] = useState(expandPairingInitially);
  const [isPairing, setIsPairing] = useState(false);
  const { ready, skippedIds } = resolveOnboardingSetup(environments, selectedIds);
  const skippedLabels = environments
    .filter((environment) => skippedIds.includes(environment.environmentId))
    .map((environment) => environment.label);
  const continueRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (
      ready &&
      (document.activeElement === document.body ||
        document.activeElement?.getAttribute("role") === "dialog")
    ) {
      continueRef.current?.focus();
    }
  }, [ready]);
  return (
    <>
      <h1 className="sr-only">{t.account.onboarding.connectComputers}</h1>
      <p className="sr-only">{t.account.onboarding.computersHint}</p>
      {directEnvironments.length > 0 ? (
        <fieldset className="space-y-2.5">
          <legend className="sr-only">{t.account.onboarding.computersToSetUp}</legend>
          {directEnvironments.map((environment) => (
            <label
              key={environment.environmentId}
              className={cn(
                "flex min-h-13 cursor-pointer items-center gap-3 rounded-card-row px-3.5 py-2",
                selectedIds.has(environment.environmentId)
                  ? "bg-accent inset-shadow-selected-control"
                  : "bg-ov5-row shadow-ov5-row",
              )}
            >
              <Checkbox
                checked={selectedIds.has(environment.environmentId)}
                onCheckedChange={(checked) => {
                  const next = new Set(selectedIds);
                  if (checked) next.add(environment.environmentId);
                  else next.delete(environment.environmentId);
                  onSelectionChange(next);
                }}
              />
              <MonitorIcon className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 text-control font-medium break-words">
                    {environment.label}
                  </span>
                  <span className="shrink-0 text-secondary-copy text-muted-foreground">
                    {/* Same rule as Settings: a switched-off computer reads Off, not Not connected. */}
                    {!environment.entry.enabled && environment.connection.phase !== "unsupported"
                      ? "Off"
                      : presentSavedCloudEnvironmentConnection(environment.connection).buttonLabel}
                  </span>
                </span>
                {environment.displayUrl ? (
                  <span className="mt-0.5 block text-secondary-copy break-all text-muted-foreground">
                    {environment.displayUrl}
                  </span>
                ) : null}
                {environment.connection.phase === "unsupported" && environment.connection.error ? (
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {environment.connection.error}
                  </span>
                ) : null}
              </span>
            </label>
          ))}
        </fieldset>
      ) : null}
      <div className="mt-2.5 space-y-2.5">
        <div className="rounded-card-row shadow-outline-control">
          <Collapsible open={pairingOpen} onOpenChange={setPairingOpen}>
            <CollapsibleTrigger
              disabled={isPairing}
              render={
                <Button variant="ghost" size="onboarding-row" className="w-full justify-start" />
              }
            >
              <PlusIcon className="size-4" />
              <span className="flex-1 text-left">{t.account.onboarding.addComputer}</span>
              <ChevronRightIcon
                className={cn("size-4 text-muted-foreground", pairingOpen && "rotate-90")}
              />
            </CollapsibleTrigger>
            <CollapsiblePanel>
              <div className="px-3 pb-3">
                <PairingForm
                  isPairing={isPairing}
                  setIsPairing={setIsPairing}
                  onPaired={(environmentId) => {
                    setPairingOpen(false);
                    onPaired(environmentId);
                    requestAnimationFrame(() => continueRef.current?.focus());
                  }}
                />
              </div>
            </CollapsiblePanel>
          </Collapsible>
        </div>
        {cloudEnabled ? (
          <ConnectAccountOption
            autoSelectedComputers={autoSelectedComputers}
            disabled={isPairing}
            selectedIds={selectedIds}
            onToggleEnvironment={onToggleEnvironment}
          />
        ) : null}
      </div>
      {skippedLabels.length > 0 ? (
        <p className="mt-4 text-secondary-copy text-muted-foreground">
          {t.account.onboarding.skippedSetup(skippedLabels.join(", "), skippedLabels.length)}
        </p>
      ) : null}
      <div className="mt-3 flex flex-col gap-4.5">
        <p className="min-w-0 text-secondary-copy-medium text-secondary-label">
          <ShieldIcon className="mr-2 inline size-3.5" />
          {t.account.onboarding.connectPrivacy}{" "}
          <a
            className="underline underline-offset-2 hover:text-foreground"
            href={PRIVACY_POLICY_URL}
            target="_blank"
            rel="noreferrer noopener"
          >
            {t.account.onboarding.privacyPolicy}
          </a>
          .
        </p>
        <Button
          size="onboarding"
          className="shrink-0 self-end"
          ref={continueRef}
          autoFocus={!expandPairingInitially}
          disabled={!ready || isPairing}
          onClick={onContinue}
        >
          {t.account.onboarding.next}
        </Button>
      </div>
    </>
  );
}

/** Shows T3 Connect authentication/discovery for the supplied selection and lets the parent add chosen computers. */
function ConnectAccountOption({
  autoSelectedComputers,
  disabled,
  selectedIds,
  onToggleEnvironment,
}: {
  readonly autoSelectedComputers: Set<EnvironmentId>;
  readonly disabled: boolean;
  readonly selectedIds: ReadonlySet<EnvironmentId>;
  readonly onToggleEnvironment: (environmentId: EnvironmentId, checked: boolean) => void;
}) {
  const { environments } = useEnvironments();
  const { isLoaded, isSignedIn } = useAuth({ treatPendingAsSignedOut: false });
  const { openAuthPrompt } = useT3ConnectAuthPrompt();
  const [expanded, setExpanded] = useState(true);
  const [discoveryReady, setDiscoveryReady] = useState(false);
  const onDiscoveryReady = () => setDiscoveryReady(true);

  return (
    <div className="rounded-card-row bg-ov5-well shadow-well-pressed">
      <Collapsible open={expanded && !!isSignedIn && discoveryReady} onOpenChange={setExpanded}>
        <CollapsibleTrigger
          disabled={disabled || !isLoaded}
          onClick={(event) => {
            if (!isSignedIn) {
              event.preventDefault();
              setExpanded(true);
              openAuthPrompt();
            }
          }}
          render={<Button variant="ghost" size="onboarding-row" className="w-full justify-start" />}
        >
          <CloudIcon className="size-4 text-muted-foreground" />
          <span className="flex-1 text-left">T3 Connect</span>
          <span
            className={cn(
              "text-secondary-copy-medium",
              !isSignedIn && isLoaded
                ? "inline-flex h-8 items-center rounded-full bg-secondary px-3.5 font-semibold text-foreground shadow-raise-tab"
                : "text-secondary-label",
            )}
          >
            {!isLoaded
              ? t.account.onboarding.loadingSignIn
              : !isSignedIn
                ? t.account.onboarding.signIn
                : !discoveryReady
                  ? t.account.onboarding.loadingComputers
                  : null}
          </span>
          {isSignedIn ? (
            <ChevronRightIcon className={cn("size-4", expanded && "rotate-90")} />
          ) : null}
        </CollapsibleTrigger>
        <CollapsiblePanel keepMounted>
          <div className="px-3 pb-3">
            <div className="mb-3 space-y-1.5">
              {isSignedIn ? (
                <CloudEnvironmentConnectRows
                  primaryEnvironmentId={null}
                  savedEnvironments={environments}
                  showSavedEnvironments
                  onDiscoveryReady={onDiscoveryReady}
                  selection={{ selectedIds, onChange: onToggleEnvironment, autoSelectedComputers }}
                  refreshWhileEmpty
                  empty={
                    <p className="py-3 text-control text-muted-foreground">
                      {t.account.onboarding.noComputers}
                    </p>
                  }
                />
              ) : null}
            </div>
            <p className="text-control text-muted-foreground">
              {t.account.onboarding.runOnComputers}
            </p>
            <CommandBlock command="npx t3 connect" className="mt-3" />
            <p className="mt-3 text-secondary-copy text-muted-foreground">
              {t.account.onboarding.keepRunning}
            </p>
          </div>
        </CollapsiblePanel>
      </Collapsible>
    </div>
  );
}

function PairingForm({
  isPairing,
  setIsPairing,
  onPaired,
}: {
  readonly isPairing: boolean;
  readonly setIsPairing: (value: boolean) => void;
  readonly onPaired: (environmentId: EnvironmentId) => void;
}) {
  const connectPairingEnvironment = useAtomCommand(connectPairing, { reportFailure: false });
  const [pairingUrl, setPairingUrl] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const submit = async () => {
    if (isPairing || pairingUrl.trim().length === 0) return;
    setIsPairing(true);
    setErrorMessage("");
    const result = await connectPairingEnvironment({ pairingUrl: pairingUrl.trim() });
    if (!mountedRef.current) return;
    setIsPairing(false);
    if (result._tag === "Success") {
      onPaired(result.value);
      return;
    }
    if (isAtomCommandInterrupted(result)) return;
    const cause = squashAtomCommandFailure(result);
    setErrorMessage(cause instanceof Error ? cause.message : t.account.onboarding.pairingFailed);
  };

  return (
    <>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div>
          <label
            className="block text-control text-muted-foreground"
            htmlFor="onboarding-pairing-url"
          >
            {t.account.onboarding.pairingLink}
          </label>
          <Input
            id="onboarding-pairing-url"
            autoFocus
            aria-invalid={errorMessage.length > 0}
            aria-describedby={errorMessage ? "onboarding-pairing-error" : undefined}
            className="mt-2"
            size="lg"
            autoCapitalize="none"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            nativeInput
            readOnly={isPairing}
            placeholder="https://your-server:5230/pair#token=…"
            value={pairingUrl}
            onChange={(event) => setPairingUrl(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                (event.nativeEvent.isComposing || event.keyCode === 229)
              ) {
                event.preventDefault();
              }
            }}
          />
        </div>
        {errorMessage ? (
          <Alert id="onboarding-pairing-error" variant="error">
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        ) : null}
        <Collapsible>
          <div className="flex items-center justify-between gap-3">
            <CollapsibleTrigger
              type="button"
              className="group flex items-center gap-1 text-control text-muted-foreground hover:text-foreground"
            >
              <ChevronRightIcon className="size-3.5 group-data-panel-open:rotate-90" />
              {t.account.onboarding.needPairingLink}
            </CollapsibleTrigger>
            <Button type="submit" disabled={isPairing || pairingUrl.trim().length === 0}>
              {isPairing ? t.account.onboarding.pairing : t.account.onboarding.pair}
            </Button>
          </div>
          <CollapsiblePanel>
            <p className="pt-3 text-control text-muted-foreground">
              {t.account.onboarding.runOnHost}
            </p>
            <CommandBlock command="npx t3 pair" className="mt-2" />
            <p className="mt-2 text-secondary-copy leading-relaxed text-muted-foreground">
              {t.account.onboarding.startCodePrefix}
              <code className="font-mono">npx t3 serve</code>
              {t.account.onboarding.addFlag} <code className="font-mono">--tailscale</code>
              {t.account.onboarding.tailnetSuffix}
            </p>
          </CollapsiblePanel>
        </Collapsible>
      </form>
    </>
  );
}

const PRIMARY_AGENT_DRIVERS = ["codex", "claudeAgent"] as const;
type OnboardingAgentDriver = (typeof PRIMARY_AGENT_DRIVERS)[number];

interface AgentTerminalSession {
  readonly environmentId: EnvironmentId;
  readonly driver: OnboardingAgentDriver;
  readonly providerInstanceId: ServerProvider["instanceId"];
  readonly cwd: string;
  readonly command: string;
  readonly keybindings: ServerConfig["keybindings"];
}

function AgentsStep({
  environmentIds,
  onBack,
  onContinue,
}: {
  readonly environmentIds: readonly EnvironmentId[];
  readonly onBack: () => void;
  readonly onContinue: () => void;
}) {
  const { environments } = useEnvironments();
  return (
    <StepShell
      title={t.account.onboarding.connectAgents}
      description={t.account.onboarding.agentsHint}
    >
      <ScrollArea scrollFade className="h-auto max-h-128">
        <div className="space-y-5 pr-3">
          {environmentIds.map((environmentId) => (
            <ConnectedAgentsStep
              key={environmentId}
              environmentId={environmentId}
              showMachineLabel={environmentIds.length > 1}
              machineLabel={
                environments.find((environment) => environment.environmentId === environmentId)
                  ?.label ?? t.account.onboarding.computer
              }
            />
          ))}
        </div>
      </ScrollArea>
      <div className="mt-5.5 flex justify-between gap-2">
        <Button size="onboarding" variant="ghost" onClick={onBack}>
          {t.account.onboarding.back}
        </Button>
        <Button size="onboarding" autoFocus onClick={onContinue}>
          {t.account.onboarding.next}
        </Button>
      </div>
    </StepShell>
  );
}

/** Renders agent readiness and setup terminals for the supplied environments; retains provider setup state and enforces terminal permissions. */
function ConnectedAgentsStep({
  environmentId,
  machineLabel,
  showMachineLabel,
}: {
  readonly environmentId: EnvironmentId;
  readonly machineLabel: string;
  readonly showMachineLabel: boolean;
}) {
  const providers = useAtomValue(serverEnvironment.providersValueAtom(environmentId));
  const refreshProviders = useAtomCommand(serverEnvironment.refreshProviders, {
    reportFailure: false,
  });
  const serverConfig = useAtomValue(serverEnvironment.configValueAtom(environmentId));
  const [terminalSession, setTerminalSession] = useState<AgentTerminalSession | null>(null);
  const [addingAccount, setAddingAccount] = useState(false);
  const [createdAccount, setCreatedAccount] = useState<{
    instanceId: ProviderInstanceId;
    displayName: string;
    autoStart: boolean;
  } | null>(null);
  const canOperateTerminal = useEnvironmentScope(environmentId, AuthTerminalOperateScope);

  useEffect(() => {
    void refreshProviders({ environmentId, input: {} });
  }, [environmentId, refreshProviders]);

  const byDriver = selectOnboardingProvidersByDriver(providers);

  const primaryAgents = PRIMARY_AGENT_DRIVERS.flatMap((driver) => {
    const instances =
      driver === "codex" ? providers?.filter((provider) => provider.driver === driver) : undefined;
    return instances?.length
      ? instances.map((provider) => ({ driver, provider, instanceId: provider.instanceId }))
      : [{ driver, provider: byDriver.get(driver), instanceId: byDriver.get(driver)?.instanceId }];
  });
  if (createdAccount) {
    const index = primaryAgents.findIndex(
      (agent) => agent.instanceId === createdAccount.instanceId,
    );
    const [existing] = index >= 0 ? primaryAgents.splice(index, 1) : [];
    primaryAgents.unshift(
      existing ?? {
        driver: "codex",
        provider: undefined,
        instanceId: createdAccount.instanceId,
      },
    );
  }
  return (
    <section>
      <h2 className={showMachineLabel ? "mb-2 text-control font-medium" : "sr-only"}>
        {machineLabel}
      </h2>
      {!canOperateTerminal ? (
        <p className="mb-2 text-control text-muted-foreground">
          {t.account.onboarding.noTerminalPermission}
        </p>
      ) : null}
      <div className="space-y-2">
        {primaryAgents.map(({ driver, provider, instanceId }) =>
          driver === "codex" && serverConfig !== null ? (
            <OnboardingCodexSetup
              key={instanceId ?? driver}
              environmentId={environmentId}
              provider={provider}
              serverConfig={serverConfig}
              createdAccount={instanceId === createdAccount?.instanceId ? createdAccount : null}
              onAutoStartConsumed={() =>
                setCreatedAccount((account) => (account ? { ...account, autoStart: false } : null))
              }
              terminalOpen={terminalSession?.driver === driver}
              onOpenTerminal={() => {
                if (
                  provider === undefined ||
                  !readEnvironmentScope(environmentId, AuthTerminalOperateScope)
                )
                  return;
                setTerminalSession({
                  environmentId,
                  driver,
                  providerInstanceId: provider.instanceId,
                  cwd: serverConfig.cwd,
                  command: provider.installed
                    ? resolveOnboardingProviderLoginCommand(
                        provider,
                        serverConfig.settings,
                        serverConfig.environment.platform.os,
                      )
                    : resolveOnboardingProviderInstallCommand(
                        driver,
                        serverConfig.environment.platform.os,
                      ),
                  keybindings: serverConfig.keybindings,
                });
              }}
            />
          ) : (
            <AgentCard
              key={driver}
              driver={ProviderDriverKind.make(driver)}
              provider={provider}
              terminalOpen={terminalSession?.driver === driver}
              terminalAvailable={serverConfig !== null && canOperateTerminal}
              onOpenTerminal={() => {
                if (
                  provider === undefined ||
                  serverConfig === null ||
                  !readEnvironmentScope(environmentId, AuthTerminalOperateScope)
                )
                  return;
                setTerminalSession({
                  environmentId,
                  driver,
                  providerInstanceId: provider.instanceId,
                  cwd: serverConfig.cwd,
                  command: provider.installed
                    ? resolveOnboardingProviderLoginCommand(
                        provider,
                        serverConfig.settings,
                        serverConfig.environment.platform.os,
                      )
                    : resolveOnboardingProviderInstallCommand(
                        driver,
                        serverConfig.environment.platform.os,
                      ),
                  keybindings: serverConfig.keybindings,
                });
              }}
            />
          ),
        )}
      </div>
      <div className="mt-2 space-y-2">
        {providers
          ?.filter((provider) => provider.driver !== "codex" && provider.driver !== "claudeAgent")
          .map((provider) => (
            <AgentCard
              key={provider.instanceId}
              driver={provider.driver}
              provider={provider}
              terminalOpen={false}
              terminalAvailable={false}
            />
          ))}
      </div>
      {providers?.some(
        (provider) =>
          provider.driver === "codex" && getOnboardingProviderState(provider) === "ready",
      ) ? (
        <div className="mt-3">
          <Button size="xs" variant="ghost-muted" onClick={() => setAddingAccount(true)}>
            {t.account.onboarding.anotherAccount}
          </Button>
        </div>
      ) : null}
      {addingAccount ? (
        <AddManagedCodexAccountDialog
          environmentId={environmentId}
          onClose={() => setAddingAccount(false)}
          onAccountCreated={(instanceId, displayName) =>
            setCreatedAccount({ instanceId, displayName, autoStart: true })
          }
        />
      ) : null}
      {terminalSession !== null ? (
        <AgentInstallTerminal
          key={`${terminalSession.environmentId}:${terminalSession.providerInstanceId}:${terminalSession.driver}`}
          session={terminalSession}
          onClose={() => {
            setTerminalSession(null);
            void refreshProviders({ environmentId, input: {} });
          }}
        />
      ) : null}
    </section>
  );
}

/** Preserves managed account setup and the explicitly selected CLI path for this provider instance. */
function OnboardingCodexSetup({
  createdAccount,
  onAutoStartConsumed,
  environmentId,
  provider,
  serverConfig,
  terminalOpen,
  onOpenTerminal,
}: {
  readonly environmentId: EnvironmentId;
  readonly provider: ServerProvider | undefined;
  readonly serverConfig: ServerConfig;
  readonly terminalOpen: boolean;
  readonly onOpenTerminal: () => void;
  readonly createdAccount: {
    instanceId: ProviderInstanceId;
    displayName: string;
    autoStart: boolean;
  } | null;
  readonly onAutoStartConsumed: () => void;
}) {
  const canOperateTerminal = useEnvironmentScope(environmentId, AuthTerminalOperateScope);
  const update = useAtomCommand(serverEnvironment.updateSettings, "Codex setup settings");
  const instanceId =
    createdAccount?.instanceId ??
    provider?.instanceId ??
    defaultInstanceIdForDriver(ProviderDriverKind.make("codex"));
  const settings = serverConfig.settings;
  const instance = settings.providerInstances[instanceId] ?? {
    driver: ProviderDriverKind.make("codex"),
    config: createdAccount ? { enabled: true, setupMode: "managed" } : {},
  };
  const mode = readCodexSetupMode(instance.config);
  const existingChosen =
    mode === "existing" &&
    instance.config !== null &&
    typeof instance.config === "object" &&
    "setupMode" in instance.config &&
    instance.config.setupMode === "existing";
  const changeMode = (setupMode: "managed" | "existing") => {
    void update({
      environmentId,
      input: {
        patch: buildProviderInstanceUpdatePatch({
          settings,
          instanceId,
          instance: {
            ...instance,
            enabled: true,
            config: {
              ...(instance.config !== null && typeof instance.config === "object"
                ? instance.config
                : {}),
              enabled: true,
              setupMode,
            },
          },
        }),
      },
    });
  };
  return existingChosen ? (
    <AgentCard
      driver={ProviderDriverKind.make("codex")}
      provider={provider}
      terminalOpen={terminalOpen}
      terminalAvailable={canOperateTerminal}
      onOpenTerminal={onOpenTerminal}
    />
  ) : (
    <CodexSetupSection
      presentation="onboarding"
      autoStart={createdAccount?.autoStart === true}
      displayName={createdAccount?.displayName}
      onAutoStartConsumed={onAutoStartConsumed}
      environmentId={environmentId}
      instanceId={instanceId}
      provider={provider}
      mode={mode}
      enabled={provider?.enabled ?? true}
      onModeChange={changeMode}
    />
  );
}

/** Renders the supplied provider's readiness and setup action; callbacks open installation/sign-in without changing driver IDs. */
function AgentCard({
  driver,
  provider,
  terminalOpen,
  terminalAvailable,
  onOpenTerminal,
}: {
  readonly driver: ServerProvider["driver"];
  readonly provider: ServerProvider | undefined;
  readonly terminalOpen: boolean;
  readonly terminalAvailable: boolean;
  readonly onOpenTerminal?: () => void;
}) {
  const meta = providerClients.get(ProviderDriverKind.make(driver));
  const displayName =
    provider?.displayName || (driver === "claudeAgent" ? "Claude Code" : (meta?.label ?? driver));
  const summary = getProviderSummary(provider);
  const providerState = getOnboardingProviderState(provider);

  return (
    <div className="flex min-h-13 items-center gap-3 rounded-card-row bg-ov5-row py-2 pr-2.5 pl-3 shadow-ov5-row">
      <span className="flex size-7.5 shrink-0 items-center justify-center rounded-full">
        {driver === "claudeAgent" || driver === "codex" ? (
          <PixelIcon name={driver === "claudeAgent" ? "claude" : "codex"} size={24} />
        ) : (
          <ProviderInstanceIcon
            driverKind={driver}
            displayName={displayName}
            iconClassName="size-5"
          />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <span className="block text-control font-medium text-foreground">{displayName}</span>
        <p
          className={
            providerState === "attention" ? "text-secondary-copy text-secondary-label" : "sr-only"
          }
        >
          {providerState === "ready" ? t.account.onboarding.readyToCode : summary.headline}
          {providerState !== "ready" && summary.detail ? ` · ${summary.detail}` : ""}
        </p>
      </div>
      <div className="shrink-0">
        {providerState === "ready" ? (
          <span className="inline-flex h-5.5 items-center gap-1.25 rounded-full bg-status-success px-2.25 text-secondary-copy font-semibold text-success-foreground">
            <CheckIcon className="size-3.5" />
            {t.account.onboarding.ready}
          </span>
        ) : providerState === "checking" ? (
          <span className="inline-flex h-5.5 items-center rounded-full px-2.25 text-secondary-copy font-semibold text-code-foreground">
            {t.account.onboarding.checking}
          </span>
        ) : providerState === "disabled" ? (
          <span className="text-secondary-copy text-muted-foreground">
            {t.account.onboarding.disabled}
          </span>
        ) : providerState === "attention" ? (
          <span className="text-secondary-copy text-muted-foreground">{summary.headline}</span>
        ) : (
          <Button size="md" onClick={onOpenTerminal} disabled={terminalOpen || !terminalAvailable}>
            <TerminalIcon className="size-3.5" />
            {providerState === "signIn"
              ? t.account.onboarding.signIn
              : t.account.onboarding.install}
          </Button>
        )}
      </div>
    </div>
  );
}

function AgentInstallTerminal({
  session,
  onClose,
}: {
  readonly session: AgentTerminalSession;
  readonly onClose: () => void;
}) {
  const { command, cwd, driver, environmentId, keybindings, providerInstanceId } = session;
  const canOperateTerminal = useEnvironmentScope(environmentId, AuthTerminalOperateScope);
  const [advancedTypography] = useLocalStorage(
    TYPOGRAPHY_ADVANCED_STORAGE_KEY,
    false,
    Schema.Boolean,
  );
  const openTerminal = useAtomCommand(terminalEnvironment.open, { reportFailure: false });
  const writeTerminal = useAtomCommand(terminalEnvironment.write, { reportFailure: false });
  const closeTerminal = useAtomCommand(terminalEnvironment.close, { reportFailure: false });
  const setupQueueRef = useRef(Promise.resolve());
  const setupGenerationRef = useRef(0);
  const activeSetupGenerationRef = useRef<number | null>(null);
  const [terminalId] = useState(() => `onboarding-${driver}-${randomUUID()}`);
  const threadRef = scopeThreadRef(environmentId, AGENT_ONBOARDING_THREAD_ID);
  const [setupAttempt, setSetupAttempt] = useState(0);
  const [setupState, setSetupState] = useState<
    "preparing" | "ready" | "openFailed" | "writeFailed"
  >("preparing");
  const terminalReady = setupState === "ready" || setupState === "writeFailed";

  // In Strict Mode, a canceled open can finish after the replacement setup
  // starts; it must not close or pre-type into the replacement session that
  // shares this terminal id.
  useEffect(() => {
    const generation = setupGenerationRef.current + 1;
    setupGenerationRef.current = generation;
    activeSetupGenerationRef.current = generation;
    // oxlint-disable-next-line react/set-state-in-effect -- A retry or a new command reopens the terminal, which shows as preparing until the open settles.
    setSetupState("preparing");

    setupQueueRef.current = setupQueueRef.current.then(async () => {
      if (activeSetupGenerationRef.current !== generation) return;
      if (!readEnvironmentScope(environmentId, AuthTerminalOperateScope)) {
        setSetupState("openFailed");
        return;
      }
      const opened = await openTerminal({
        environmentId,
        input: {
          threadId: AGENT_ONBOARDING_THREAD_ID,
          terminalId,
          cwd,
          providerInstanceId,
        },
      });
      if (opened._tag !== "Success") {
        if (activeSetupGenerationRef.current === generation) setSetupState("openFailed");
        return;
      }

      if (activeSetupGenerationRef.current !== generation) return;
      if (!readEnvironmentScope(environmentId, AuthTerminalOperateScope)) {
        setSetupState("writeFailed");
        return;
      }

      const wrote = await writeTerminal({
        environmentId,
        input: { threadId: AGENT_ONBOARDING_THREAD_ID, terminalId, data: command },
      });
      if (activeSetupGenerationRef.current !== generation) return;
      setSetupState(wrote._tag === "Success" ? "ready" : "writeFailed");
    });

    // Close the PTY only while this connection still has terminal access;
    // revocation leaves it running.
    return () => {
      if (activeSetupGenerationRef.current === generation) {
        activeSetupGenerationRef.current = null;
      }
      setupQueueRef.current = setupQueueRef.current.then(async () => {
        if (!readEnvironmentScope(environmentId, AuthTerminalOperateScope)) return;
        await closeTerminal({
          environmentId,
          input: { threadId: AGENT_ONBOARDING_THREAD_ID, terminalId, deleteHistory: true },
        });
      });
    };
  }, [
    closeTerminal,
    command,
    cwd,
    environmentId,
    openTerminal,
    providerInstanceId,
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- Retry bumps setupAttempt to open the terminal again.
    setupAttempt,
    terminalId,
    writeTerminal,
  ]);

  return (
    <div
      data-thread-terminal-drawer
      className="mt-3.5 overflow-hidden rounded-ov5-row bg-well-terminal px-3.5 py-2.5 text-code-foreground shadow-ov5-terminal"
    >
      <div className="flex items-center justify-between gap-2 pb-2">
        <span className="text-meta-large font-medium text-muted-foreground">
          {!canOperateTerminal ? (
            t.account.onboarding.noTerminalPermission
          ) : setupState === "writeFailed" ? (
            <>
              {t.account.onboarding.runPrefix}
              <code className="rounded bg-muted px-1 font-mono">{command}</code>
              {t.account.onboarding.terminalSuffix}
            </>
          ) : setupState === "ready" ? (
            t.account.onboarding.reviewCommand
          ) : setupState === "openFailed" ? (
            t.account.onboarding.terminalFailed
          ) : (
            t.account.onboarding.preparingCommand
          )}
        </span>
        <div className="flex items-center gap-1">
          {setupState === "openFailed" ? (
            <Button
              size="xs"
              variant="ghost"
              disabled={!canOperateTerminal}
              onClick={() => {
                if (readEnvironmentScope(environmentId, AuthTerminalOperateScope)) {
                  setSetupAttempt((value) => value + 1);
                }
              }}
            >
              {t.account.onboarding.retry}
            </Button>
          ) : null}
          <Button size="xs" variant="ghost-muted" onClick={onClose}>
            {t.account.onboarding.close}
          </Button>
        </div>
      </div>
      <div className="h-64">
        {terminalReady ? (
          <TerminalViewport
            threadRef={threadRef}
            threadId={AGENT_ONBOARDING_THREAD_ID}
            terminalId={terminalId}
            cwd={cwd}
            providerInstanceId={providerInstanceId}
            advancedTypography={advancedTypography}
            onSessionExited={onClose}
            focusRequestId={1}
            autoFocus
            visible
            resizeEpoch={0}
            drawerHeight={256}
            keybindings={keybindings}
          />
        ) : null}
      </div>
    </div>
  );
}

// ── Step 4: import ───────────────────────────────────────────

const IMPORT_PERMISSION_MESSAGE = t.account.onboarding.noImportPermission;

/** Scans the supplied environments, lets users select projects, and imports selected projects/history; reports partial failures before completing the wizard. */
function ImportStep({
  onBack,
  scans,
  isImporting,
  setIsImporting,
  onDone,
}: {
  readonly onBack: () => void;
  readonly scans: ReturnType<typeof useProjectScans>;
  readonly isImporting: boolean;
  readonly setIsImporting: (value: boolean) => void;
  readonly onDone: (
    projectRef?: ScopedProjectRef,
    importWarning?: string,
    importedThreadCount?: number,
  ) => Promise<boolean>;
}) {
  const { environments } = useEnvironments();
  const writableEnvironments = useEnvironmentsWithScope(scans, AuthOrchestrationOperateScope);
  const createProject = useAtomCommand(projectEnvironment.create, { reportFailure: false });
  const importThreads = useAtomCommand(agentSessionImport, { reportFailure: false });
  const projects = useProjects();
  const [selectedPaths, setSelectedPaths] = useState<ReadonlySet<string> | null>(null);
  const importWarningRef = useRef("");
  const importedThreadCountRef = useRef(0);
  const [landingProject, setLandingProject] = useState<ScopedProjectRef | null>(null);
  const importedProjectsRef = useRef(new Map<string, ScopedProjectRef>());
  const projectsWithImportedHistoryRef = useRef(new Map<string, ScopedProjectRef>());
  const lastImportSelectionRef = useRef<ReadonlyArray<string>>([]);
  const projectAttemptsRef = useRef(
    new Map<string, { readonly projectId: ProjectId; readonly commandId: CommandId }>(),
  );
  const importGenerationRef = useRef(0);

  useEffect(() => {
    importGenerationRef.current += 1;
    return () => {
      importGenerationRef.current += 1;
    };
  }, []);

  useEffect(() => {
    if (
      landingProject !== null &&
      projects.some(
        (project) =>
          project.id === landingProject.projectId &&
          project.environmentId === landingProject.environmentId,
      )
    ) {
      // oxlint-disable-next-line react/set-state-in-effect -- The landing project is known only once the projects subscription delivers it.
      setLandingProject(null);
      void onDone(landingProject, importWarningRef.current, importedThreadCountRef.current).then(
        (completed) => {
          if (!completed) setIsImporting(false);
        },
      );
    }
  }, [landingProject, onDone, projects, setIsImporting]);

  const { available: candidates, recent } = partitionOnboardingProjects(
    scans.flatMap((scan) =>
      (scan.data?.candidates ?? []).map((candidate) => ({
        ...candidate,
        environmentId: scan.environmentId,
        key: onboardingProjectKey(scan.environmentId, candidate.path),
      })),
    ),
  );
  const selectedKeys = selectedPaths ?? new Set(recent.map((candidate) => candidate.key));
  const selected = candidates.filter((candidate) => selectedKeys.has(candidate.key));

  const canImport = selected.every((candidate) =>
    writableEnvironments.has(candidate.environmentId),
  );
  const [importError, setImportError] = useState("");
  const visibleImportError = !canImport
    ? IMPORT_PERMISSION_MESSAGE
    : importError === IMPORT_PERMISSION_MESSAGE
      ? ""
      : importError;

  const finishAfterImport = () => {
    const projectRef = resolveOnboardingLandingProject(
      lastImportSelectionRef.current,
      projectsWithImportedHistoryRef.current,
      importedProjectsRef.current,
    );
    if (projectRef === undefined) {
      void onDone(undefined, importWarningRef.current, importedThreadCountRef.current);
      return;
    }
    setIsImporting(true);
    setLandingProject(projectRef);
  };

  const runImport = async (selection: typeof candidates) => {
    if (isImporting) return;
    const hasAccess = () =>
      selection.every((candidate) =>
        readEnvironmentScope(candidate.environmentId, AuthOrchestrationOperateScope),
      );
    const stopForDeniedAccess = () => {
      setIsImporting(false);
      setImportError(IMPORT_PERMISSION_MESSAGE);
    };
    if (!hasAccess()) {
      stopForDeniedAccess();
      return;
    }
    if (selection.length === 0) {
      void onDone();
      return;
    }
    setIsImporting(true);
    importWarningRef.current = "";
    importedThreadCountRef.current = 0;
    lastImportSelectionRef.current = selection.map((candidate) => candidate.key);
    const importGeneration = importGenerationRef.current;
    const importedProjects = importedProjectsRef.current;
    const projectAttempts = projectAttemptsRef.current;
    let importedProjectsCount =
      importedProjects.size > 0
        ? selection.filter((candidate) => importedProjects.has(candidate.key)).length
        : 0;
    let importedThreadCount = 0;
    let skippedThreadCount = 0;
    const refreshEnvironments = new Set<EnvironmentId>();
    for (const candidate of selection) {
      const { environmentId } = candidate;
      if (
        importGeneration !== importGenerationRef.current ||
        importedProjects !== importedProjectsRef.current
      ) {
        return;
      }
      if (!hasAccess()) {
        stopForDeniedAccess();
        return;
      }
      if (importedProjects.has(candidate.key)) continue;
      let projectId = resolveOnboardingProjectId(readProjects(), environmentId, candidate);
      if (projectId === null) {
        let attempt = projectAttempts.get(candidate.key);
        if (attempt === undefined) {
          const nextProjectId = newProjectId();
          attempt = {
            projectId: nextProjectId,
            commandId: CommandId.make(`onboarding:project:create:${nextProjectId}`),
          };
          projectAttempts.set(candidate.key, attempt);
        }
        projectId = attempt.projectId;
        const result = await createProject({
          environmentId,
          input: {
            projectId,
            commandId: attempt.commandId,
            title: candidate.title,
            workspaceRoot: candidate.path,
            createWorkspaceRootIfMissing: false,
            defaultModelSelection: null,
          },
        });
        if (
          importGeneration !== importGenerationRef.current ||
          importedProjects !== importedProjectsRef.current
        ) {
          return;
        }
        if (result._tag !== "Success") {
          if (!isAtomCommandInterrupted(result)) {
            projectAttempts.delete(candidate.key);
            refreshEnvironments.add(environmentId);
          }
          continue;
        }
      }

      if (!hasAccess()) {
        stopForDeniedAccess();
        return;
      }
      const threadImportResult = await importThreads({
        environmentId,
        input: { projectId, expectedWorkspaceRoot: candidate.path },
      });
      if (
        importGeneration !== importGenerationRef.current ||
        importedProjects !== importedProjectsRef.current
      ) {
        return;
      }
      if (threadImportResult._tag === "Success") {
        importedThreadCount += threadImportResult.value.importedCount;
        skippedThreadCount += threadImportResult.value.skippedCount;
        if (threadImportResult.value.importedCount > 0) {
          projectsWithImportedHistoryRef.current.set(
            candidate.key,
            scopeProjectRef(environmentId, projectId),
          );
        }
        if (threadImportResult.value.skippedCount === 0) {
          importedProjectsCount += 1;
          importedProjects.set(candidate.key, scopeProjectRef(environmentId, projectId));
        }
      } else if (!isAtomCommandInterrupted(threadImportResult)) {
        projectAttempts.delete(candidate.key);
        refreshEnvironments.add(environmentId);
      }
    }
    for (const scan of scans) {
      if (refreshEnvironments.has(scan.environmentId)) scan.refresh();
    }
    setIsImporting(false);
    importedThreadCountRef.current = importedThreadCount;
    if (importedProjectsCount < selection.length) {
      if (importedThreadCount > 0 && skippedThreadCount > 0) {
        importWarningRef.current = t.account.onboarding.partialThreadImport(
          importedThreadCount,
          skippedThreadCount,
        );
      } else if (skippedThreadCount > 0) {
        importWarningRef.current = t.account.onboarding.skippedThreads(skippedThreadCount);
      } else if (importedThreadCount > 0) {
        importWarningRef.current = t.account.onboarding.incompleteHistory(importedThreadCount);
      } else {
        importWarningRef.current = t.account.onboarding.historyFailed;
      }
    }
    finishAfterImport();
  };

  if (scans.every((scan) => scan.data === null) && scans.some((scan) => scan.isPending)) {
    return (
      <div className="flex h-full min-h-40 flex-col">
        <h1 className="sr-only">{t.account.onboarding.yourProjects}</h1>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-6">
          <Spinner size="lg" tone="muted" />
          <p className="text-center text-control text-muted-foreground">
            {t.account.onboarding.lookingForProjects}
          </p>
        </div>
        <div className="flex justify-end">
          <Button variant="ghost-muted" onClick={() => void onDone()}>
            {t.account.onboarding.dontImport}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <StepShell
      title={t.account.onboarding.chooseProjects}
      description={t.account.onboarding.importHint}
    >
      {candidates.length > 0 ? (
        <div className="flex items-center justify-between gap-2.5 px-1.5 pb-1 text-secondary-copy text-muted-foreground">
          <span role="status">{t.account.onboarding.foundProjects(candidates.length)}</span>
          <label className="order-first flex cursor-pointer items-center gap-2.5 text-control font-bold text-foreground">
            <Checkbox
              checked={selected.length === candidates.length}
              indeterminate={selected.length > 0 && selected.length < candidates.length}
              disabled={isImporting}
              onCheckedChange={(checked) =>
                setSelectedPaths(checked ? new Set(candidates.map((item) => item.key)) : new Set())
              }
            />
            {t.account.onboarding.selectAll}
          </label>
        </div>
      ) : null}
      <ScrollArea scrollFade className="mt-2 h-auto max-h-80">
        <div className="space-y-5 pr-3">
          {scans.map((scan) => {
            const scanCandidates = candidates.filter(
              (candidate) => candidate.environmentId === scan.environmentId,
            );
            const label =
              environments.find((environment) => environment.environmentId === scan.environmentId)
                ?.label ?? t.account.onboarding.computer;
            return (
              <fieldset
                key={scan.environmentId}
                className="min-w-0 space-y-1.5"
                disabled={isImporting}
              >
                {scans.length > 1 ? (
                  <legend className="mb-2 text-control font-medium">{label}</legend>
                ) : null}
                {scan.isPending && scan.data === null ? (
                  <div className="flex items-center gap-2 py-3 text-control text-muted-foreground">
                    <Spinner size="md" />
                    {t.account.onboarding.scanningProjects}
                  </div>
                ) : scan.error !== null ? (
                  <div
                    role="alert"
                    className="flex items-center justify-between gap-3 text-control text-muted-foreground"
                  >
                    <span>
                      {t.account.onboarding.checkProjectsFailed}
                      {scan.error}
                    </span>
                    <Button variant="ghost" size="sm" onClick={scan.refresh}>
                      {t.account.onboarding.retry}
                    </Button>
                  </div>
                ) : scanCandidates.length === 0 ? (
                  <p className="py-2 text-control text-muted-foreground">
                    {t.account.onboarding.noProjects}
                  </p>
                ) : null}
                {scan.data?.truncated ? (
                  <p className="text-secondary-copy text-muted-foreground" role="status">
                    {SCAN_LIMIT_MESSAGE}
                  </p>
                ) : null}
                <ImportCandidateList
                  candidates={scanCandidates}
                  selectedKeys={selectedKeys}
                  onSelectionChange={setSelectedPaths}
                />
              </fieldset>
            );
          })}
        </div>
      </ScrollArea>
      {visibleImportError ? (
        <p className="mt-3 text-control text-destructive">{visibleImportError}</p>
      ) : null}
      <div className="mt-5.5 flex flex-wrap items-center justify-end gap-2">
        <div className="mr-auto">
          <Button size="onboarding" variant="ghost" disabled={isImporting} onClick={onBack}>
            {t.account.onboarding.back}
          </Button>
        </div>
        <Button
          size="onboarding"
          variant="outline"
          disabled={isImporting}
          onClick={finishAfterImport}
        >
          {t.account.onboarding.dontImport}
        </Button>
        <Button
          size="onboarding"
          autoFocus
          disabled={!canImport || isImporting || selected.length === 0}
          onClick={() => void runImport(selected)}
        >
          {isImporting
            ? t.account.onboarding.importing
            : t.account.onboarding.importProjects(selected.length)}
        </Button>
      </div>
    </StepShell>
  );
}

type ImportCandidate = AgentSessionProjectCandidate & {
  readonly environmentId: EnvironmentId;
  readonly key: string;
};

function ImportCandidateList({
  candidates,
  selectedKeys,
  onSelectionChange,
}: {
  readonly candidates: ReadonlyArray<ImportCandidate>;
  readonly selectedKeys: ReadonlySet<string>;
  readonly onSelectionChange: (next: ReadonlySet<string>) => void;
}) {
  const { repositories, other } = groupOnboardingProjects(candidates);
  const setKeys = (keys: ReadonlyArray<string>, checked: boolean) => {
    const next = new Set(selectedKeys);
    for (const key of keys) {
      if (checked) next.add(key);
      else next.delete(key);
    }
    onSelectionChange(next);
  };
  const otherSelected = other.filter((candidate) => selectedKeys.has(candidate.key)).length;

  return (
    <>
      {repositories.map((group) => (
        <ImportRepositoryGroup
          key={group.key}
          group={group}
          selectedKeys={selectedKeys}
          onToggle={setKeys}
        />
      ))}
      {other.length > 0 ? (
        <Collapsible>
          <div className="flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-muted/40">
            <Checkbox
              checked={otherSelected === other.length}
              indeterminate={otherSelected > 0 && otherSelected < other.length}
              onCheckedChange={(checked) =>
                setKeys(
                  other.map((candidate) => candidate.key),
                  checked === true,
                )
              }
            />
            <CollapsibleTrigger className="group flex min-w-0 flex-1 items-center gap-1.5 text-left">
              <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-panel-open:rotate-90" />
              <span className="truncate text-control text-muted-foreground">
                {t.account.onboarding.otherFolders}
              </span>
              <span className="ml-auto shrink-0 text-secondary-copy text-muted-foreground tabular-nums">
                {other.length} {other.length === 1 ? "folder" : "folders"}
              </span>
            </CollapsibleTrigger>
          </div>
          <CollapsiblePanel>
            {other.map((candidate) => (
              <ImportCandidateRow
                key={candidate.key}
                candidate={candidate}
                path={candidate.path}
                nested
                checked={selectedKeys.has(candidate.key)}
                onCheckedChange={(checked) => setKeys([candidate.key], checked)}
              />
            ))}
          </CollapsiblePanel>
        </Collapsible>
      ) : null}
    </>
  );
}

/** Keeps repository clone groups selectable together and expanded independently. */
function ImportRepositoryGroup({
  group,
  selectedKeys,
  onToggle,
}: {
  readonly group: OnboardingProjectGroup<ImportCandidate>;
  readonly selectedKeys: ReadonlySet<string>;
  readonly onToggle: (keys: ReadonlyArray<string>, checked: boolean) => void;
}) {
  const keys = group.candidates.map((candidate) => candidate.key);
  const selectedCount = keys.filter((key) => selectedKeys.has(key)).length;
  const single = group.candidates.length === 1;
  const only = group.candidates[0];
  if (single && only !== undefined) {
    return (
      <ImportCandidateRow
        candidate={only}
        label={group.label}
        path={only.path}
        checked={selectedKeys.has(only.key)}
        onCheckedChange={(checked) => onToggle([only.key], checked)}
      />
    );
  }
  return (
    <Collapsible defaultOpen>
      <div className="flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-muted/40">
        <Checkbox
          checked={selectedCount === keys.length}
          indeterminate={selectedCount > 0 && selectedCount < keys.length}
          onCheckedChange={(checked) => onToggle(keys, checked === true)}
        />
        <CollapsibleTrigger className="group flex min-w-0 flex-1 items-center gap-1.5 text-left">
          <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-panel-open:rotate-90" />
          <span className="truncate text-control font-medium">{group.label}</span>
          <ImportRowMeta
            sources={[...new Set(group.candidates.flatMap((c) => c.sources))]}
            threadCount={group.threadCount}
            lastActiveAt={group.lastActiveAt}
          />
        </CollapsibleTrigger>
      </div>
      <CollapsiblePanel>
        {group.candidates.map((candidate) => (
          <ImportCandidateRow
            key={candidate.key}
            candidate={candidate}
            path={candidate.path}
            nested
            checked={selectedKeys.has(candidate.key)}
            onCheckedChange={(checked) => onToggle([candidate.key], checked)}
          />
        ))}
      </CollapsiblePanel>
    </Collapsible>
  );
}

function ProjectPathText({
  path,
  className,
}: {
  readonly path: string;
  readonly className?: string;
}) {
  const { name, parent } = splitOnboardingProjectPath(path);
  return (
    <span className={cn("flex min-w-0 items-baseline font-mono", className)}>
      {parent.length > 0 ? <span className="truncate">{parent}</span> : null}
      <span className="max-w-full shrink-0 truncate">{name}</span>
    </span>
  );
}

/** Displays one selectable project; path and source metadata retain the original import identity. */
function ImportCandidateRow({
  candidate,
  label,
  path,
  nested = false,
  checked,
  onCheckedChange,
}: {
  readonly candidate: ImportCandidate;
  readonly label?: string;
  readonly path?: string;
  readonly nested?: boolean;
  readonly checked: boolean;
  readonly onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label
      className={cn(
        "flex min-h-12.5 cursor-pointer items-center gap-2.5 rounded-ov5-row bg-ov5-row px-3 py-1.5 shadow-ov5-row hover:bg-secondary in-[fieldset:disabled]:cursor-default",
        nested && "pl-8",
      )}
    >
      <Checkbox checked={checked} onCheckedChange={(value) => onCheckedChange(value === true)} />
      <Tooltip>
        <TooltipTrigger render={<span className="flex min-w-0 flex-1 flex-col truncate" />}>
          {label !== undefined ? (
            <span className="truncate text-control font-medium">{label}</span>
          ) : null}
          {path !== undefined ? (
            <ProjectPathText
              path={path}
              className={
                label === undefined ? "text-secondary-copy" : "text-meta-large text-secondary-label"
              }
            />
          ) : null}
        </TooltipTrigger>
        <TooltipPopup variant="code">{candidate.path}</TooltipPopup>
      </Tooltip>
      <ImportRowMeta
        sources={nested ? null : candidate.sources}
        threadCount={candidate.threadCount}
        lastActiveAt={candidate.lastActiveAt}
      />
    </label>
  );
}

/**
 * Shows the real discovery sources; history count and age stay accessible without
 * adding columns absent from Q2. Repository clone grouping remains unchanged.
 */
function ImportRowMeta({
  sources,
  threadCount,
  lastActiveAt,
}: {
  readonly sources: ReadonlyArray<"claudeAgent" | "codex"> | null;
  readonly threadCount: number;
  readonly lastActiveAt: string | null;
}) {
  const relative = lastActiveAt === null ? null : formatRelativeTime(lastActiveAt);
  const age = relative === null ? "" : relative.suffix === null ? "now" : relative.value;
  return (
    <span className="ml-auto shrink-0 text-meta-large whitespace-nowrap text-muted-foreground">
      {sources?.map((source) => (source === "claudeAgent" ? "Claude Code" : "Codex")).join(" · ")}
      <span className="sr-only">
        {threadCount} · {age}
      </span>
    </span>
  );
}

// ── Shared bits ──────────────────────────────────────────────

/** Retains accessible step headings while the visible numbered header identifies the current stage. */
function StepShell({
  title,
  description,
  children,
}: {
  readonly title: string;
  readonly description?: string;
  readonly children?: React.ReactNode;
}) {
  return (
    <>
      <h1 className="sr-only">{title}</h1>
      {description ? <p className="sr-only">{description}</p> : null}
      {children}
    </>
  );
}
