import { t } from "~/i18n";
import { ACP_REGISTRY_MAX_AGENTS, AuthProvidersManageScope } from "@t3tools/contracts";
import { readEnvironmentScope, useEnvironmentScope } from "../../state/session";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type {
  AcpRegistryPrepareResult,
  AcpRegistrySearchAgent,
  EnvironmentId,
  ProviderInstanceConfig,
} from "@t3tools/contracts";
import { ExternalLinkIcon, SearchIcon } from "lucide-react";
import { type FormEvent, useEffect, useLayoutEffect, useRef, useState } from "react";

import { serverEnvironment } from "../../state/server";
import { useEnvironmentQuery } from "../../state/query";
import { useAtomCommand } from "../../state/use-atom-command";
import { Alert, AlertDescription } from "../ui/alert";
import { Button } from "../ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "../ui/input-group";
import { ScrollArea } from "../ui/scroll-area";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { isConfiguredAcpRegistryAgent } from "./AddProviderInstanceDialog.logic";
import { ProviderDriverKind } from "@t3tools/contracts";
import { ProviderInstanceIcon } from "../chat/ProviderInstanceIcon";

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message.trim()
    ? error.message
    : t.settings.acpRegistrySearchStep.theAcpCouldNotBePrepared;
}

interface AcpRegistrySearchStepProps {
  readonly environmentId: EnvironmentId;
  readonly providerInstances: Readonly<Record<string, ProviderInstanceConfig>>;
  readonly onPrepared: (agent: AcpRegistrySearchAgent) => void;
  readonly onManualConfiguration: () => void;
  readonly onLocalConfiguration?: () => void;
  readonly onLoadingChange?: (loading: boolean) => void;
  readonly onPreparingChange?: (preparing: boolean) => void;
}

function applyAcpRegistryPrepareResult(
  agent: AcpRegistrySearchAgent,
  prepared: AcpRegistryPrepareResult,
): AcpRegistrySearchAgent {
  return {
    ...agent,
    id: prepared.agentId,
    version: prepared.version,
    distribution: prepared.distribution,
  };
}

/**
 * Debounces registry lookup and discards obsolete preparation results when the target changes.
 * @param props.environmentId Registry query and preparation destination.
 * @param props.providerInstances Existing configurations used to prevent duplicate additions.
 * @param props.onPrepared Receives a successfully prepared provider config.
 * @param props.onManualConfiguration Opens manual setup.
 * @param props.onLocalConfiguration Optional local-command setup action.
 * @param props.onLoadingChange Optional query-progress notification.
 * @param props.onPreparingChange Optional preparation-lock notification.
 * @returns Search/results UI. The query is capped at ACP_REGISTRY_MAX_AGENTS; command helpers own transport timeouts and preparation is not retried here.
 */
export function AcpRegistrySearchStep({
  environmentId,
  providerInstances,
  onPrepared,
  onManualConfiguration,
  onLocalConfiguration,
  onLoadingChange,
  onPreparingChange,
}: AcpRegistrySearchStepProps) {
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const canManageProviders = useEnvironmentScope(environmentId, AuthProvidersManageScope);
  const [preparingId, setPreparingId] = useState<string | null>(null);
  const [prepareError, setPrepareError] = useState<string | null>(null);
  const prepareGeneration = useRef(0);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const search = useEnvironmentQuery(
    serverEnvironment.searchAcpRegistry({
      environmentId,
      input: submittedQuery
        ? { query: submittedQuery }
        : { query: "", limit: ACP_REGISTRY_MAX_AGENTS },
    }),
  );
  const prepareAgent = useAtomCommand(serverEnvironment.prepareAcpRegistryAgent, {
    reportFailure: false,
  });

  useEffect(
    () => () => {
      prepareGeneration.current += 1;
      if (searchTimer.current !== null) clearTimeout(searchTimer.current);
      onPreparingChange?.(false);
    },
    [onPreparingChange],
  );

  const submitSearch = (nextQuery: string) => {
    if (searchTimer.current !== null) clearTimeout(searchTimer.current);
    const trimmed = nextQuery.trim();
    setQuery(trimmed);
    setPrepareError(null);
    if (trimmed === submittedQuery) {
      search.refresh();
    } else {
      setSubmittedQuery(trimmed);
    }
  };

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submitSearch(query);
  };

  const handlePrepare = async (agent: AcpRegistrySearchAgent) => {
    if (!readEnvironmentScope(environmentId, AuthProvidersManageScope)) return;
    const generation = ++prepareGeneration.current;
    setPrepareError(null);
    setPreparingId(agent.id);
    onPreparingChange?.(true);
    const result = await prepareAgent({ environmentId, input: { agentId: agent.id } });
    if (prepareGeneration.current !== generation) return;
    setPreparingId(null);
    onPreparingChange?.(false);
    if (result._tag === "Success") {
      onPrepared(applyAcpRegistryPrepareResult(agent, result.value));
      return;
    }
    if (!isAtomCommandInterrupted(result)) {
      setPrepareError(errorMessage(squashAtomCommandFailure(result)));
    }
  };

  const results = search.data?.agents ?? null;
  const isInitialSearch = search.isPending && results === null;
  const isRefreshing = search.isPending && results !== null;
  const resultCount = results?.length ?? 0;

  useLayoutEffect(() => {
    onLoadingChange?.(search.isPending);
    return () => onLoadingChange?.(false);
  }, [onLoadingChange, search.isPending]);

  return (
    <section className="grid gap-3" aria-labelledby="acp-registry-search-heading">
      <h3 className="sr-only" id="acp-registry-search-heading">
        {t.settings.acpRegistrySearchStep.chooseAnAgent}
      </h3>

      <form className="flex flex-wrap items-center gap-2" onSubmit={handleSearch}>
        <InputGroup className="min-w-40 flex-1">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            aria-label={t.settings.acpRegistrySearchStep.searchAcpRegistry}
            disabled={preparingId !== null}
            onChange={(event) => {
              const nextQuery = event.currentTarget.value;
              setQuery(nextQuery);
              setPrepareError(null);
              if (searchTimer.current !== null) clearTimeout(searchTimer.current);
              searchTimer.current = setTimeout(() => {
                searchTimer.current = null;
                setSubmittedQuery(nextQuery.trim());
              }, 300);
            }}
            placeholder={t.settings.acpRegistrySearchStep.searchAgents}
            size="sm"
            type="search"
            value={query}
          />
        </InputGroup>
        <Button
          disabled={preparingId !== null}
          onClick={onManualConfiguration}
          size="sm"
          type="button"
          variant="ghost-muted"
        >
          {t.settings.acpRegistrySearchStep.enterManually}
        </Button>
        {onLocalConfiguration ? (
          <Button
            disabled={preparingId !== null}
            onClick={onLocalConfiguration}
            size="sm"
            type="button"
            variant="outline"
          >
            {t.settings.acpRegistrySearchStep.localAcpCommand}
          </Button>
        ) : null}
      </form>

      <div className="sr-only" role="status">
        {isInitialSearch
          ? t.settings.acpRegistrySearchStep.searchingTheAcpRegistry
          : isRefreshing
            ? t.settings.acpRegistrySearchStep.refreshingAcpRegistryResults
            : results
              ? t.settings.acpRegistrySearchStep.compatibleFound(
                  resultCount,
                  Boolean(resultCount === 1),
                )
              : ""}
      </div>

      {search.error || prepareError ? (
        <Alert variant="error" role="status" aria-live="polite">
          <AlertDescription>{prepareError ?? search.error}</AlertDescription>
        </Alert>
      ) : null}

      {isInitialSearch ? (
        <div className="flex min-h-20 items-center justify-center text-sm text-muted-foreground">
          {t.settings.acpRegistrySearchStep.searchingTheRegistry}
        </div>
      ) : null}

      {results ? (
        results.length === 0 ? (
          <div className="flex min-h-28 flex-col items-center justify-center rounded-2xl border border-dashed px-4 text-center">
            <p className="text-sm font-medium">
              {t.settings.acpRegistrySearchStep.noCompatibleAgentsFound}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t.settings.acpRegistrySearchStep.tryABroaderSearch}
            </p>
          </div>
        ) : (
          <ScrollArea scrollFade className="max-h-64">
            <div className="pr-2.5">
              {results.map((agent) => (
                <AcpRegistryAgentRow
                  key={agent.id}
                  agent={agent}
                  alreadyAdded={isConfiguredAcpRegistryAgent(providerInstances, agent.id)}
                  canAdd={canManageProviders && preparingId === null}
                  isPreparing={preparingId === agent.id}
                  onAdd={handlePrepare}
                />
              ))}{" "}
            </div>
          </ScrollArea>
        )
      ) : null}
    </section>
  );
}

/**
 * Keeps unchanged registry results behind a compiler cache boundary while the search input changes.
 * @param props.agent The server result; its identity stays stable until results refresh.
 * @param props.alreadyAdded Whether this agent already has a configured instance.
 * @param props.canAdd Whether permissions and the shared preparation lock allow adding it.
 * @param props.isPreparing Whether this row owns the current preparation request.
 * @param props.onAdd The parent's compiler-stable preparation action; this row owns no request state.
 * @returns One localized result row with the existing Graphite controls.
 */
function AcpRegistryAgentRow({
  agent,
  alreadyAdded,
  canAdd,
  isPreparing,
  onAdd,
}: {
  readonly agent: AcpRegistrySearchAgent;
  readonly alreadyAdded: boolean;
  readonly canAdd: boolean;
  readonly isPreparing: boolean;
  readonly onAdd: (agent: AcpRegistrySearchAgent) => void;
}) {
  const progressLabel =
    agent.distribution === "binary"
      ? t.settings.acpRegistrySearchStep.downloading
      : t.settings.acpRegistrySearchStep.preparing;
  return (
    <article className="min-w-0 py-2.5">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <ProviderInstanceIcon
            driverKind={ProviderDriverKind.make("acpRegistry")}
            displayName={agent.name}
            acpRegistryAgentId={agent.id}
            acpRegistryIconUrl={agent.icon ?? undefined}
            iconClassName="size-6 rounded-md text-muted-foreground"
          />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-baseline gap-2">
              <h4 className="min-w-0 truncate text-sm font-medium text-foreground">{agent.name}</h4>
            </div>
            {agent.description ? (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{agent.description}</p>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {agent.website || agent.repository ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    size="icon-xs"
                    variant="ghost-muted"
                    aria-label={t.settings.acpRegistrySearchStep.about(agent.name)}
                    render={
                      <a
                        href={agent.website || agent.repository || undefined}
                        target="_blank"
                        rel="noreferrer"
                      />
                    }
                  >
                    <ExternalLinkIcon />
                  </Button>
                }
              />
              <TooltipPopup>{t.settings.acpRegistrySearchStep.about(agent.name)}</TooltipPopup>
            </Tooltip>
          ) : null}
          <Button
            aria-label={t.settings.acpRegistrySearchStep.agentActionAriaLabel(
              Boolean(alreadyAdded),
              !alreadyAdded ? Boolean(isPreparing) : false,
              !alreadyAdded && isPreparing ? progressLabel : undefined,
              agent.name,
            )}
            disabled={!canAdd || alreadyAdded}
            onClick={() => onAdd(agent)}
            size="xs"
            variant={isPreparing ? "secondary" : "outline"}
          >
            {alreadyAdded
              ? t.settings.acpRegistrySearchStep.added
              : isPreparing
                ? progressLabel
                : t.settings.acpRegistrySearchStep.add}
          </Button>
        </div>
      </div>
    </article>
  );
}
