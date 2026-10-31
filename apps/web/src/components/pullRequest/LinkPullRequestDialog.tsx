import { sourceControlClients } from "@t3tools/client-runtime/source-control-clients";
import type { ScopedThreadRef } from "@t3tools/contracts";
import {
  parsePullRequestReference,
  pullRequestLinkProject,
} from "@t3tools/client-runtime/pull-request-link-input";
import { useAtomValue } from "@effect/atom-react";
import { settlePromise, squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { useRef, useState } from "react";
import { t } from "~/i18n";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";

import { useProjects, useThreadShell } from "~/state/entities";
import { usePullRequestLinking } from "~/hooks/usePullRequestLinking";
import { appAtomRegistry } from "~/rpc/atomRegistry";
import { Atom } from "effect/reactivity";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogBackdrop,
  DialogDescription,
  DialogPortal,
  DialogViewport,
} from "../ui/dialog";
import { Input } from "../ui/input";

// Host in chat to survive command palette dismissal.
const linkPullRequestDialogThreadAtom = Atom.make<ScopedThreadRef | null>(null).pipe(
  Atom.keepAlive,
  Atom.withLabel("pull-requests:link-dialog-thread"),
);

export function openLinkPullRequestDialog(threadRef: ScopedThreadRef): void {
  appAtomRegistry.set(linkPullRequestDialogThreadAtom, threadRef);
}

interface LinkPullRequestDialogProps {
  open: boolean;
  threadRef: ScopedThreadRef;
  projectId: string | null;
  onOpenChange: (open: boolean) => void;
}

export function LinkPullRequestDialogHost() {
  const threadRef = useAtomValue(linkPullRequestDialogThreadAtom);
  const thread = useThreadShell(threadRef);
  const linking = usePullRequestLinking(threadRef?.environmentId);
  if (threadRef === null || linking.mode === "unsupported") return null;
  return (
    <LinkPullRequestDialog
      open
      threadRef={threadRef}
      projectId={thread?.projectId ?? null}
      onOpenChange={(open) => {
        if (!open) appAtomRegistry.set(linkPullRequestDialogThreadAtom, null);
      }}
    />
  );
}

interface ResolvedLink {
  readonly host: string;
  readonly repository: string;
  readonly number: number;
  readonly url: string;
}

/**
 * Which pull request an input names, or why it cannot. A URL carries its own host and
 * repository; a bare `#123` can only mean the thread's own repository.
 */
export function resolveLinkPullRequestInput(input: {
  readonly reference: string;
  readonly project: {
    readonly host: string;
    readonly repository: string;
    readonly webUrl: (number: number) => string | null;
  } | null;
  readonly hasProject: (reference: ResolvedLink) => boolean;
}): { link: ResolvedLink } | { error: string } | null {
  const parsed =
    sourceControlClients.parseChangeRequestUrl(input.reference.trim()) !== null
      ? input.reference.trim()
      : parsePullRequestReference(input.reference);
  if (parsed === null) return null;
  const url = sourceControlClients.parseChangeRequestUrl(parsed)?.link ?? null;
  if (url !== null) {
    if (!input.hasProject({ ...url, url: parsed })) {
      return { error: t.git.pullRequest.noReadableProject(url.host, url.repository) };
    }
    return {
      link: { host: url.host, repository: url.repository, number: url.number, url: parsed },
    };
  }
  const number = Number(parsed);
  if (!Number.isSafeInteger(number) || number < 1) return null;
  if (input.project === null) {
    return { error: t.git.pullRequest.pasteAFullURLToLinkAPullRequestFromAnotherRepository };
  }
  const webUrl = input.project.webUrl(number);
  const webReference =
    webUrl === null ? null : (sourceControlClients.parseChangeRequestUrl(webUrl)?.link ?? null);
  if (webUrl === null || webReference === null) {
    return { error: t.git.pullRequest.pasteAFullURLThisProjectSHostHasNoKnownPullRequestURL };
  }
  return {
    link: { ...webReference, url: webUrl },
  };
}

/**
 * Renders link pull request dialog from the supplied display data and callbacks.
 * @param props Display data, state, options, and interaction callbacks defined by this surface's props type.
 * @returns The rendered surface.
 */
function LinkPullRequestDialog({
  open,
  threadRef,
  projectId,
  onOpenChange,
}: LinkPullRequestDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [reference, setReference] = useState("");
  const [dirty, setDirty] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const projects = useProjects();
  const ownProject = pullRequestLinkProject(
    projects.find(
      (project) => project.environmentId === threadRef.environmentId && project.id === projectId,
    )?.repositoryIdentity,
  );
  const linking = usePullRequestLinking(threadRef.environmentId);
  const [pending, setPending] = useState(false);

  const [openSeen, setOpenSeen] = useState(open);
  if (openSeen !== open) {
    setOpenSeen(open);
    if (open) {
      setReference("");
      setDirty(false);
      setSubmitError(null);
    }
  }

  const resolved = resolveLinkPullRequestInput({
    reference,
    project: ownProject,
    hasProject: (reference) => linking.canLink(reference.url),
  });

  const submit = async () => {
    setDirty(true);
    if (resolved === null || "error" in resolved) return;
    setSubmitError(null);
    setPending(true);
    const result = await settlePromise(() =>
      linking.changeLink(threadRef, resolved.link.url, true),
    );
    setPending(false);
    if (result._tag === "Failure") {
      const error = squashAtomCommandFailure(result);
      setSubmitError(
        error instanceof Error ? error.message : t.git.pullRequest.couldNotLinkThePullRequest,
      );
      return;
    }
    onOpenChange(false);
  };

  const validation = !dirty
    ? null
    : reference.trim().length === 0
      ? t.git.pullRequest.pasteAPullRequestURLOrEnter123123
      : resolved === null
        ? t.git.pullRequest.applyAPullRequestURL123Or123
        : "error" in resolved
          ? resolved.error
          : null;

  return (
    <Dialog open={open} onOpenChange={(next) => (pending ? undefined : onOpenChange(next))}>
      <DialogPortal>
        <DialogBackdrop />
        <DialogViewport>
          {/* L6's compact shell belongs to linking; Base UI retains the existing modal/focus behavior. */}
          <DialogPrimitive.Popup
            initialFocus={inputRef}
            className="dialog-glass pr-popup relative row-start-2 flex min-h-0 max-h-full w-43/50 max-w-95 flex-col gap-3 rounded-pr-link-dialog p-4.5 outline-none"
          >
            <DialogPrimitive.Title className="shrink-0 font-serif text-pr-link-title font-bold">
              {t.git.pullRequest.linkPullRequest}
            </DialogPrimitive.Title>
            <DialogDescription className="sr-only">
              {t.git.pullRequest.attachByUrlOrNumber}
            </DialogDescription>
            <div className="flex min-h-0 min-w-0 flex-col gap-3 overflow-y-auto">
              <Input
                ref={inputRef}
                aria-label={t.git.pullRequest.pullRequestURLOr42}
                aria-invalid={validation !== null || submitError !== null}
                placeholder={t.git.pullRequest.pullRequestURLOr42}
                value={reference}
                onChange={(event) => {
                  setDirty(true);
                  setReference(event.target.value);
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  void submit();
                }}
              />
              {resolved !== null && "link" in resolved ? (
                <p className="truncate text-muted-foreground text-secondary-copy">
                  {resolved.link.host}/{resolved.link.repository} #{resolved.link.number}
                </p>
              ) : null}
              {(validation ?? submitError) ? (
                <p role="alert" className="break-words text-error-foreground text-secondary-copy">
                  {validation ?? submitError}
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="default"
                onClick={() => onOpenChange(false)}
                disabled={pending}
              >
                {t.common.confirm.cancel}
              </Button>
              <Button
                type="button"
                size="default"
                onClick={() => void submit()}
                disabled={pending || resolved === null || "error" in resolved}
              >
                {pending ? t.git.pullRequest.linking : t.git.pullRequest.linkPullRequest}
              </Button>
            </div>
          </DialogPrimitive.Popup>
        </DialogViewport>
      </DialogPortal>
    </Dialog>
  );
}
