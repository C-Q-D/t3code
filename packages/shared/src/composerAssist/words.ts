/**
 * 建议词数折算；不用于截断用户草稿。
 * 英文按空白切分即可，中日韩需要按字符加权：Han 0.5、假名等 0.25、其它字母 1。
 * 结果向上取整；含汉字或假名的建议仍用此值检查词数下限，上限另按非空白字符数判断。
 */
const HAN = /\p{Script=Han}/u;
const PHONETIC =
  /[\p{Script=Hiragana}\p{Script=Katakana}\u30fc\uff70\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;
const HANGUL = /\p{Script=Hangul}/u;
const ALNUM = /[\p{L}\p{N}]/u;

interface Tally {
  han: number;
  phonetic: number;
  hangul: number;
  other: number;
}

/** Counts script classes in one token; punctuation contributes no letters. */
function tally(text: string): Tally {
  let han = 0;
  let phonetic = 0;
  let hangul = 0;
  let other = 0;
  for (const ch of text) {
    if (HAN.test(ch)) han++;
    else if (PHONETIC.test(ch)) phonetic++;
    else if (HANGUL.test(ch)) hangul++;
    else if (ALNUM.test(ch)) other++;
  }
  return { han, phonetic, hangul, other };
}

/** Returns the rounded-up script-weighted word count of text, or zero for blank input. */
export function wordCount(text: string): number {
  const trimmed = text.trim();
  if (trimmed === "") return 0;
  let total = 0;
  for (const token of trimmed.split(/\s+/)) {
    const { han, phonetic, hangul, other } = tally(token);
    // 没有任何可计数字符的 token（纯符号）按 1 计，避免整句被判 0 词
    total +=
      han === 0 && phonetic === 0 ? 1 : (other + hangul > 0 ? 1 : 0) + han / 2 + phonetic / 4;
  }
  return Math.ceil(total);
}
