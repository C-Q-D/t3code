/** Creation form contracts independent of provider execution and navigation effects. */
import type {
  DiscussionCreateInput,
  DiscussionProviderSupportResult,
  ProjectId,
  EnvironmentId,
  DiscussionId,
} from "@t3tools/contracts";
import { canSelectDiscussionModel } from "./discussionSeats.logic";

/**
 * Validates a creation draft before issuing a provider-starting command.
 * @param draft Selected project, raw topic and speaking order; null project is unavailable.
 * @param support Destination capabilities, null until known.
 * @param writable Command permission for the destination.
 * @param busy Whether a submission is in flight.
 * @returns Whether starting is allowed; the server still validates the request.
 */
export function canStartDiscussion(
  draft: {
    readonly projectId: ProjectId | null;
    readonly topic: string;
    readonly seats: DiscussionCreateInput["seats"];
  },
  support: DiscussionProviderSupportResult | null,
  writable: boolean,
  busy: boolean,
) {
  return (
    writable &&
    !busy &&
    draft.projectId !== null &&
    draft.topic.trim().length > 0 &&
    draft.seats.length > 0 &&
    draft.seats.every((seat) =>
      canSelectDiscussionModel(seat.modelSelection.instanceId, support, true),
    )
  );
}
/**
 * Constructs the command payload without changing user text or seat order.
 * @param projectId Environment-local destination project.
 * @param topic Raw multiline topic; whitespace is retained.
 * @param seats Speaking order from the controlled editor.
 * @returns Contract-shaped input, with no template-only summary reference.
 */
export function buildDiscussionCreateInput(
  projectId: ProjectId,
  topic: string,
  seats: DiscussionCreateInput["seats"],
): DiscussionCreateInput {
  return { projectId, topic, seats: [...seats] };
}
/**
 * Targets the discussion returned by a successful create.
 * @param environmentId Destination environment used for the command.
 * @param discussionId Identity returned by the server.
 * @returns Navigation options that replace the creation page in browser history.
 */
export function discussionCreatedRoute(environmentId: EnvironmentId, discussionId: DiscussionId) {
  return {
    to: "/discussions/$environmentId/$discussionId" as const,
    params: { environmentId, discussionId },
    replace: true,
  };
}
