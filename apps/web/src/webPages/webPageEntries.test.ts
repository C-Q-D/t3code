/** Checks user-input URL boundaries and independent name/hostname search behavior. */
import { describe, expect, it } from "vite-plus/test";
import { defaultWebPageName, filterWebPages, normalizeWebPageUrl } from "./webPageEntries";

describe("web-page URLs", () => {
  it.each([
    ["chatgpt.com", "https://chatgpt.com/"],
    ["  http://localhost:3000/a b ", "http://localhost:3000/a%20b"],
    ["HTTPS://EXAMPLE.COM:443/path?q=1#chat", "https://example.com/path?q=1#chat"],
    ["localhost:3000/a", "https://localhost:3000/a"],
    ["example.com:8443/a", "https://example.com:8443/a"],
    ["[::1]:3000/a", "https://[::1]:3000/a"],
  ])("normalizes %j to %s", (input, expected) => {
    expect(normalizeWebPageUrl(input)).toBe(expected);
  });

  it.each([
    "javascript:alert(1)",
    "file:///C:/a",
    "",
    "   ",
    "https://",
    "ftp://example.com",
    "data:text/html,hello",
    "http://a b",
  ])("rejects %j", (input) => {
    expect(normalizeWebPageUrl(input)).toBeNull();
  });

  it.each([
    ["https://www.deepseek.com/x", "deepseek.com"],
    ["https://chat.example.com:8443/x", "chat.example.com"],
  ])("derives a name from %s", (url, expected) => {
    expect(defaultWebPageName(url)).toBe(expected);
  });
});

describe("saved page search", () => {
  const entries = [
    { id: "a", name: "Research", url: "https://chatgpt.com/search" },
    { id: "b", name: "Work", url: "https://www.deepseek.com/research" },
    { id: "c", name: "Research notes", url: "https://example.com/" },
  ];

  it.each(["", "   "])("returns the original array for query %j", (query) => {
    expect(filterWebPages(entries, query)).toBe(entries);
  });

  it.each([
    ["rEsEaRcH", ["a", "c"]],
    ["DEEPSEEK", ["b"]],
    ["unknown", []],
  ])("matches names or hosts in order for query %s", (query, ids) => {
    expect(filterWebPages(entries, query).map((entry) => entry.id)).toEqual(ids);
  });
});
