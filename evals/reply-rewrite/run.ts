// @effect-diagnostics nodeBuiltinImport:off - This offline CLI reads and writes local evaluation artifacts synchronously.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeUtil from "node:util";
import * as Schema from "effect/Schema";
import { DEFAULT_REPLY_REWRITE_SETTINGS } from "@t3tools/contracts";
import { replyRewriteSystemPrompt } from "../../apps/server/src/replyRewrite/prompt.ts";
import { cases } from "./cases.ts";
import { gradeReplyRewrite } from "./grade.ts";

const { values } = NodeUtil.parseArgs({
  options: {
    out: { type: "string" },
    model: { type: "string", default: DEFAULT_REPLY_REWRITE_SETTINGS.modelId },
    case: { type: "string" },
    baseline: { type: "string" },
    responses: { type: "string" },
    samples: { type: "string", default: "3" },
    "custom-prompt": { type: "string", default: "" },
  },
});
if (!values.out)
  throw new Error("--out is required. This command prepares requests; it never calls a model.");
const sampleCount = Number(values.samples);
if (!Number.isSafeInteger(sampleCount) || sampleCount < 1 || sampleCount > 20)
  throw new Error("--samples must be an integer from 1 to 20.");
const selected = values.case
  ? cases.filter((entry) => values.case!.split(",").includes(entry.id))
  : cases;
if (selected.length === 0) throw new Error("No matching cases.");
const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));
const decodeResponse = Schema.decodeUnknownSync(
  Schema.fromJsonString(
    Schema.Struct({
      caseId: Schema.String,
      sample: Schema.Number,
      text: Schema.String,
      model: Schema.String,
      actualServiceTier: Schema.optionalKey(Schema.NullOr(Schema.String)),
    }),
  ),
);
const requests = selected.flatMap((entry) =>
  Array.from({ length: sampleCount }, (_, sample) => ({
    caseId: entry.id,
    sample,
    source: "reply-rewrite approved task, synthetic fixture",
    provider: DEFAULT_REPLY_REWRITE_SETTINGS.provider,
    model: values.model,
    thinkingLevel: DEFAULT_REPLY_REWRITE_SETTINGS.thinkingLevel,
    requestedServiceTier: DEFAULT_REPLY_REWRITE_SETTINGS.requestedServiceTier,
    sourceText: entry.source,
    systemPrompt: replyRewriteSystemPrompt(values["custom-prompt"]),
    rubric: entry.rubric,
  })),
);
const directory = NodePath.resolve(values.out);
NodeFS.mkdirSync(directory, { recursive: true });
NodeFS.writeFileSync(
  NodePath.join(directory, "requests.jsonl"),
  requests.map((request) => encodeJson(request)).join("\n") + "\n",
);
let review = "Prepared requests only. No model was called. Cost: 0.\n";
if (values.responses) {
  const responses = NodeFS.readFileSync(values.responses, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((response) => decodeResponse(response));
  const results = responses.map((response) => {
    const entry = selected.find((candidate) => candidate.id === response.caseId);
    if (!entry) throw new Error(`Unexpected case: ${response.caseId}`);
    return {
      ...response,
      ...gradeReplyRewrite(entry.source, response.text, entry.protectedPhrases),
      rubric: entry.rubric,
    };
  });
  NodeFS.writeFileSync(
    NodePath.join(directory, "results.jsonl"),
    results.map((result) => encodeJson(result)).join("\n") + "\n",
  );
  review += `${results.length} responses imported. ${results.filter((result) => !result.literalChecksPassed).length} literal failures. Semantic fidelity needs human review. Model cost must be supplied by the runner.\n`;
  review += results
    .map(
      (result) =>
        `\n${result.caseId} / ${result.sample}\nRubric: ${result.rubric}\nOutput:\n${result.text}\n`,
    )
    .join("");
}
if (values.baseline) {
  review += `\nBaseline for manual comparison:\n${NodeFS.readFileSync(NodePath.join(values.baseline, "review.txt"), "utf8")}\n`;
}
NodeFS.writeFileSync(NodePath.join(directory, "review.txt"), review);
process.stdout.write(
  `Prepared ${requests.length} requests in ${directory}. No model call was made.\n`,
);
