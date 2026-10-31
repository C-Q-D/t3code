/** Applies local Cursor field labels to the shared provider registry. */
import { t } from "~/i18n";
import { providerClients as sharedProviderClients } from "@t3tools/client-runtime/provider-clients";
import { makeProviderClientRegistry } from "@t3tools/provider-core/client";

export const providerClients = makeProviderClientRegistry(
  sharedProviderClients.definitions.map((definition) =>
    definition.driverKind === "cursor" && definition.environmentFields !== undefined
      ? {
          ...definition,
          environmentFields: definition.environmentFields.map((field) =>
            field.name === "CURSOR_API_KEY"
              ? {
                  ...field,
                  label: t.settings.providerDriverMeta.cursorApiKey,
                  description:
                    t.settings.providerDriverMeta.optionalOverridesBrowserSignProviderHint,
                  placeholder: t.settings.providerDriverMeta.pasteApiKey,
                }
              : field,
          ),
        }
      : definition,
  ),
);
