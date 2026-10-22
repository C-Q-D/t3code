/** Protects saved web-page settings from silent data loss and invalid persisted entries. */
import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";

import { ClientSettingsSchema, ClientSettingsPatch } from "./settings.ts";

const decode = Schema.decodeUnknownSync(ClientSettingsSchema);
const encode = Schema.encodeSync(ClientSettingsSchema);
const decodePatch = Schema.decodeUnknownSync(ClientSettingsPatch);
const entry = { id: "chat", name: "ChatGPT", url: "https://chatgpt.com/" };

describe("web-page settings", () => {
  it("defaults missing entries to an empty array", () => {
    expect(decode({})).toHaveProperty("webPages", []);
  });

  it.each(["https://chatgpt.com/", "http://localhost:3000/a%20b"])(
    "preserves %s through settings encoding and patches",
    (url) => {
      const input = { webPages: [{ ...entry, url }] };
      expect(encode(decode(input))).toMatchObject(input);
      expect(decodePatch(input)).toEqual(input);
    },
  );

  it("trims saved ids and names", () => {
    const input = { webPages: [{ ...entry, id: " chat ", name: " ChatGPT " }] };
    expect(decode(input)).toHaveProperty("webPages", [entry]);
    expect(decodePatch(input)).toEqual({ webPages: [entry] });
  });

  it("accepts the maximum field lengths", () => {
    const input = {
      webPages: [
        { id: "i".repeat(64), name: "n".repeat(48), url: `https://a.co/${"x".repeat(2035)}` },
      ],
    };
    expect(encode(decode(input))).toMatchObject(input);
    expect(decodePatch(input)).toEqual(input);
  });

  it("does not impose the browser-profile count limit on saved pages", () => {
    const input = {
      webPages: Array.from({ length: 100 }, (_, index) => ({ ...entry, id: `page-${index}` })),
    };
    expect(encode(decode(input))).toMatchObject(input);
    expect(decodePatch(input)).toEqual(input);
  });

  it.each([
    ["empty id", { id: "" }],
    ["blank id", { id: "   " }],
    ["long id", { id: "i".repeat(65) }],
    ["control character in id", { id: "a\u0000b" }],
    ["empty name", { name: "" }],
    ["blank name", { name: "   " }],
    ["long name", { name: "n".repeat(49) }],
    ["empty URL", { url: "" }],
    ["relative URL", { url: "/chat" }],
    ["URL without protocol", { url: "chatgpt.com" }],
    ["URL without host", { url: "https://" }],
    ["script URL", { url: "javascript:alert(1)" }],
    ["file URL", { url: "file:///C:/a" }],
    ["FTP URL", { url: "ftp://example.com/" }],
    ["long URL", { url: `https://a.co/${"x".repeat(2036)}` }],
  ])("rejects %s in snapshots and patches", (_label, patch) => {
    const input = { webPages: [{ ...entry, ...patch }] };
    expect(() => decode(input)).toThrow();
    expect(() => decodePatch(input)).toThrow();
  });
});
