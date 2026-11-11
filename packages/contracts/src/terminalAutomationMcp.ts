/** MCP exposes business fields only; identity and dispatch grants stay inside the server. */
import * as Schema from "effect/Schema";
import * as Terminal from "./terminalAutomation.ts";

/** Reject unmodeled root fields without replacing the advertised object with Unknown. */
const mcp = <F extends Schema.Struct.Fields>(schema: Schema.Struct<F>) =>
  Schema.toType(
    Schema.StructWithRest(schema, [Schema.Record(Schema.String, Schema.Unknown)]).check(
      Schema.makeFilter(
        (value) => Object.keys(value).every((key) => Object.hasOwn(schema.fields, key)),
        {
          expected: "only declared tool parameters",
          toJsonSchema: () => ({ propertyNames: { enum: Object.keys(schema.fields) } }),
        },
      ),
    ),
  );
export const TerminalMcpStatusInput = mcp(Terminal.TerminalAutomationStatusInput.to);
export const TerminalMcpBindInput = mcp(
  Schema.Struct({ mode: Schema.Literals(["auto", "request_selection"]) }),
);
export const TerminalMcpReadInput = mcp(Terminal.TerminalAutomationReadInput.to);
export const TerminalMcpInput = mcp(Terminal.TerminalAutomationInput.to);
export const TerminalMcpReleaseInput = mcp(Terminal.TerminalAutomationReleaseInput.to);
