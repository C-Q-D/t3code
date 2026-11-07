# T3 Code 二次开发版

基于 [pingdotgg/t3code](https://github.com/pingdotgg/t3code) 的个人分支，只维护 Windows 桌面版。
上游的功能介绍、安装和开发说明见上游仓库；这里只列本分支相对上游的不同之处。

## 相比上游新增或改动

### 界面

- **石墨深色主题**：标题栏、侧栏、设置页、对话框、时间线、右侧面板和输入框整体重新设计，Provider 与子 Agent 图标换成像素角色。
- **弹簧物理动效**：输入框、文件拖动、模型选择器、推理强度弹出层和面板开合都用弹簧动画，开合时相邻内容逐帧跟随。
- **左侧项目栏与"今日"视图**：按项目筛选对话，一键进入今天活跃的对话；侧栏分"活跃 / 已完结"标签，支持拖放和多选批量操作。
- **用量页改版**：Claude、Codex 的用量、限额和费用分卡片展示；对话中实时显示上下文自动压缩阈值。
- **中英文界面**：在设置的常规页切换语言。

### 新功能

- **多 Agent 讨论**：多个 AI 角色（Claude、Codex）按轮次讨论同一议题，可以插话、停下、继续和总结，角色与模板可自定义。代理也可以在你同意后发起并主持讨论（实验）。见 [讨论](docs/user/discussions.md)。
- **输入框辅助**：输入框里显示建议文字，按 Tab 填入；可以一键优化草稿里的提示词。
- **网页**：把 DeepSeek、ChatGPT 等网站保存在 T3 Code 里直接使用，不用每次切到浏览器。见 [网页](docs/user/web-pages.md)。
- **会话导出**：把整条对话时间线导出为 Markdown 文件。
- **其他**：Claude 主线程正文流式显示；定时任务可选推理强度；文件右键可复制绝对路径和相对路径。

### 发布方式

- 只发布 Windows x64 安装包，不维护网页版和移动端。
- 安装包未做代码签名，不连接自动更新，不会被更新成上游官方版本。

## 下载与安装

1. 从 [Releases](https://github.com/C-Q-D/t3code/releases/latest) 下载 `T3-Code-<版本>-x64.exe`，双击安装。
2. Windows 弹出"Windows 已保护你的电脑"时，点击"更多信息"，再点击"仍要运行"。

使用前，本机至少安装并登录一个 AI 编程工具：

- Codex：安装 [Codex CLI](https://developers.openai.com/codex/cli)，然后运行 `codex login`
- Claude：安装 [Claude Code](https://claude.com/product/claude-code)，然后运行 `claude auth login`

## 本地构建

在仓库根目录运行 `build-windows.cmd`，安装包输出到 `release/windows-x64-<时间戳>/`。前提条件见 [Windows installer prerequisites](docs/operations/development.md#windows-installer-prerequisites)。

## 许可证

与上游相同，见 [LICENSE](LICENSE)。
