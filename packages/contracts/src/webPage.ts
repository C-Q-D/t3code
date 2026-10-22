/** Validates saved web-page entries; navigation and session state belong to the client. */
import * as Schema from "effect/Schema";
import { TrimmedNonEmptyString } from "./baseSchemas.ts";

export const WEB_PAGE_NAME_MAX_LENGTH = 48;
export const WEB_PAGE_URL_MAX_LENGTH = 2048;

/** Control characters must not enter ids used in runtime tab keys. */
export const WebPageId = TrimmedNonEmptyString.check(
  Schema.isMaxLength(64),
  Schema.isPattern(/^[^\p{Cc}]+$/u),
);
export type WebPageId = typeof WebPageId.Type;

export const WebPageName = TrimmedNonEmptyString.check(
  Schema.isMaxLength(WEB_PAGE_NAME_MAX_LENGTH),
);

/** Saved entries only launch web content, never local files or executable URL schemes. */
export const WebPageUrl = Schema.String.check(
  Schema.isMaxLength(WEB_PAGE_URL_MAX_LENGTH),
  Schema.makeFilter(
    (value) => {
      try {
        const url = new URL(value);
        return (url.protocol === "https:" || url.protocol === "http:") && url.hostname.length > 0;
      } catch {
        return false;
      }
    },
    { expected: "an absolute HTTP or HTTPS URL" },
  ),
);

export const WebPageEntry = Schema.Struct({
  id: WebPageId,
  name: WebPageName,
  url: WebPageUrl,
});
/** A saved launch target; transient navigation does not overwrite its configured URL. */
export type WebPageEntry = typeof WebPageEntry.Type;
