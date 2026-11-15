import {
  type AuthEnvironmentScope,
  EnvironmentAuthorizationError,
  authScopeRequiredResponse,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";

// Internal callers use the server's authority; RPC middleware supplies the destination token's grants.
export class OperationScopes extends Context.Reference<
  ReadonlyArray<AuthEnvironmentScope> | undefined
>("t3/auth/OperationScopes", { defaultValue: () => undefined }) {}

export const requireOperationScope = Effect.fn("OperationScopes.require")(function* (
  scope: AuthEnvironmentScope,
) {
  const scopes = yield* OperationScopes;
  if (scopes !== undefined && !scopes.includes(scope)) {
    return yield* new EnvironmentAuthorizationError({
      message: `The authenticated token is missing required scope: ${scope}.`,
      ...authScopeRequiredResponse(scope),
    });
  }
});
