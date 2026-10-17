/** Formats router failure reports without React, application state, or clock access. */

/** Returns a stack, string, or JSON detail; circular values use the existing fallback. */
function errorDetails(error: unknown): string | undefined {
  if (error instanceof Error) return error.stack ?? error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error, null, 2);
  } catch {
    return "No additional error details are available.";
  }
}

/**
 * Builds clipboard text with at most five causes, including cyclic Error chains.
 * @param error The thrown value; non-Error values retain their string or JSON representation.
 * @param pathname Router pathname only, without query or hash credentials.
 * @param build App display name and version for identifying the failing build.
 * @param timestamp ISO timestamp captured by the caller when the report is created.
 * @returns The existing newline-delimited report, without reading global state.
 */
export function errorReport(
  error: unknown,
  pathname: string,
  build: string,
  timestamp: string,
): string {
  const lines = [build, `Path: ${pathname}`, `Time: ${timestamp}`, "", errorDetails(error)];
  let cause = error instanceof Error ? error.cause : undefined;
  for (let depth = 0; cause !== undefined && depth < 5; depth += 1) {
    lines.push("", "Caused by:", errorDetails(cause));
    cause = cause instanceof Error ? cause.cause : undefined;
  }
  return lines.join("\n");
}
