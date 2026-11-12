import * as NodeFS from "node:fs";
import * as NodeModule from "node:module";
import * as NodeURL from "node:url";

const root = new URL("../../../../", import.meta.url);
const moduleUrl = (source) =>
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;

NodeModule.registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "~/i18n")
      return { url: moduleUrl("export const t = {tools:{terminal:{}}};"), shortCircuit: true };
    if (specifier === "@t3tools/shared/keybindings")
      return { url: new URL("packages/shared/src/keybindings.ts", root).href, shortCircuit: true };
    if (specifier.includes(".wasm?")) {
      const bytes = NodeFS.readFileSync(new URL(specifier.split("?")[0], context.parentURL));
      return {
        url: moduleUrl(
          `export default ${JSON.stringify(`data:application/wasm;base64,${bytes.toString("base64")}`)};`,
        ),
        shortCircuit: true,
      };
    }
    if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
      const url = new URL(specifier, context.parentURL);
      if (!NodeFS.existsSync(url) && NodeFS.existsSync(NodeURL.fileURLToPath(url) + ".ts"))
        return { url: url.href + ".ts", shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith("file:") && url.endsWith(".ts"))
      return {
        format: "module",
        source: NodeModule.stripTypeScriptTypes(NodeFS.readFileSync(new URL(url), "utf8")),
        shortCircuit: true,
      };
    return nextLoad(url, context);
  },
});

const { GhosttyTerminalCore } = await import(
  new URL("apps/web/src/terminal/ghostty/core.ts", root).href
);
const theme = {
  foreground: { r: 255, g: 255, b: 255 },
  background: { r: 0, g: 0, b: 0 },
  cursor: { r: 255, g: 255, b: 255 },
};
const results = [];
for (const chunks of JSON.parse(process.argv[2])) {
  const replies = [];
  const core = await GhosttyTerminalCore.create(80, 24, 8, 16, theme, (data) => replies.push(data));
  try {
    for (const chunk of chunks) core.write(chunk);
    results.push(replies);
  } finally {
    core.dispose();
  }
}
process.stdout.write(JSON.stringify(results));
