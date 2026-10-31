import { t } from "~/i18n";
/** Diff failures currently include transport wrappers, so recognize the reason inside them. */
export function describePullRequestDiffError(error: string, providerName: string, _term: string) {
  if (/\brate limit\b|\brate[-_]limited\b|\btoo many requests\b/i.test(error)) {
    return {
      title: t.git.diffErrorText.limited(providerName),
      description: t.git.diffErrorText.limitedHint(providerName),
    };
  }

  return {
    title: t.git.diffErrorUi.title,
    description: t.git.diffErrorText.hint(providerName),
  };
}
