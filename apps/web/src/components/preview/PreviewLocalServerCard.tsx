/** Localized preview UI and interactions; preserves user data, commands, and protocol values. */
import { t } from "~/i18n";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { DiscoveryListRow } from "../ui/discovery-list";

import { PreviewFaviconIcon } from "./PreviewFaviconIcon";
import type { PreviewableServer } from "./useDiscoveredLocalServers";

interface Props {
  threadRef: ScopedThreadRef;
  server: PreviewableServer;
  onOpen: () => void;
}

export function PreviewLocalServerCard({ threadRef, server, onOpen }: Props) {
  const subtitle = describeServer(server);
  return (
    <DiscoveryListRow
      onClick={onOpen}
      icon={<PreviewFaviconIcon threadRef={threadRef} url={server.requestedUrl} />}
      title={subtitle}
      description={`${server.host}:${server.port}`}
    />
  );
}

/**
 * Returns the process name when known, otherwise the localized listening status.
 * @param server Discovered local server; a missing process name uses the listening label.
 * @returns The value described above, without changing user data or protocol identifiers.
 */
function describeServer(server: PreviewableServer): string {
  if (server.processName) return server.processName;
  return t.tools.preview.listening;
}
