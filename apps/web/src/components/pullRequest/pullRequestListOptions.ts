/** Shared filter options retain the local ordering and translated labels. */
import { t } from "~/i18n";
import type { PullRequestInvolvement, PullRequestListState } from "@t3tools/contracts";
import {
  CalendarArrowDownIcon,
  CalendarArrowUpIcon,
  ClockIcon,
  EyeIcon,
  LayersIcon,
  ListChecksIcon,
  Maximize2Icon,
  Minimize2Icon,
  PenLineIcon,
  UserLockIcon,
} from "lucide-react";

import type { PullRequestFilterOption } from "./PullRequestListFilters";
import type { PullRequestListSort } from "./pullRequestListPreferences";
import { PullRequestGlyph } from "./pullRequestIcons";

export const INVOLVEMENT_TABS = [
  { value: "authored", label: t.git.pullRequest.authored, Icon: PenLineIcon },
  { value: "reviewing", label: t.git.pullRequest.reviewing, Icon: EyeIcon },
  { value: "all", label: t.git.pullRequest.all, Icon: LayersIcon },
] as const satisfies ReadonlyArray<PullRequestFilterOption<PullRequestInvolvement>>;

export const STATE_TABS = [
  { value: "all", label: t.git.pullRequest.all, Icon: LayersIcon },
  { value: "open", label: t.git.pullRequest.open, Icon: PullRequestGlyph.pullRequest },
  { value: "closed", label: t.git.pullRequest.closed, Icon: PullRequestGlyph.closed },
  { value: "merged", label: t.git.pullRequest.merged, Icon: PullRequestGlyph.merged },
] as const satisfies ReadonlyArray<PullRequestFilterOption<PullRequestListState>>;

export const SORT_OPTIONS = [
  { value: "updated", label: t.git.pullRequest.recentlyUpdated, Icon: ClockIcon },
  { value: "newest", label: t.git.pullRequest.newestShown, Icon: CalendarArrowDownIcon },
  { value: "oldest", label: t.git.pullRequest.oldestShown, Icon: CalendarArrowUpIcon },
  { value: "largest", label: t.git.pullRequest.largestShown, Icon: Maximize2Icon },
  { value: "smallest", label: t.git.pullRequest.smallestShown, Icon: Minimize2Icon },
  { value: "ready", label: t.git.pullRequest.mergeReadiness, Icon: ListChecksIcon },
  { value: "blocked", label: t.git.pullRequest.blockedOnMe, Icon: UserLockIcon },
] as const satisfies ReadonlyArray<PullRequestFilterOption<PullRequestListSort>>;
