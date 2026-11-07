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

## 推送与发布

本节是全局规则"Git"第 4、5 条（自动推送、自动打包发布）在本仓库的具体做法。

- 推送：把 `main` 推到 `origin/main`。推送前按 AGENTS.md"Verifying"跑
  `vp run check:changed`；未跟踪的 `设计稿/` 报出的格式与 lint 问题是旧账，不挡推送。
- 打包：推送内容有用户能感知的变化时，在 `main` 上跑
  `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/build-windows.ps1`，
  退出码为 0 且 `release/windows-x64-<时间戳>/` 里有 `T3-Code-<版本>-x64.exe` 才算成功。
- 发布：在 C-Q-D/t3code 用 `gh release create` 发新版本，tag 指向刚推送的提交，设为 Latest，旧版本保留。
  - 版本号取 `apps/desktop/package.json` 的 `version`。tag 为 `chen-v<版本>`；同一版本已发布过时依次加 `-2`、`-3`。
  - 标题：`T3 Code 二次开发版 <tag 去掉 chen-v>（Windows x64）`。
  - 说明用中文，依次写：基于上游的一句和构建所用的提交短哈希、"本版新增"（这次相对上一版新增的用户可见变化）、"主要改动"、"试用前提"（安装并登录 Codex 或 Claude）、"安装"（安装包未签名时的放行步骤）、最后一句"此版本不连接自动更新，不会被更新成上游官方版本"。
- README：发布的版本带来新功能时，同步更新 `README.md`"相比上游"一节。README 只写本分支相对上游的不同之处。
