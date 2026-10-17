/** Localized cloud presentation and existing interaction behavior. */
import { t } from "~/i18n";
import { useAuth, useClerk } from "@clerk/react";
import { readConnectAuthorizeRequest } from "@t3tools/shared/connectAuth";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  buildConnectCliClerkAuthorizeUrl,
  connectCliSignInRedirectUrl,
} from "../../cloud/connectCliAuth";
import { isElectron } from "../../env";
import { OnboardingPage } from "../onboarding/OnboardingSurface";
import { HourglassIcon, SquareTerminalIcon } from "lucide-react";
import { resolveClerkSignInProps } from "../clerk/authRedirect";
import { Button } from "../ui/button";

/** Presents real authorization state in Q3’s centered terminal card; invalid links retain recovery guidance. */
function ConnectCliAuthMessage({
  waiting = false,
  title,
  description,
}: {
  readonly waiting?: boolean;
  readonly title: string;
  readonly description: string;
}) {
  return (
    <div className="flex flex-col items-center gap-3.5 py-2.5 text-center">
      <span className="flex size-12 items-center justify-center rounded-ov5-row bg-ov5-well shadow-well-pressed">
        <SquareTerminalIcon className="size-5.5" />
      </span>
      <h1 className="font-serif text-ov5-connect-title font-bold">{title}</h1>
      <p role="status" className="flex items-center gap-2 text-control text-secondary-label">
        {waiting ? <HourglassIcon className="size-3.5 shrink-0" /> : null}
        {description}
      </p>
    </div>
  );
}

const invalidLinkMessage = {
  title: t.account.cloud.incompleteConnectLink,
  description: t.account.cloud.missingAuthorization,
} as const;

/**
 * /connect: the URL the CLI prints for the loopback flow. Waits for a Clerk
 * session, then forwards the CLI's PKCE request to Clerk's authorize endpoint
 * with the loopback redirect URI so the code returns straight to the waiting
 * CLI. Headless hosts use Clerk's device authorization page instead.
 */
export function ConnectCliAuthorizeSurface() {
  const [request] = useState(() => readConnectAuthorizeRequest(new URL(window.location.href)));
  const clerk = useClerk();
  const { isLoaded, isSignedIn } = useAuth();
  const signInOpened = useRef(false);
  const redirecting = useRef(false);

  const openSignIn = useCallback(() => {
    if (!request) {
      return;
    }
    clerk.openSignIn(
      resolveClerkSignInProps(
        connectCliSignInRedirectUrl(request, window.location.href),
        isElectron,
      ),
    );
  }, [clerk, request]);

  useEffect(() => {
    if (!request || !isLoaded || redirecting.current) {
      return;
    }
    if (!isSignedIn) {
      if (!signInOpened.current) {
        signInOpened.current = true;
        openSignIn();
      }
      return;
    }
    const authorizeUrl = buildConnectCliClerkAuthorizeUrl(request);
    if (!authorizeUrl) {
      return;
    }
    redirecting.current = true;
    window.location.assign(authorizeUrl);
  }, [isLoaded, isSignedIn, openSignIn, request]);

  if (!request) {
    return (
      <OnboardingPage>
        <ConnectCliAuthMessage {...invalidLinkMessage} />
      </OnboardingPage>
    );
  }

  return (
    <OnboardingPage>
      <ConnectCliAuthMessage
        waiting
        title={t.account.cloud.browserAuthorization}
        description={t.account.cloud.connectingTerminal}
      />
      <p className="text-center text-secondary-copy text-secondary-label">
        {isSignedIn ? t.account.cloud.redirectingAuthorization : t.account.cloud.signInToAuthorize}
      </p>
      {isLoaded && !isSignedIn ? (
        <div className="flex justify-center">
          <Button size="dialog-action" type="button" onClick={openSignIn}>
            {t.account.cloud.signIn}
          </Button>
        </div>
      ) : null}
    </OnboardingPage>
  );
}
