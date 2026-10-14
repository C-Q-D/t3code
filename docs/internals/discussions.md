# Discussions

A discussion is a server-driven loop over ordinary provider threads, one per seat, all launched in
the project's root checkout. [`DiscussionService`](../../apps/server/src/discussions/DiscussionService.ts)
dispatches one seat at a time and records each statement in its own transcript. Two decisions cross
the boundary between that service and the rest of the server, and neither is visible from the
discussion code alone.

## A statement's changes come from a cross-thread checkpoint pair

Seats share one working tree, so a seat thread's own turn diff is wrong for discussions. A turn
diff runs from the previous checkpoint in the same thread's scope, and
[`CheckpointService`](../../apps/server/src/orchestration-v2/CheckpointService.ts) captures a run's
baseline only when that ref does not exist yet. Seat A's diff for round n would therefore start at
the end of A's round n − 1 and include everything the other seats changed in between.

Each discussion entry instead stores the checkpoint ref captured when its run completed, and the
statement diff runs from the closest earlier statement or summary that has a ref to this entry's
ref, whichever seat thread produced either one. The first statement starts from the baseline of
seat one's first run, never a later seat's baseline, which is captured after seat one has already
changed files. Entries without a ref, such as a failed statement, are skipped, so the next diff
covers their changes too.

This is only correct because dispatch is sequential: the next seat is dispatched after the
previous run's capture has settled, so two snapshots never overlap. Anything else that writes to
the checkout between two statements, including the user's own edits, is attributed to the later
statement. Running seats concurrently, or giving seats separate worktrees, breaks this model.

## Personas travel as trusted developer context, gated by capability

A seat's persona prompt never appears in the material sent as the user message, and it is not a
thread setting. [`DiscussionDeveloperContext`](../../apps/server/src/discussions/DiscussionDeveloperContext.ts)
implements the [`ThreadDeveloperContext`](../../apps/server/src/orchestration-v2/ThreadDeveloperContext.ts)
port, which [`RunExecutionService`](../../apps/server/src/orchestration-v2/RunExecutionService.ts)
reads for every run and passes as `turnInput.developerContext`. Ordinary threads get an empty list.
The Claude adapter appends the entries to the system prompt on each turn; the Codex adapter sends
them as application `additionalContext`, where they win key collisions with untrusted MCP app
context. Because the identity is resolved and sent with every turn, a fresh provider session, a
resume, or a context handoff still carries it; nothing relies on the provider remembering it. The
persona is frozen in the seat when the discussion is created, so template edits only affect new
discussions.

The port lives in orchestration and the implementation reads `DiscussionStore` directly rather than
`DiscussionService`, which already depends on run execution; going through the service would create
a construction cycle.

An adapter that ignored `developerContext` would run a seat without its identity, and nothing would
fail. Discussions therefore admit only providers whose
`capabilities.context.acceptsDeveloperContext` is true: `discussions.create` rejects other seats with
`provider_unsupported`, and the new discussion page shows them as not supported. There is no provider
list in the discussion code. A provider becomes available for discussions by implementing
`developerContext` in its adapter and setting that capability.
