/** Checks connected account names through the real extras card; only environment data is supplied. */
import {
  EnvironmentId,
  ProviderDriverKind,
  ProviderInstanceId,
  type ServerProvider,
} from "@t3tools/contracts";
import { CHATGPT_USAGE_URL } from "@t3tools/shared/usageLimits";
import { describe, expect, it, vi } from "vite-plus/test";

import { render } from "../../../test/render";
import { t } from "../../i18n";
import { UsageLimitExtras } from "./UsageLimitExtras";
import { useLimitPresentations } from "./UsageLimits";

vi.mock("./UsageLimits", () => ({ useLimitPresentations: vi.fn() }));

const checkedAt = "2026-10-25T16:00:00.000Z";

/** Build a managed connection whose external usage destination is shared by both accounts. */
function managedChatGpt(instanceId: string, displayName: string): ServerProvider {
  return {
    instanceId: ProviderInstanceId.make(instanceId),
    driver: ProviderDriverKind.make("codex"),
    displayName,
    enabled: true,
    installed: true,
    version: "0.164.0",
    status: "ready",
    auth: { status: "authenticated" },
    checkedAt,
    models: [],
    slashCommands: [],
    skills: [],
    usageLimits: {
      checkedAt,
      windows: [],
      unavailable: { reason: "unsupported", message: "Track usage in ChatGPT." },
      externalUsage: { label: "ChatGPT usage", url: CHATGPT_USAGE_URL },
    },
  };
}

/** Reset the environment source without replacing account aggregation or card rendering. */
function setup() {
  return vi.mocked(useLimitPresentations).mockReset();
}

describe("UsageLimitExtras ChatGPT usage card", () => {
  it("names the managed connections it covers", async () => {
    const source = setup();
    const presentations = new Map([
      [
        EnvironmentId.make("desk"),
        {
          entry: { target: { label: "Desk" } },
          serverConfig: {
            providers: [
              managedChatGpt("chatgpt_work", "ChatGPT Work"),
              managedChatGpt("chatgpt_personal", "ChatGPT Personal"),
            ],
          },
        },
      ],
    ]);
    source.mockReturnValue(presentations);
    await using screen = await render(
      <UsageLimitExtras
        selectedEnvironmentIds={null}
        hiddenProviders={new Set()}
        cursorEnvironments={[]}
        onCursorEnabled={() => {}}
      />,
    );

    await expect
      .element(screen.getByText("ChatGPT Work on Desk, ChatGPT Personal on Desk"))
      .toBeVisible();
    await expect.element(screen.getByText(t.tools.usage.chatgptUsageHint)).toBeVisible();
  });
});
