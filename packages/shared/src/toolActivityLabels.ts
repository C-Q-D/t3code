/** Locale-owned tool labels. Paths, queries, and skill names remain provider data. */
export interface ToolActivityLabels {
  readonly searchedQueryIn: (query: string, target: string) => string;
  readonly searchedQuery: (query: string) => string;
  readonly searchedFilesIn: (glob: string, target: string) => string;
  readonly searchedFiles: (glob: string) => string;
  readonly searchedIn: (target: string) => string;
  readonly readPath: (path: string, extraCount: number) => string;
  readonly readFile: (extraCount: number) => string;
  readonly skill: (name: string) => string;
}

/** Default labels preserve server and mobile output when callers omit a locale. */
export const englishToolActivityLabels: ToolActivityLabels = {
  searchedQueryIn: (query, target) => `Searched ${query} in ${target}`,
  searchedQuery: (query) => `Searched ${query}`,
  searchedFilesIn: (glob, target) => `Searched files ${glob} in ${target}`,
  searchedFiles: (glob) => `Searched files ${glob}`,
  searchedIn: (target) => `Searched in ${target}`,
  readPath: (path, extraCount) => `Read ${path}${extraCount > 0 ? ` +${extraCount} more` : ""}`,
  readFile: (extraCount) => `Read file${extraCount > 0 ? ` +${extraCount} more` : ""}`,
  skill: (name) => `Skill: ${name}`,
};
