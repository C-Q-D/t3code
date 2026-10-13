/** English copy for discussion navigation, lists, seat editing and the discussion page. */
export const discussions = {
  title: "Discussions",
  newTitle: "New discussion",
  hero: (project: string) => `What would you like to discuss in ${project}?`,
  heroPrefix: "What would you like to discuss in ",
  heroSuffix: "?",
  chooseProject: "Choose a project",
  noProjects: "Add a project to start a discussion.",
  template: "Template",
  noTemplate: "No template",
  loadingTemplates: "Loading templates…",
  topicLabel: "Discussion topic",
  topicPlaceholder: "Write the question to discuss. The first line becomes the title.",
  permissionsHint: "Seats use your default permission mode",
  saveAsTemplate: "Save as template",
  start: "Start discussion",
  startFailed: "Could not start discussion",
  seatsHeading: "Seats · Speak from left to right",
  addSeat: "Add seat",
  removeSeat: "Remove seat",
  editSeat: (name: string, position: number) => `Edit seat ${position}: ${name}`,
  moveSeat: (name: string, position: number) => `Move seat ${position}: ${name}`,
  persona: "Persona",
  model: "Model",
  unsupported: "Not supported yet",
  loadingModels: "Loading…",
  noModels: "No models available",
  ongoing: (count: number) => `In progress · ${count}`,
  endedGroup: (count: number) => `Ended · ${count}`,
  round: (round: number) => `Round ${round}`,
  totalRounds: (round: number) => `${round} rounds total`,
  speaking: (personaName: string) => (personaName ? `Speaking · ${personaName}` : "Speaking"),
  closing: "Closing",
  paused: "Stopped",
  seatFailed: "Stopped · Speaking failed",
  ended: "Ended",
  deletedProject: "Deleted project",
  empty: "No discussions yet",
  loading: "Loading discussions…",
  loadFailed: "Could not load discussions",
  diff: {
    close: "Close",
    loading: "Loading this statement’s changes…",
    failed: (message: string) =>
      message
        ? `Could not load this statement’s changes: ${message}.`
        : "Could not load this statement’s changes.",
    empty: "This statement has no changes to display.",
    retry: "Retry",
    missing: (path: string) =>
      `No changes were found for ${path}. All changes from this statement are shown below.`,
  },
  alerts: {
    stopped: (name: string) =>
      `The discussion is paused. Select "Continue" and ${name} will speak again.`,
    restarted:
      'The desktop app restarted and the discussion is paused. Select "Continue" to resume.',
    retry: (canEnd: boolean): string =>
      canEnd
        ? 'You can select "Continue" later to retry, or end the discussion.'
        : 'You can select "Continue" later to retry.',
    failed: (name: string, message: string) =>
      message ? `${name} could not speak: ${message}. ` : `${name} could not speak. `,
    usageLimit: (name: string, provider: string) =>
      `${name} could not speak: ${provider} usage limit reached. `,
    command: (name: string) =>
      `${name} is waiting for you to approve a command. The discussion is still running; they will continue speaking after approval.`,
    operation: (name: string) =>
      `${name} is waiting for you to approve an operation. The discussion is still running; they will continue speaking after approval.`,
    questions: (name: string) =>
      `${name} is waiting for you to answer questions. The discussion is still running; they will continue speaking after your response.`,
    long: (name: string, chars: string, limit: string) =>
      `The material for ${name} is now ${chars} characters long. Above ${limit} characters, it will be sent as a file.`,
    file: (name: string, chars: string, limit: string) =>
      `The material for ${name} is ${chars} characters long, exceeding the ${limit}-character message limit. It was sent as a file.`,
    openThread: "Open seat thread",
  },
  page: {
    notFound: "Discussion not found",
    notFoundDescription: "The discussion in this link does not exist or has been deleted.",
    unknownEnvironment: "Discussion environment not found",
    unknownEnvironmentDescription: "This environment may have disconnected or been removed.",
    deleted: "This discussion has been deleted",
    deletedDescription: "The discussion record has been deleted and its seat threads archived.",
    back: "Back to discussions",
    roundSpeaking: (round: number) => `Round ${round} · Speaking`,
    closingFinal: "Closing · Final statements",
    closingSummary: "Closing · Summary",
    stop: "Stop",
    resume: "Continue",
    end: "End discussion",
    more: "More",
    summarizerLabel: "Summarizer",
    summaryTemplate: "Summary template",
    summaryLoading: "Loading summary templates…",
    summaryFailed: "Could not load summary templates. The default template will be used",
    summaryOption: (name: string, description: string) =>
      description ? `${name} (${description})` : name,
    endNotice: (name: string) =>
      `${name} is speaking. Final statements will begin when they finish`,
    endSubmit: "End and summarize",
    endFailed: "Could not end discussion",
    deleteDiscussion: "Delete discussion",
    deleteTitle: "Delete this discussion?",
    deleteDescription: "The discussion record will be deleted and the seat threads archived.",
    deleteFailed: "Could not delete discussion",
    cancel: "Cancel",
    delete: "Delete",
    composerFallback: "Interject…",
    composerSpeaking: (current: string, next: string) =>
      `Interject… ${current} won't be interrupted. ${next} will read it when they speak next`,
    composerSingle: (current: string) =>
      `Interject… ${current} won't be interrupted. They will read it when they speak again`,
    composerPaused: (next: string) => `Interject… ${next} will read it when they speak again`,
    composerClosing: "Closing discussion. Interjections are disabled",
    sendInterjection: "Send interjection",
    interjectFailed: "Could not send interjection",
    stopFailed: "Could not stop discussion",
    resumeFailed: "Could not continue discussion",
    final: "Final statements",
    summary: "Summary",
    summarizer: "Summarizer",
    next: "Next",
    interrupted: "Interrupted",
    failed: "Speaking failed",
    speaking: "Speaking",
    seats: "Speaking order",
    runningCommand: "Running",
    viewProcess: "View process",
    noFiles: "No files changed",
    filesPending: "Change statistics are not available yet",
    changedFiles: (count: number) => `${count} ${count === 1 ? "file" : "files"} changed`,
    transcript: "Discussion record",
    interjection: "Interjection",
    interjectionRead: (name: string) => `Interjection · Read by ${name}`,
    interjectionPaused: (name: string) =>
      `Interjection · ${name} will read it when they speak again`,
    interjectionUnread: (name: string) => `Interjection · ${name} will read it when they speak`,
    nextUnreadPaused: (count: number) =>
      `Will read the ${count} ${count === 1 ? "interjection" : "interjections"} above when speaking again`,
    nextUnread: (count: number) =>
      `Will read the ${count} ${count === 1 ? "interjection" : "interjections"} above when speaking`,
    closingBoundaryPlain: "Discussion ends here",
    closingBoundary: (name: string) => `Discussion ends here · Summarizer: ${name}`,
    endedFooter:
      "This discussion has ended. The record is kept. Start a new discussion to continue.",
  },
};
