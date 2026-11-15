// Keep this source embedded so bundled installs can materialize it without a source-tree path.
export const PI_REPLY_REWRITE_EXTENSION_SOURCE = `\
export default function replyRewriteExtension(pi) {
  // RPC redirects ordinary stdout; notifications use its serialized protocol writer.
  const emit = (ctx, metadata) => ctx.ui.notify(JSON.stringify({
    namespace: "t3.pi.reply-rewrite", version: 1, ...metadata,
  }), "info");
  const count = (value) => Number.isSafeInteger(value) && value >= 0 ? value : undefined;
  const label = (value) => typeof value === "string" && /^[a-zA-Z0-9._:/-]{1,200}$/.test(value)
    ? value : null;
  pi.on("session_start", (_event, ctx) => emit(ctx, { kind: "ready" }));
  pi.on("before_provider_request", (event, ctx) => {
    if (!event.payload || typeof event.payload !== "object" || Array.isArray(event.payload)) {
      throw new Error("Unsupported rewrite provider payload");
    }
    const tier = process.env.T3_PI_REPLY_REWRITE_TIER;
    if (tier !== "priority" && tier !== "default") throw new Error("Invalid rewrite tier");
    emit(ctx, { kind: "request" });
    return { ...event.payload, service_tier: tier };
  });
  pi.on("provider_stream_event", (event, ctx) => {
    const data = event.data;
    if (data?.type !== "response.completed" && data?.type !== "response.incomplete" &&
        data?.type !== "response.failed") return;
    const response = data.response;
    emit(ctx, {
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
