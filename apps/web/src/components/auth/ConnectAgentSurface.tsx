/** Localized auth presentation and existing interaction behavior. */
import { t } from "~/i18n";
import {
  type AuthMcpApprovalDecision,
  type AuthMcpApprovalDetails,
  AuthMcpApprovalError,
  AuthMcpClientAccess,
  AuthMcpAuthorizationRequest,
} from "@t3tools/contracts";
import { Radio as RadioPrimitive } from "@base-ui/react/radio";
import { isLoopbackHost } from "@t3tools/shared/preview";
import { EyeIcon, type LucideIcon } from "lucide-react";
import type * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { type ReactNode, useEffect, useState } from "react";

import { PrimaryEnvironmentHttpClient } from "~/environments/primary/httpClient";
import { runPrimaryHttp } from "~/lib/runtime";
import { cn } from "~/lib/utils";
import { runtimeModeConfig } from "../chat/runtimeModeConfig";
import { Alert, AlertDescription } from "../ui/alert";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { RadioGroup } from "../ui/radio-group";
import { Spinner } from "../ui/spinner";
import { OnboardingPage } from "../onboarding/OnboardingSurface";

export const accessConfig: Record<
  AuthMcpClientAccess,
  { readonly label: string; readonly description: string; readonly icon: LucideIcon }
> = {
  "read-only": {
    label: t.account.auth.readOnly,
    description: t.account.auth.readOnlyHint,
    icon: EyeIcon,
  },
  ...runtimeModeConfig,
};

function redirectsToThisComputer(redirectHost: string): boolean {
  return isLoopbackHost(new URL(`http://${redirectHost}`).hostname);
}

type Loaded =
  | { readonly status: "loading" }
  | { readonly status: "invalid"; readonly message: string }
  | { readonly status: "ready"; readonly details: AuthMcpApprovalDetails };

const UNREACHABLE = t.account.auth.unreachable;
const isApprovalError = Schema.is(AuthMcpApprovalError);

type Answer<A> =
  | { readonly kind: "ok"; readonly value: A }
  | { readonly kind: "redirect"; readonly url: string }
  | { readonly kind: "error"; readonly message: string };

function runApproval<A>(
  call: (
    client: Context.Service.Shape<typeof PrimaryEnvironmentHttpClient>,
  ) => Effect.Effect<A | { readonly redirectTo: string }, unknown>,
): Promise<Answer<A>> {
  return runPrimaryHttp(
    PrimaryEnvironmentHttpClient.pipe(
      Effect.flatMap(call),
      Effect.map((value): Answer<A> =>
        typeof value === "object" && value !== null && "redirectTo" in value
          ? { kind: "redirect", url: value.redirectTo }
          : { kind: "ok", value: value as A },
      ),
      Effect.catch((error) =>
        Effect.succeed<Answer<A>>({
          kind: "error",
          message: isApprovalError(error) ? error.message : UNREACHABLE,
        }),
      ),
    ),
  ).catch((): Answer<A> => ({ kind: "error", message: UNREACHABLE }));
}

const decodeAuthorizationRequest = Schema.decodeSync(AuthMcpAuthorizationRequest);

/** Reads the approval request from the URL and wraps credential-bearing values as Redacted before they reach tracing. */
function readAuthorizationRequest(): AuthMcpAuthorizationRequest {
  return decodeAuthorizationRequest(Object.fromEntries(new URL(window.location.href).searchParams));
}

/** Sessions can grant only scopes they hold. */
function oneClickApproves(details: AuthMcpApprovalDetails, access: AuthMcpClientAccess) {
  return details.csrfToken !== undefined && (details.oneClickAccess ?? []).includes(access);
}

/** Loads the URL's agent authorization request and renders approve/deny controls; reports request failures in place without granting access automatically. */
export function ConnectAgentSurface() {
  const [authorization] = useState(readAuthorizationRequest);
  const [loaded, setLoaded] = useState<Loaded>({ status: "loading" });
  const [access, setAccess] = useState<AuthMcpClientAccess>("read-only");
  const [pairingCode, setPairingCode] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [pending, setPending] = useState<"approve" | "deny" | null>(null);

  useEffect(() => {
    let cancelled = false;
    void runApproval((client) => client.mcpOAuth.approval({ payload: authorization })).then(
      (answer) => {
        if (cancelled) return;
        if (answer.kind === "redirect") {
          window.location.replace(answer.url);
          return;
        }
        setLoaded(
          answer.kind === "error"
            ? { status: "invalid", message: answer.message }
            : { status: "ready", details: answer.value },
        );
      },
    );
    return () => {
      cancelled = true;
    };
  }, [authorization]);

  const decide = async (choice: "approve" | "deny") => {
    if (loaded.status !== "ready") return;
    setPending(choice);
    setErrorMessage("");
    const { csrfToken } = loaded.details;
    const decision: AuthMcpApprovalDecision =
      choice === "deny"
        ? { _tag: "deny" }
        : csrfToken !== undefined && oneClickApproves(loaded.details, access)
          ? { _tag: "browser-session", access, csrfToken }
          : { _tag: "pairing-code", access, code: pairingCode.trim() };
    const answer = await runApproval((client) =>
      client.mcpOAuth.decision({ payload: { authorization, decision } }),
    );
    if (answer.kind === "redirect") {
      window.location.replace(answer.url);
      return;
    }
    setPending(null);
    setErrorMessage(answer.kind === "error" ? answer.message : t.account.auth.signInFailed);
  };

  if (loaded.status === "loading") {
    return (
      <OnboardingPage>
        <ConnectAgentHeading
          title={t.account.auth.checkingRequest}
          description={t.account.auth.verifyingHint}
        />
        <Spinner className="mt-6" size="lg" tone="muted" />
      </OnboardingPage>
    );
  }

  if (loaded.status === "invalid") {
    return (
      <OnboardingPage>
        <ConnectAgentHeading title={t.account.auth.cannotContinue} description={loaded.message} />
        <p className="mt-4 text-control text-muted-foreground">{t.account.auth.restartSignIn}</p>
      </OnboardingPage>
    );
  }

  const { details } = loaded;
  const oneClick = oneClickApproves(details, access);
  const canApprove = pending === null && (oneClick || pairingCode.trim().length > 0);

  return (
    <OnboardingPage>
      <ConnectAgentHeading
        title={t.account.auth.connectClient(details.clientName)}
        description={
          <>
            {t.account.auth.agentWantsAccess}{" "}
            <span className="font-medium text-foreground">{details.environmentHost}</span>.
          </>
        }
      />
      <p className="text-secondary-copy text-secondary-label">
        {redirectsToThisComputer(details.redirectHost) ? (
          <>
            {t.account.auth.localApprovalPrefix}
            {details.redirectHost}
            {t.account.auth.localApprovalSuffix}
          </>
        ) : (
          <>
            {t.account.auth.remoteApprovalPrefix}{" "}
            <span className="font-medium text-foreground">{details.redirectHost}</span>
            {t.account.auth.remoteApprovalSuffix}
          </>
        )}
      </p>

      <form
        className="flex flex-col gap-3.5"
        onSubmit={(event) => {
          event.preventDefault();
          if (canApprove) void decide("approve");
        }}
      >
        {oneClick ? null : (
          <div className="space-y-2">
            <label
              className="text-secondary-copy-medium text-secondary-label"
              htmlFor="connect-agent-pairing-code"
            >
              {t.account.auth.pairingCode}
            </label>
            <Input
              size="lg"
              font="mono"
              id="connect-agent-pairing-code"
              autoCapitalize="none"
              autoComplete="one-time-code"
              autoCorrect="off"
              disabled={pending !== null}
              nativeInput
              onChange={(event) => setPairingCode(event.currentTarget.value)}
              placeholder={t.account.auth.pairingCodePlaceholder}
              spellCheck={false}
              value={pairingCode}
            />
            <p className="text-secondary-copy text-muted-foreground">
              {t.account.auth.createCodePrefix}
              <code>t3 auth pairing create</code>
              {t.account.auth.createCodeSuffix}
            </p>
          </div>
        )}

        <div className="space-y-2">
          <span id="connect-agent-access-label" className="sr-only">
            {t.account.auth.permissions}
          </span>
          <RadioGroup
            aria-labelledby="connect-agent-access-label"
            value={access}
            onValueChange={(value) => setAccess(value as AuthMcpClientAccess)}
          >
            {AuthMcpClientAccess.literals.map((option) => (
              <AccessOption key={option} access={option} selected={option === access} />
            ))}
          </RadioGroup>
          <p className="text-secondary-copy text-muted-foreground">
            {t.account.auth.permissionHint}
          </p>
        </div>

        {errorMessage ? (
          <Alert variant="error">
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-row-reverse flex-wrap gap-2">
          <Button size="dialog-action" disabled={!canApprove} type="submit">
            {pending === "approve" ? t.account.auth.approving : t.account.auth.approve}
          </Button>
          <Button
            size="dialog-action"
            disabled={pending !== null}
            onClick={() => void decide("deny")}
            type="button"
            variant="destructive-outline"
          >
            {pending === "deny" ? t.account.auth.denying : t.account.auth.deny}
          </Button>
        </div>
      </form>
    </OnboardingPage>
  );
}

/** Renders the supplied title, description and optional detail as the agent authorization heading; accepts React content for emphasized host names. */
function ConnectAgentHeading({
  title,
  description,
}: {
  readonly title: string;
  readonly description: ReactNode;
}) {
  return (
    <>
      <h1 className="font-serif text-ov5-connect-title font-bold">{t.account.auth.agentSignIn}</h1>
      <p className="text-control font-semibold">{title}</p>
      <p className="text-secondary-copy text-secondary-label">{description}</p>
    </>
  );
}

/** Displays the supplied access ceiling as a Q3 radio row; the parent retains the selected permission and approval checks. */
function AccessOption({
  access,
  selected,
}: {
  readonly access: AuthMcpClientAccess;
  readonly selected: boolean;
}) {
  const { label, description } = accessConfig[access];
  return (
    <RadioPrimitive.Root
      value={access}
      aria-label={label}
      className={cn(
        "flex min-h-10.5 cursor-pointer items-center gap-2.5 rounded-ov5-row px-3 py-2 text-left text-control outline-none focus-visible:inset-shadow-focus",
        selected
          ? "bg-accent text-foreground inset-shadow-selected-control"
          : "text-code-foreground hover:bg-secondary",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "flex size-3.5 shrink-0 items-center justify-center rounded-full",
          selected ? "bg-primary" : "shadow-outline-control",
        )}
      >
        {selected ? <span className="size-1.25 rounded-full bg-primary-foreground" /> : null}
      </span>
      <span>
        {label}
        <span className="sr-only">: {description}</span>
      </span>
    </RadioPrimitive.Root>
  );
}
