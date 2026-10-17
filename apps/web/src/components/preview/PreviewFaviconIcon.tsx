/** Renders favicon sources with ordered fallback; callers own URL lookup and fallback artwork. */
import { type ReactNode, useState } from "react";

export function FaviconImage(props: {
  sources: ReadonlyArray<string | null | undefined>;
  fallback: ReactNode;
  className?: string | undefined;
}) {
  const sources = props.sources.filter((source): source is string => Boolean(source));
  return (
    <FaviconImageAttempt
      key={sources.join("\0")}
      sources={sources}
      fallback={props.fallback}
      className={props.className}
    />
  );
}

/**
 * Tries favicon sources in order, remembering failed URLs until this keyed instance remounts.
 * @param props.sources Candidate URLs in priority order; an empty list immediately uses fallback.
 * @param props.fallback Content rendered when every candidate has failed or no candidates exist.
 * @param props.className Optional classes applied to the image, not to fallback content.
 * @returns The first unfailed image or fallback; image errors advance to the next candidate.
 */
function FaviconImageAttempt(props: {
  sources: ReadonlyArray<string>;
  fallback: ReactNode;
  className?: string | undefined;
}) {
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  const source = props.sources.find((candidate) => !failed.has(candidate));
  if (!source) return props.fallback;
  return (
    <img
      src={source}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={props.className}
      onError={() => setFailed((current) => new Set(current).add(source))}
    />
  );
}
