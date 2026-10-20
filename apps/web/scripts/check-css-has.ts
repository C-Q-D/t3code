/** Fail production builds when generated CSS contains relational selectors; optionally inspect another assets directory. */
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

/**
 * Check CSS files directly inside assetsDir (default: this web app's dist/assets).
 * Print per-file counts and up to three bounded selector excerpts; return false for forbidden or missing CSS.
 * Filesystem failures propagate to the CLI so unreadable output cannot pass the build.
 */
function checkCssAssets(assetsDir: string): boolean {
  const files = NodeFS.readdirSync(assetsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".css"))
    .map((entry) => entry.name)
    .sort();
  if (files.length === 0) {
    console.error(`[check-css-has] No CSS assets found in ${assetsDir}`);
    return false;
  }
  let clean = true;
  for (const file of files) {
    const filePath = NodePath.join(assetsDir, file);
    const css = NodeFS.readFileSync(filePath, "utf8");
    const matches = [...css.matchAll(/:has\(/giu)];
    if (matches.length === 0) continue;
    clean = false;
    console.error(
      `[check-css-has] ${filePath}: ${matches.length} forbidden relational selector occurrence(s)`,
    );
    for (const match of matches.slice(0, 3)) {
      const previousBoundary = Math.max(
        css.lastIndexOf("}", match.index),
        css.lastIndexOf("{", match.index),
      );
      const nextBoundary = css.indexOf("{", match.index);
      const start = Math.max(previousBoundary + 1, match.index - 120);
      const end = Math.min(nextBoundary === -1 ? css.length : nextBoundary, match.index + 160);
      console.error(`  ${css.slice(start, end).trim()}`);
    }
  }
  if (clean)
    console.log(`[check-css-has] Checked ${files.length} CSS asset(s): no relational selectors.`);
  return clean;
}

try {
  const assetsDir = process.argv[2]
    ? NodePath.resolve(process.argv[2])
    : NodeURL.fileURLToPath(new URL("../dist/assets/", import.meta.url));
  if (!checkCssAssets(assetsDir)) process.exitCode = 1;
} catch (error) {
  console.error("[check-css-has] Cannot inspect CSS assets:", error);
  process.exitCode = 1;
}
