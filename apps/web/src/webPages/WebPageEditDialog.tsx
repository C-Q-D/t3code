/** Edits a saved launch target; the caller owns persistence and runtime navigation. */
import { WEB_PAGE_NAME_MAX_LENGTH, type WebPageEntry } from "@t3tools/contracts";
import { useId, useState } from "react";
import { Button } from "../components/ui/button";
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogPanel,
  DialogFooter,
} from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { t } from "../i18n";
import { normalizeWebPageUrl } from "./webPageEntries";

/** Mount per edit session; an absent entry creates a page and false from onSave leaves it open. */
export function WebPageEditDialog({
  entry,
  onSave,
  onClose,
}: {
  entry?: WebPageEntry;
  onSave: (input: { url: string; name: string }) => boolean;
  onClose: () => void;
}) {
  const id = useId();
  const [url, setUrl] = useState(entry?.url ?? "");
  const [name, setName] = useState(entry?.name ?? "");
  const [invalid, setInvalid] = useState(false);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogPopup showCloseButton={false}>
        <form
          className="flex min-h-0 flex-col"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            const normalized = normalizeWebPageUrl(url);
            if (!normalized || !onSave({ url: normalized, name: name.trim() })) {
              setInvalid(true);
              return;
            }
            onClose();
          }}
        >
          <DialogHeader>
            <DialogTitle>{entry ? t.webPages.editPage : t.webPages.addPage}</DialogTitle>
          </DialogHeader>
          <DialogPanel>
            <div className="space-y-2">
              <label htmlFor={`${id}-url`}>{t.webPages.url}</label>
              <Input
                id={`${id}-url`}
                required
                aria-invalid={invalid}
                aria-describedby={invalid ? `${id}-error` : undefined}
                value={url}
                onChange={(event) => {
                  setUrl(event.target.value);
                  setInvalid(false);
                }}
                placeholder={t.webPages.urlPlaceholder}
              />
              {invalid ? (
                <p
                  id={`${id}-error`}
                  role="alert"
                  className="text-error-foreground text-secondary-copy"
                >
                  {t.webPages.invalidUrl}
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <label htmlFor={`${id}-name`}>{t.webPages.name}</label>
              <Input
                id={`${id}-name`}
                maxLength={WEB_PAGE_NAME_MAX_LENGTH}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t.webPages.namePlaceholder}
              />
            </div>
          </DialogPanel>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {t.webPages.cancel}
            </Button>
            <Button type="submit">{t.webPages.save}</Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
