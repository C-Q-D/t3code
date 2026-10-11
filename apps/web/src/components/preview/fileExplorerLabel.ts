/** Localized preview UI and interactions; preserves user data, commands, and protocol values. */
import { t } from "~/i18n";
import type { ExecutionEnvironmentPlatformOs, FileManagerRevealKind } from "@t3tools/contracts";

/**
 * Returns the localized reveal action for the platform, falling back to Files.
 * @param platform Original platform identifier used to select UI guidance.
 * @returns The value described above, without changing user data or protocol identifiers.
 */
export function revealInFileExplorerLabel(platform: string): string {
  const normalized = platform.toLowerCase();
  if (normalized.includes("mac")) return t.tools.preview.revealFinder;
  if (normalized.includes("win")) return t.tools.preview.revealExplorer;
  return t.tools.preview.revealFiles;
}

/** Same wording keyed by an environment's reported OS rather than a
    navigator platform string, for actions that reveal on the server machine.
 * @param os Execution environment OS discriminator.
 * @returns The value described above, without changing user data or protocol identifiers.
 */
export function revealInFileExplorerLabelForOs(os: ExecutionEnvironmentPlatformOs): string {
  if (os === "darwin") return t.tools.preview.revealFinder;
  if (os === "windows") return t.tools.preview.revealExplorer;
  return t.tools.preview.revealFiles;
}

/** Server-selected wording, including Windows File Explorer reached from WSL.
 * @param kind Original file manager discriminator.
 * @returns The value described above, without changing user data or protocol identifiers.
 */
export function revealInFileExplorerLabelForKind(kind: FileManagerRevealKind): string {
  if (kind === "finder") return t.tools.preview.revealFinder;
  if (kind === "file-explorer") return t.tools.preview.revealExplorer;
  return t.tools.preview.revealFiles;
}
