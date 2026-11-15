// Keep this source embedded so bundled installs can materialize it without a source-tree path.
export const PI_REPLY_REWRITE_EXTENSION_SOURCE = `\
export default function replyRewriteExtension(pi) {
  const emit = (metadata) => process.stdout.write(JSON.stringify({
    type: "t3_reply_rewrite", ...metadata,
  }) + "\\n");
  const count = (value) => Number.isSafeInteger(value) && value >= 0 ? value : undefined;
  const label = (value) => typeof value === "string" && /^[a-zA-Z0-9._:/-]{1,200}$/.test(value)
    ? value : null;
  pi.on("session_start", () => emit({ kind: "ready", version: 1 }));
  pi.on("before_provider_request", (event) => {
    if (!event.payload || typeof event.payload !== "object" || Array.isArray(event.payload)) {
      throw new Error("Unsupported rewrite provider payload");
    }
    const tier = process.env.T3_PI_REPLY_REWRITE_TIER;
    if (tier !== "priority" && tier !== "default") throw new Error("Invalid rewrite tier");
    emit({ kind: "request" });
    return { ...event.payload, service_tier: tier };
  });
  pi.on("provider_stream_event", (event) => {
    const data = event.data;
    if (data?.type !== "response.completed" && data?.type !== "response.incomplete" &&
        data?.type !== "response.failed") return;
    const response = data.response;
    emit({
      kind: "response",
      status: data.type,
      model: label(response?.model),
      actualServiceTier: label(response?.service_tier),
      usage: response?.usage ? {
        inputTokens: count(response.usage.input_tokens),
        outputTokens: count(response.usage.output_tokens),
        totalTokens: count(response.usage.total_tokens),
      } : null,
    });
  });
}
`;
