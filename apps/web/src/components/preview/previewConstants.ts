/** Localized preview UI and interactions; preserves user data, commands, and protocol values. */
import { t } from "~/i18n";
/** Cap for the per-thread "recently seen" URL list shown in the empty state. */
export const PREVIEW_RECENT_URL_LIMIT = 10;

/**
 * Common Chromium error codes mapped to a short human label. Used by the
 * unreachable view to drop the raw `ERR_*` code in favour of friendlier copy.
 */
export const PREVIEW_ERROR_CODE_MESSAGES: Readonly<Record<string, string>> = Object.freeze({
  ERR_NAME_NOT_RESOLVED: t.tools.preview.dnsNotFound,
  ERR_NAME_RESOLUTION_FAILED: t.tools.preview.dnsNotFound,
  ERR_CONNECTION_REFUSED: t.tools.preview.connectionRefused,
  ERR_CONNECTION_RESET: t.tools.preview.connectionReset,
  ERR_CONNECTION_CLOSED: t.tools.preview.connectionClosed,
  ERR_CONNECTION_TIMED_OUT: t.tools.preview.connectionTimeout,
  ERR_INTERNET_DISCONNECTED: t.tools.preview.noInternet,
  ERR_TIMED_OUT: t.tools.preview.connectionTimeout,
  ERR_CERT_AUTHORITY_INVALID: t.tools.preview.untrustedCertificate,
  ERR_CERT_COMMON_NAME_INVALID: t.tools.preview.certificateHostname,
  ERR_CERT_DATE_INVALID: t.tools.preview.certificateDate,
  ERR_TOO_MANY_REDIRECTS: t.tools.preview.redirects,
});
