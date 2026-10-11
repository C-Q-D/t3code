/** Local validation messages, independent of the remote protocol and client locale state. */
export const englishRemotePairingMessages = {
  RemoteBackendUrlMissingError: "Enter a backend URL.",
  RemotePairingUrlInvalidError: "Pairing URL is invalid.",
  RemoteBackendUrlInvalidError: "Backend URL is invalid.",
  RemotePairingTokenMissingError: "Pairing URL is missing its token.",
  RemotePairingCodeMissingError: "Enter a pairing code.",
  invalidDetails: "The pairing details are invalid.",
  differentMachine: (label: string) =>
    `That address reaches ${label}, a different machine. Add it as its own environment instead.`,
};
/** Presentation strings for locally validated pairing fields and wrong-machine feedback. */
export type RemotePairingMessages = typeof englishRemotePairingMessages;
