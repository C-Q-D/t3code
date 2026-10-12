@AGENTS.md

For local Windows packaging after code changes, use `build-windows.cmd`, or run
`powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/build-windows.ps1`
without a pause. Follow [Local Windows installer](AGENTS.md#local-windows-installer)
for output locations, architecture selection, and validation requirements.

## Fork surfaces

This checkout is the owner's personal fork: `origin` is C-Q-D/t3code and
`upstream` is pingdotgg/t3code. This section applies to `main` (tracking
`origin/main`) and to every branch or worktree cut from it. Upstream changes
arrive by merging `upstream/main` into `main`; keep this section when resolving
those merges.

The owner uses this fork alone, on the Windows desktop app, and signed off on
overriding the Clients and Multi-surface rules in AGENTS.md:

- New features only need the desktop surface. Do not build, adapt, or verify
  them for the browser-hosted web app (app.t3.codes, `npx t3`) or for mobile
  (`apps/mobile`), and leave mobile code untouched.
- Desktop renders `apps/web` inside Electron, so desktop UI changes still go in
  `apps/web`. A feature that also appears in a browser is fine; do not add code
  to hide it there.
- The other "Hit every surface" items (entry points, providers, agents,
  contracts, reverse states, docs) still apply.
