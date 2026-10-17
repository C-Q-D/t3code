/** Derives submission availability for the composer's footer and queued-message save entry. */

/** Caller-owned draft, permission, connection, and dispatch state; null means no blocking reason. */
export interface ComposerSubmissionInput {
  canOperateThread: boolean;
  isSendBusy: boolean;
  sendDisabledReason: string | null;
  isConnecting: boolean;
  isEnvironmentUnavailable: boolean;
  hasSendableContent: boolean;
  canResume?: boolean;
}

/** Both submit entries use the same disabled state and connection/submission progress indicator. */
export interface ComposerSubmissionState {
  disabled: boolean;
  busy: boolean;
}

/**
 * Resolves the existing send/save gates without changing dispatch or validation.
 * @param input Current composer state; canResume defaults to false and permits an empty resume action.
 * @returns Shared button availability and progress; busy includes connecting as in the footer action.
 */
export function getComposerSubmissionState(
  input: ComposerSubmissionInput,
): ComposerSubmissionState {
  const busy = input.isConnecting || input.isSendBusy;
  return {
    disabled:
      busy ||
      !input.canOperateThread ||
      input.sendDisabledReason !== null ||
      input.isEnvironmentUnavailable ||
      (!input.hasSendableContent && !input.canResume),
    busy,
  };
}
