/**
 * 建议本地拒绝表。模型输出视为不可信输入，不处理优化草稿。
 *
 * 顺序即优先级，分三段：
 *   1. 结构类：空、包装、标签、报错回显
 *   2. 内容类：评价句、助手口吻、元应答
 *   3. 长度与格式类
 * 内容类必须先于长度类，否则「thanks」会先被判成词数不足，掩盖真正原因。
 */
import type { ComposerSuggestionFilterReason } from "@t3tools/contracts";
import { wordCount } from "./words.ts";

type FilterReason = typeof ComposerSuggestionFilterReason.Type;
const SUGGESTION_MIN_WORDS = 2;
const SUGGESTION_MAX_WORDS = 12;
const SUGGESTION_MAX_CHARS = 100;

const ONE_WORD_OK = new Set([
  "yes",
  "yeah",
  "yep",
  "yea",
  "yup",
  "sure",
  "ok",
  "okay",
  "push",
  "commit",
  "deploy",
  "stop",
  "continue",
  "check",
  "exit",
  "quit",
  "no",
]);

const ERROR_PREFIXES = [
  "api error:",
  "prompt is too long",
  "request timed out",
  "invalid api key",
  "image was too large",
];

/** Removes recognized outer wrappers from raw model output; nested markup stays intact. */
export function stripWrapping(raw: string): string {
  const trimmed = raw.trim();
  const unwrapped = trimmed.replace(
    /^<(suggestion|response|output|answer|result)>([\s\S]*)<\/\1>$/i,
    (whole, _tag: string, inner: string) => (inner.includes("</") ? whole : inner),
  );
  return unwrapped
    .replace(
      /^\s*(suggested\s+(response|reply|input|prompt)|suggestion|response|reply|answer|output|result|提案|回答|返信|応答|出力|結果|建議|回复|答案|输出|结果|제안|답변|응답|출력|결과)\s*[:：]\s*/i,
      "",
    )
    .trim();
}

type Check = readonly [FilterReason, (text: string, lower: string, words: number) => boolean];

const STRUCTURAL: readonly Check[] = [
  ["empty", (t) => t === ""],
  [
    "done",
    (t, lower) => lower === "done" || /^\P{L}*(完了(しました)?|完成了?|완료됐?)\P{L}*$/u.test(t),
  ],
  [
    "meta_text",
    (t, lower) =>
      lower === "nothing found" ||
      lower === "nothing found." ||
      lower.startsWith("nothing to suggest") ||
      lower.startsWith("no suggestion") ||
      /\bsilence is\b|\bstay(s|ing)? silent\b/.test(lower) ||
      /^\W*silence\W*$/.test(lower) ||
      /^\P{L}*(沈黙|沉默|静黙|침묵|提案(なし|はありません)|特に(なし|ありません))\P{L}*$/u.test(t),
  ],
  ["meta_wrapped", (t) => /^(\(.*\)|\[.*\]|（.*）|［.*］|【.*】|〔.*〕)$/.test(t)],
  ["error_message", (_t, lower) => ERROR_PREFIXES.some((p) => lower.startsWith(p))],
  ["prefixed_label", (t) => /^\w+:\s/.test(t)],
];

const CONTENT: readonly Check[] = [
  [
    "evaluative",
    (t, lower) =>
      /thanks|thank you|looks good|sounds good|that works|that worked|that's all|nice|great|perfect|makes sense|awesome|excellent/.test(
        lower,
      ) ||
      /^\P{L}*(ありがとう(ございます|ございました)?|助かりました|[谢謝][谢謝][你您]?|感谢[你您]?|감사합니다|고마워요?)(\P{L}|的|$)/u.test(
        t,
      ),
  ],
  [
    "assistant_voice",
    (t) =>
      /^(let me|i'll|i've|i'm|i can|i would|i think|i notice|here's|here is|here are|that's|this is|this will|you can|you should|you could|sure,|of course|certainly|让我(?!们)|我来|我会|我将)/i.test(
        t,
      ),
  ],
];

const LENGTH_AND_FORMAT: readonly Check[] = [
  [
    "too_few_words",
    (t, lower, words) => {
      if (words >= SUGGESTION_MIN_WORDS) return false;
      if (t.startsWith("/")) return false;
      // 单词指令是合法建议，先于长度规则放行
      if (ONE_WORD_OK.has(lower)) return false;
      const counted = wordCount(t);
      if (counted > 0) return counted < SUGGESTION_MIN_WORDS;
      return true;
    },
  ],
  ["too_many_words", (_t, _lower, words) => words > SUGGESTION_MAX_WORDS],
  ["too_long", (t) => t.length >= SUGGESTION_MAX_CHARS],
  ["multiple_sentences", (t) => /[.!?]\s+[A-Z]|[。！？]\s*[\p{L}\p{N}]/u.test(t)],
  // 换行、Markdown 强调、代码块（反引号）都不适合作为一句可直接发送的输入
  ["has_formatting", (t) => /[\n*`]/.test(t)],
];

const CHECKS: readonly Check[] = [...STRUCTURAL, ...CONTENT, ...LENGTH_AND_FORMAT];

/** Checks raw model output in reference priority order; returns the first rejection or null. */
export function checkCandidate(raw: string): FilterReason | null {
  const text = stripWrapping(raw);
  const lower = text.toLowerCase();
  const words = wordCount(text);
  for (const [reason, test] of CHECKS) {
    if (test(text, lower, words)) return reason;
  }
  return null;
}
