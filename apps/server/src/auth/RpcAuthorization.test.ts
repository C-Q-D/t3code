/** Verifies RPC authorization before handlers run, including persisted template behavior. */
import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import {
  AuthEnvironmentMaintainScope,
  AuthDiagnosticsReadScope,
  AuthFilesystemReadScope,
  AuthProvidersManageScope,
  AuthSettingsWriteScope,
  DEFAULT_SERVER_SETTINGS,
  ProviderInstanceId,
  ThreadId,
  AuthOrchestrationOperateScope,
  ORCHESTRATION_V2_WS_METHODS,
  AuthOrchestrationReadScope,
  AuthSourceControlWriteScope,
  AuthPreviewOperateScope,
  AuthRelayReadScope,
  AuthRelayWriteScope,
  AuthTerminalReadScope,
  AuthTerminalOperateScope,
  WS_METHODS,
  WsRpcGroup,
  DiscussionPromptId,
  type AuthEnvironmentScope,
} from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as RpcTest from "effect/rpc/RpcTest";
import type * as RpcGroup from "effect/rpc/RpcGroup";
import * as Stream from "effect/Stream";
import * as DiscussionTemplates from "../discussions/DiscussionTemplateService.ts";
import * as SqlitePersistence from "../persistence/Sqlite.ts";

import {
  RPC_REQUIRED_SCOPES,
  requiredScopeForRpcMethod,
  requiredScopeForDeviceList,
} from "./RpcAuthorization.ts";
import * as RpcAuthorization from "./RpcAuthorization.ts";

const discussionMethods = [
  WS_METHODS.discussionPromptsList,
  WS_METHODS.discussionPromptsSubscribe,
  WS_METHODS.discussionPromptsUpsert,
  WS_METHODS.discussionPromptsDelete,
  WS_METHODS.discussionPromptsRestoreBuiltin,
  WS_METHODS.discussionTemplatesList,
  WS_METHODS.discussionTemplatesSubscribe,
  WS_METHODS.discussionTemplatesUpsert,
  WS_METHODS.discussionTemplatesDelete,
] as const;
const discussionGroup = WsRpcGroup.omit(
  ...[...WsRpcGroup.requests.keys()].filter(
    (
      tag,
    ): tag is Exclude<
      RpcGroup.Rpcs<typeof WsRpcGroup>["_tag"],
      (typeof discussionMethods)[number]
    > => !(discussionMethods as ReadonlyArray<string>).includes(tag),
  ),
);
const discussionLayer = DiscussionTemplates.layer.pipe(
  Layer.provide(NodeCrypto.layer),
  Layer.provide(SqlitePersistence.layerMemory),
);

/** Runs the real template service through RPC middleware; scopes belong to this isolated connection. */
const makeDiscussionClient = (scopes: ReadonlyArray<AuthEnvironmentScope>) =>
  Effect.gen(function* () {
    const service = yield* DiscussionTemplates.DiscussionTemplateService;
    return yield* RpcTest.makeClient(discussionGroup).pipe(
      Effect.provide(
        Layer.mergeAll(
          discussionGroup.toLayer(
            Effect.succeed({
              [WS_METHODS.discussionPromptsList]: (input) => service.listPrompts(input),
              [WS_METHODS.discussionPromptsSubscribe]: (input) => service.subscribePrompts(input),
              [WS_METHODS.discussionPromptsUpsert]: (input) => service.upsertPrompt(input),
              [WS_METHODS.discussionPromptsDelete]: (input) => service.deletePrompt(input),
              [WS_METHODS.discussionPromptsRestoreBuiltin]: (input) =>
                service.restoreBuiltin(input),
              [WS_METHODS.discussionTemplatesList]: () => service.listTemplates(),
              [WS_METHODS.discussionTemplatesSubscribe]: () => service.subscribeTemplates(),
              [WS_METHODS.discussionTemplatesUpsert]: (input) => service.upsertTemplate(input),
              [WS_METHODS.discussionTemplatesDelete]: (input) => service.deleteTemplate(input),
            }),
          ),
          RpcAuthorization.layer(scopes),
        ),
      ),
    );
  });

describe("discussion template RPC authorization", () => {
  it.effect(
    "read-only connections can list and subscribe but cannot mutate persisted templates",
    () =>
      Effect.gen(function* () {
        const service = yield* DiscussionTemplates.DiscussionTemplateService;
        const builtinId = DiscussionPromptId.make("builtin:persona:architect");
        const { prompt } = yield* service.upsertPrompt({
          kind: "persona",
          name: "权限测试身份",
          prompt: "原始正文。",
        });
        yield* service.upsertPrompt({
          id: builtinId,
          kind: "persona",
          name: "用户定制架构师",
          prompt: "用户定制正文。",
        });
        const templateInput = {
          name: "权限测试配置",
          seats: [
            {
              personaPromptId: builtinId,
              modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5" },
            },
          ],
          summaryPromptId: null,
        };
        const { template } = yield* service.upsertTemplate(templateInput);
        const client = yield* makeDiscussionClient([AuthOrchestrationReadScope]);
        expect((yield* client[WS_METHODS.discussionPromptsList]({})).prompts.length).toBe(7);
        expect(
          (yield* client[WS_METHODS.discussionTemplatesList]({})).templates.map(
            (item) => item.name,
          ),
        ).toEqual(["权限测试配置"]);
        const promptSnapshots = yield* client[WS_METHODS.discussionPromptsSubscribe]({
          kind: "summary",
        }).pipe(Stream.take(1), Stream.runCollect);
        expect(promptSnapshots.map((list) => list.prompts.map((item) => item.name))).toEqual([
          ["默认"],
        ]);
        const templateSnapshots = yield* client[WS_METHODS.discussionTemplatesSubscribe]({}).pipe(
          Stream.take(1),
          Stream.runCollect,
        );
        expect(templateSnapshots.map((list) => list.templates.map((item) => item.name))).toEqual([
          ["权限测试配置"],
        ]);

        const denied = {
          _tag: "EnvironmentAuthorizationError",
          requiredPermission: AuthOrchestrationOperateScope,
        };
        expect(
          yield* client[WS_METHODS.discussionPromptsUpsert]({
            id: prompt.id,
            kind: "persona",
            name: "未经授权修改",
            prompt: "替换正文。",
          }).pipe(Effect.flip),
        ).toMatchObject(denied);
        expect(
          yield* client[WS_METHODS.discussionPromptsDelete]({ id: prompt.id }).pipe(Effect.flip),
        ).toMatchObject(denied);
        expect(
          yield* client[WS_METHODS.discussionPromptsRestoreBuiltin]({ id: builtinId }).pipe(
            Effect.flip,
          ),
        ).toMatchObject(denied);
        expect(
          yield* client[WS_METHODS.discussionTemplatesUpsert]({
            ...templateInput,
            id: template.id,
            name: "未经授权配置",
          }).pipe(Effect.flip),
        ).toMatchObject(denied);
        expect(
          yield* client[WS_METHODS.discussionTemplatesDelete]({ id: template.id }).pipe(
            Effect.flip,
          ),
        ).toMatchObject(denied);

        const { prompts } = yield* client[WS_METHODS.discussionPromptsList]({});
        expect(
          prompts.filter((item) => item.id === prompt.id).map((item) => [item.name, item.prompt]),
        ).toEqual([["权限测试身份", "原始正文。"]]);
        expect(
          prompts.filter((item) => item.id === builtinId).map((item) => [item.name, item.prompt]),
        ).toEqual([["用户定制架构师", "用户定制正文。"]]);
        expect(
          (yield* client[WS_METHODS.discussionTemplatesList]({})).templates.map(
            (item) => item.name,
          ),
        ).toEqual(["权限测试配置"]);
      }).pipe(Effect.provide(discussionLayer), Effect.scoped),
  );

  it.effect("operate connections can create, edit, restore and delete persisted templates", () =>
    Effect.gen(function* () {
      const service = yield* DiscussionTemplates.DiscussionTemplateService;
      const client = yield* makeDiscussionClient([AuthOrchestrationOperateScope]);
      const { prompt } = yield* client[WS_METHODS.discussionPromptsUpsert]({
        kind: "persona",
        name: "可写身份",
        prompt: "初始正文。",
      });
      yield* client[WS_METHODS.discussionPromptsUpsert]({
        id: prompt.id,
        kind: "persona",
        name: "改后的身份",
        prompt: "修改正文。",
      });
      expect(
        (yield* service.listPrompts()).prompts
          .filter((item) => item.id === prompt.id)
          .map((item) => [item.name, item.prompt]),
      ).toEqual([["改后的身份", "修改正文。"]]);
      const builtinId = DiscussionPromptId.make("builtin:persona:architect");
      yield* client[WS_METHODS.discussionPromptsUpsert]({
        id: builtinId,
        kind: "persona",
        name: "定制默认",
        prompt: "改写默认正文。",
      });
      yield* client[WS_METHODS.discussionPromptsRestoreBuiltin]({ id: builtinId });
      expect(
        (yield* service.listPrompts()).prompts.find((item) => item.id === builtinId)?.name,
      ).toBe("架构师");
      const input = {
        name: "可写配置",
        seats: [
          {
            personaPromptId: prompt.id,
            modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5" },
          },
        ],
        summaryPromptId: null,
      };
      const { template } = yield* client[WS_METHODS.discussionTemplatesUpsert](input);
      yield* client[WS_METHODS.discussionTemplatesUpsert]({
        ...input,
        id: template.id,
        name: "改后的配置",
      });
      expect((yield* service.listTemplates()).templates.map((item) => item.name)).toEqual([
        "改后的配置",
      ]);
      yield* client[WS_METHODS.discussionTemplatesDelete]({ id: template.id });
      yield* client[WS_METHODS.discussionPromptsDelete]({ id: prompt.id });
      expect(yield* service.listTemplates()).toEqual({ templates: [] });
      expect((yield* service.listPrompts()).prompts.length).toBe(6);
      expect((yield* service.listPrompts()).prompts.some((item) => item.id === prompt.id)).toBe(
        false,
      );
    }).pipe(Effect.provide(discussionLayer), Effect.scoped),
  );
});

describe("RPC authorization scopes", () => {
  it("declares exactly one scope for every RPC in the server group", () => {
    expect(new Set(Object.keys(RPC_REQUIRED_SCOPES))).toEqual(new Set(WsRpcGroup.requests.keys()));
  });

  it("requires operate access to stop a workflow", () => {
    expect(requiredScopeForRpcMethod(ORCHESTRATION_V2_WS_METHODS.stopWorkflow)).toBe(
      AuthOrchestrationOperateScope,
    );
  });

  it("authorizes background policy reporting and observation deliberately", () => {
    expect(requiredScopeForRpcMethod(WS_METHODS.serverReportClientActivity)).toBe(
      AuthOrchestrationReadScope,
    );
    expect(requiredScopeForRpcMethod(WS_METHODS.serverReportHostPowerState)).toBe(
      AuthEnvironmentMaintainScope,
    );
    expect(requiredScopeForRpcMethod(WS_METHODS.serverGetBackgroundPolicy)).toBe(
      AuthOrchestrationReadScope,
    );
    expect(requiredScopeForRpcMethod(WS_METHODS.subscribeBackgroundPolicy)).toBe(
      AuthOrchestrationReadScope,
    );
  });

  it("keeps webhook delivery logs, which hold request bodies, behind operate scope", () => {
    for (const method of [
      WS_METHODS.scheduledTasksListWebhookDeliveries,
      WS_METHODS.scheduledTasksGetWebhookDelivery,
      WS_METHODS.scheduledTasksRotateWebhookToken,
    ]) {
      expect(requiredScopeForRpcMethod(method)).toBe(AuthOrchestrationOperateScope);
    }
  });

  it("allows relay status reads without granting relay installation access", () => {
    expect(requiredScopeForRpcMethod(WS_METHODS.cloudGetRelayClientStatus)).toBe(
      AuthRelayReadScope,
    );
    expect(requiredScopeForRpcMethod(WS_METHODS.cloudInstallRelayClient)).toBe(AuthRelayWriteScope);
  });

  it("requires permission to operate on a thread before uploading feedback", () => {
    expect(requiredScopeForRpcMethod(WS_METHODS.providerUploadFeedback)).toBe(
      AuthOrchestrationOperateScope,
    );
  });

  it("requires write access to import agent session history", () => {
    expect(requiredScopeForRpcMethod(WS_METHODS.agentSessionsScan)).toBe(
      AuthOrchestrationReadScope,
    );
    expect(requiredScopeForRpcMethod(WS_METHODS.agentSessionsImport)).toBe(
      AuthOrchestrationOperateScope,
    );
  });

  it("separates ACP Registry discovery from provisioning", () => {
    expect(requiredScopeForRpcMethod(WS_METHODS.serverSearchAcpRegistry)).toBe(
      AuthOrchestrationReadScope,
    );
    expect(requiredScopeForRpcMethod(WS_METHODS.serverPrepareAcpRegistryAgent)).toBe(
      AuthProvidersManageScope,
    );
    expect(requiredScopeForRpcMethod(WS_METHODS.serverUninstallAcpRegistryManagedBinary)).toBe(
      AuthProvidersManageScope,
    );
    expect(requiredScopeForRpcMethod(WS_METHODS.serverAcceptAcpRegistryUrlAuth)).toBe(
      AuthProvidersManageScope,
    );
    expect(requiredScopeForRpcMethod(WS_METHODS.serverListAcpRegistrySessions)).toBe(
      AuthOrchestrationReadScope,
    );
    expect(requiredScopeForRpcMethod(WS_METHODS.serverImportAcpRegistrySession)).toBe(
      AuthOrchestrationOperateScope,
    );
    expect(requiredScopeForRpcMethod(WS_METHODS.serverLogoutAcpRegistry)).toBe(
      AuthProvidersManageScope,
    );
  });

  it("reads the reviewer menu under the same scope as the pull request it belongs to", () => {
    // The candidate list is a read like the detail beside it, and asking somebody for a review is
    // a write like every other pull request operation.
    expect(requiredScopeForRpcMethod(WS_METHODS.pullRequestsChecks)).toBe(
      AuthOrchestrationReadScope,
    );
    expect(requiredScopeForRpcMethod(WS_METHODS.pullRequestsReviewerCandidates)).toBe(
      requiredScopeForRpcMethod(WS_METHODS.pullRequestsDetail),
    );
    expect(requiredScopeForRpcMethod(WS_METHODS.pullRequestsRequestReviewers)).toBe(
      requiredScopeForRpcMethod(WS_METHODS.pullRequestsComment),
    );
  });

  it("requires source control writes to start, retry, or cancel project clones", () => {
    for (const method of [
      WS_METHODS.projectCloneStart,
      WS_METHODS.projectCloneRetry,
      WS_METHODS.projectCloneCancel,
    ]) {
      expect(requiredScopeForRpcMethod(method)).toBe(AuthSourceControlWriteScope);
    }
    expect(requiredScopeForRpcMethod(WS_METHODS.subscribeProjectClones)).toBe(
      AuthOrchestrationReadScope,
    );
  });

  it("separates viewing pull request file progress from writing it", () => {
    expect(requiredScopeForRpcMethod(WS_METHODS.pullRequestsFilesViewed)).toBe(
      AuthOrchestrationReadScope,
    );
    expect(requiredScopeForRpcMethod(WS_METHODS.pullRequestsSetFilesViewed)).toBe(
      AuthSourceControlWriteScope,
    );
  });

  it("separates preview control from observation", () => {
    for (const method of [
      WS_METHODS.previewOpen,
      WS_METHODS.previewNavigate,
      WS_METHODS.previewResize,
      WS_METHODS.previewRefresh,
      WS_METHODS.previewClose,
      WS_METHODS.previewReportStatus,
      WS_METHODS.previewAdjust,
      WS_METHODS.previewClearProfile,
      WS_METHODS.previewReportProfiles,
    ]) {
      expect(requiredScopeForRpcMethod(method)).toBe(AuthPreviewOperateScope);
    }
    for (const method of [
      WS_METHODS.previewList,
      WS_METHODS.subscribePreviewEvents,
      WS_METHODS.subscribeDiscoveredLocalServers,
    ]) {
      expect(requiredScopeForRpcMethod(method)).toBe(AuthOrchestrationReadScope);
    }
  });

  it("separates passive terminal observation from operations that can change a shell", () => {
    for (const method of [
      WS_METHODS.terminalObserve,
      WS_METHODS.subscribeTerminalEvents,
      WS_METHODS.subscribeTerminalMetadata,
    ]) {
      expect(requiredScopeForRpcMethod(method)).toBe(AuthTerminalReadScope);
    }
    for (const method of [
      WS_METHODS.terminalAttach,
      WS_METHODS.terminalOpen,
      WS_METHODS.terminalWrite,
      WS_METHODS.terminalResize,
      WS_METHODS.terminalClear,
      WS_METHODS.terminalRestart,
      WS_METHODS.terminalClose,
    ]) {
      expect(requiredScopeForRpcMethod(method)).toBe(AuthTerminalOperateScope);
    }
  });

  it("rejects unknown RPC method names", () => {
    for (const method of ["server.notRegistered", "toString", "constructor"]) {
      expect(() => requiredScopeForRpcMethod(method)).toThrow(
        `RPC method ${method} has no declared authorization scope.`,
      );
    }
  });
});

it("requires operate permission for host retry while preserving read-only listing", () => {
  expect(requiredScopeForDeviceList({})).toBe(AuthOrchestrationReadScope);
  expect(requiredScopeForDeviceList({ retryHostId: "remote-host" })).toBe(
    AuthOrchestrationOperateScope,
  );
});

it("requires operate permission for tool updates even alongside a read-only check", () => {
  expect(requiredScopeForDeviceList({ updateTool: "agent", inspectOnly: true })).toBe(
    AuthOrchestrationOperateScope,
  );
  expect(requiredScopeForDeviceList({ updateTool: "hub" })).toBe(AuthOrchestrationOperateScope);
});

describe("RPC scope middleware", () => {
  const tested = [WS_METHODS.serverProbe, WS_METHODS.serverRetryResourceTelemetry] as const;
  const group = WsRpcGroup.omit(
    ...[...WsRpcGroup.requests.keys()].filter(
      (tag): tag is Exclude<keyof typeof RPC_REQUIRED_SCOPES, (typeof tested)[number]> =>
        !(tested as ReadonlyArray<string>).includes(tag),
    ),
  );

  it.effect.each([
    { scopes: [AuthOrchestrationReadScope], missing: AuthEnvironmentMaintainScope },
    {
      scopes: [AuthOrchestrationReadScope, AuthEnvironmentMaintainScope],
      missing: AuthDiagnosticsReadScope,
    },
    {
      scopes: [AuthOrchestrationReadScope, AuthDiagnosticsReadScope],
      missing: AuthEnvironmentMaintainScope,
    },
  ])("rejects telemetry retry without $missing before its handler runs", ({ scopes, missing }) =>
    Effect.gen(function* () {
      const handled: Array<string> = [];
      const client = yield* RpcTest.makeClient(group).pipe(
        Effect.provide(
          Layer.mergeAll(
            group.toLayerHandler(WS_METHODS.serverProbe, () => Effect.succeed({})),
            group.toLayerHandler(WS_METHODS.serverRetryResourceTelemetry, () =>
              Effect.sync(() => handled.push("retry")).pipe(Effect.andThen(Effect.never)),
            ),
            RpcAuthorization.layer(scopes),
          ),
        ),
      );

      expect(yield* client[WS_METHODS.serverProbe]({})).toEqual({});
      expect(
        yield* client[WS_METHODS.serverRetryResourceTelemetry]({}).pipe(Effect.flip),
      ).toMatchObject({
        _tag: "EnvironmentAuthorizationError",
        requiredPermission: missing,
      });
      expect(handled).toEqual([]);
    }).pipe(Effect.scoped),
  );
});

describe("settings mutation authorization", () => {
  const group = WsRpcGroup.omit(
    ...[...WsRpcGroup.requests.keys()].filter(
      (
        tag,
      ): tag is Exclude<keyof typeof RPC_REQUIRED_SCOPES, typeof WS_METHODS.serverUpdateSettings> =>
        tag !== WS_METHODS.serverUpdateSettings,
    ),
  );
  const providerInstanceMutation = {
    operation: "remove" as const,
    instanceId: ProviderInstanceId.make("codex_work"),
  };

  it.effect("allows provider-only mutations while denying mixed settings without their grant", () =>
    Effect.gen(function* () {
      let handled = 0;
      const client = yield* RpcTest.makeClient(group).pipe(
        Effect.provide(
          Layer.mergeAll(
            group.toLayerHandler(WS_METHODS.serverUpdateSettings, () =>
              Effect.sync(() => {
                handled++;
                return DEFAULT_SERVER_SETTINGS;
              }),
            ),
            RpcAuthorization.layer([AuthProvidersManageScope]),
          ),
        ),
      );
      yield* client[WS_METHODS.serverUpdateSettings]({ patch: {}, providerInstanceMutation });
      expect(handled).toBe(1);
      expect(
        yield* client[WS_METHODS.serverUpdateSettings]({
          patch: { defaultRuntimeMode: "full-access" },
          providerInstanceMutation,
        }).pipe(Effect.flip),
      ).toMatchObject({ requiredPermission: AuthSettingsWriteScope });
      expect(handled).toBe(1);
    }).pipe(Effect.scoped),
  );

  it.effect("does not let a settings grant create or remove providers", () =>
    Effect.gen(function* () {
      let handled = false;
      const client = yield* RpcTest.makeClient(group).pipe(
        Effect.provide(
          Layer.mergeAll(
            group.toLayerHandler(WS_METHODS.serverUpdateSettings, () =>
              Effect.sync(() => {
                handled = true;
                return DEFAULT_SERVER_SETTINGS;
              }),
            ),
            RpcAuthorization.layer([AuthSettingsWriteScope]),
          ),
        ),
      );
      expect(
        yield* client[WS_METHODS.serverUpdateSettings]({
          patch: {},
          providerInstanceMutation,
        }).pipe(Effect.flip),
      ).toMatchObject({ requiredPermission: AuthProvidersManageScope });
      expect(handled).toBe(false);
    }).pipe(Effect.scoped),
  );
});

it.effect("requires task permission before attaching a prepared worktree to a thread", () =>
  Effect.gen(function* () {
    const group = WsRpcGroup.omit(
      ...[...WsRpcGroup.requests.keys()].filter(
        (
          tag,
        ): tag is Exclude<
          keyof typeof RPC_REQUIRED_SCOPES,
          typeof WS_METHODS.gitPreparePullRequestThread
        > => tag !== WS_METHODS.gitPreparePullRequestThread,
      ),
    );
    let handled = false;
    const client = yield* RpcTest.makeClient(group).pipe(
      Effect.provide(
        Layer.mergeAll(
          group.toLayerHandler(WS_METHODS.gitPreparePullRequestThread, () =>
            Effect.sync(() => {
              handled = true;
            }).pipe(Effect.andThen(Effect.never)),
          ),
          RpcAuthorization.layer([AuthSourceControlWriteScope]),
        ),
      ),
    );
    expect(
      yield* client[WS_METHODS.gitPreparePullRequestThread]({
        cwd: "/repo",
        reference: "42",
        mode: "worktree",
        threadId: ThreadId.make("thread"),
      }).pipe(Effect.flip),
    ).toMatchObject({ requiredPermission: AuthOrchestrationOperateScope });
    expect(handled).toBe(false);
  }).pipe(Effect.scoped),
);

it.effect("separates host file URLs from readable attachment URLs", () =>
  Effect.gen(function* () {
    const group = WsRpcGroup.omit(
      ...[...WsRpcGroup.requests.keys()].filter(
        (
          tag,
        ): tag is Exclude<keyof typeof RPC_REQUIRED_SCOPES, typeof WS_METHODS.assetsCreateUrl> =>
          tag !== WS_METHODS.assetsCreateUrl,
      ),
    );
    let handled = 0;
    const client = yield* RpcTest.makeClient(group).pipe(
      Effect.provide(
        Layer.mergeAll(
          group.toLayerHandler(WS_METHODS.assetsCreateUrl, () =>
            Effect.sync(() => {
              handled++;
              return { relativeUrl: "/api/assets/file", expiresAt: 1 };
            }),
          ),
          RpcAuthorization.layer([AuthOrchestrationReadScope]),
        ),
      ),
    );
    yield* client[WS_METHODS.assetsCreateUrl]({
      resource: { _tag: "attachment", attachmentId: "image" },
    });
    for (const resource of [
      { _tag: "workspace-file", threadId: ThreadId.make("thread"), path: "file.txt" },
      { _tag: "media-file", threadId: ThreadId.make("thread"), path: "/repo/image.png" },
      { _tag: "draft-workspace-file", cwd: "/repo", path: "file.txt" },
    ] as const) {
      expect(
        yield* client[WS_METHODS.assetsCreateUrl]({ resource }).pipe(Effect.flip),
      ).toMatchObject({
        requiredScope: AuthOrchestrationReadScope,
        requiredPermission: AuthFilesystemReadScope,
      });
    }
    expect(handled).toBe(1);
  }).pipe(Effect.scoped),
);

it.effect("denies manual cleanup before the handler without settings permission", () =>
  Effect.gen(function* () {
    const group = WsRpcGroup.omit(
      ...[...WsRpcGroup.requests.keys()].filter(
        (
          tag,
        ): tag is Exclude<
          keyof typeof RPC_REQUIRED_SCOPES,
          typeof WS_METHODS.serverRunStorageCleanup
        > => tag !== WS_METHODS.serverRunStorageCleanup,
      ),
    );
    let handled = false;
    const client = yield* RpcTest.makeClient(group).pipe(
      Effect.provide(
        Layer.mergeAll(
          group.toLayerHandler(WS_METHODS.serverRunStorageCleanup, () =>
            Effect.sync(() => {
              handled = true;
              return {
                trigger: "manual" as const,
                startedAt: "2026-10-09T12:00:00.000Z",
                finishedAt: "2026-10-09T12:00:00.000Z",
                entries: [],
                counts: { removed: 0, kept: 0, failed: 0 },
                omittedCount: 0,
                bytesFreed: 0,
              };
            }),
          ),
          RpcAuthorization.layer([AuthOrchestrationReadScope]),
        ),
      ),
    );
    expect(yield* client[WS_METHODS.serverRunStorageCleanup]({}).pipe(Effect.flip)).toMatchObject({
      requiredPermission: AuthSettingsWriteScope,
    });
    expect(handled).toBe(false);
  }).pipe(Effect.scoped),
);
