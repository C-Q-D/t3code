import { localizeFilePreviewError } from "./filePreviewErrors";
import { t } from "~/i18n";
/* oxlint-disable react/no-array-index-key -- Spreadsheet rows and columns retain their source positions. */
import { formatAttachmentSize } from "@t3tools/client-runtime/state/attachments";
import type { OfficePreviewKind } from "@t3tools/shared/filePreview";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";

import VirtualTablePreview from "./VirtualTablePreview";

import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";

import { FileSurfaceAction, FileSurfaceLoading, FileSurfaceNotice } from "./fileSurfaceChrome";
import { OFFICE_PREVIEW_MAX_BYTES, type OfficeWorkerResult } from "./officePreviewProtocol";

const DocumentPages = lazy(() => import("./DocumentPages"));
const NotebookPreview = lazy(() => import("./NotebookPreview"));

type Workbook = Extract<OfficeWorkerResult, { type: "ods" }>;

const OpenXmlOfficeViewer = lazy(() => import("./OpenXmlOfficeViewer"));

async function readOfficeFile(src: string, signal: AbortSignal) {
  const response = await fetch(src, { signal });
  if (!response.ok) throw new Error(t.tools.filePreview.fileLoadFailed);
  if (Number(response.headers.get("content-length")) > OFFICE_PREVIEW_MAX_BYTES)
    throw new Error(t.tools.filePreview.officeLimit);
  const reader = response.body?.getReader();
  if (!reader) throw new Error(t.tools.filePreview.unavailable);
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > OFFICE_PREVIEW_MAX_BYTES) throw new Error(t.tools.filePreview.officeLimit);
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  return new Blob(chunks).arrayBuffer();
}

export default function OfficeViewer(props: {
  readonly src: string;
  readonly name: string;
  readonly kind: OfficePreviewKind;
  readonly sizeBytes?: number;
}) {
  if (props.kind === "docx" || props.kind === "xlsx" || props.kind === "pptx")
    return (
      <Suspense fallback={<FileSurfaceLoading />}>
        <OpenXmlOfficeViewer {...props} kind={props.kind} />
      </Suspense>
    );
  return <ExtendedOfficeViewer {...props} />;
}

function ExtendedOfficeViewer(props: {
  readonly src: string;
  readonly name: string;
  readonly kind: OfficePreviewKind;
  readonly sizeBytes?: number;
}) {
  const [error, setError] = useState<string | null>(null);
  const [sheetPages, setSheetPages] = useState(new Map<string, string[][]>());
  const pendingPages = useRef(new Set<string>());
  const [previewDocument, setDocument] = useState<Extract<
    OfficeWorkerResult,
    { type: "document" }
  > | null>(null);
  const [notebook, setNotebook] = useState<Extract<
    OfficeWorkerResult,
    { type: "notebook" }
  > | null>(null);
  const [workbook, setWorkbook] = useState<Workbook | null>(null);
  const [count, setCount] = useState(0);
  const [fileSize, setFileSize] = useState(props.sizeBytes);
  const [page, setPage] = useState(0);
  const workerRef = useRef<Worker | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- Own the Office fetch, preparation worker, and timeout for this source and release them on cleanup.
  useEffect(() => {
    const controller = new AbortController();
    if ((props.sizeBytes ?? 0) > OFFICE_PREVIEW_MAX_BYTES) {
      // oxlint-disable-next-line react/set-state-in-effect -- The file metadata can reject the preview before loading bytes or engines.
      setError(t.tools.filePreview.officeLimit);
      return;
    }
    const worker = new Worker(new URL("./officePreview.worker.ts", import.meta.url), {
      type: "module",
    });
    workerRef.current = worker;
    const fail = (message: string) => {
      if (!controller.signal.aborted) setError(message);
      controller.abort();
      worker.terminate();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    timerRef.current = setTimeout(() => fail(t.tools.filePreview.officeTimeout), 30_000);
    worker.addEventListener("error", () => fail(t.tools.filePreview.officeLoadFailed));
    worker.addEventListener("message", (event: MessageEvent<OfficeWorkerResult>) => {
      if (controller.signal.aborted) return;
      const result = event.data;
      if (result.type === "error") fail(result.message);
      else if (result.type === "document") {
        if (timerRef.current) clearTimeout(timerRef.current);
        setDocument(result);
        setCount(result.pages.length > 1 ? result.pages.length : 0);
      } else if (result.type === "notebook") {
        if (timerRef.current) clearTimeout(timerRef.current);
        setNotebook(result);
      } else if (result.type === "ods") {
        if (timerRef.current) clearTimeout(timerRef.current);
        setWorkbook(result);
        setCount(result.sheets.length);
      } else if (result.type === "sheet-page") {
        const key = `${result.sheet}:${result.index}`;
        pendingPages.current.delete(key);
        setSheetPages((old) => {
          const next = new Map(old);
          next.set(key, result.rows);
          if (next.size > 12) next.delete(next.keys().next().value!);
          return next;
        });
      }
    });
    void readOfficeFile(props.src, controller.signal)
      .then((bytes) => {
        if (!controller.signal.aborted) {
          setFileSize(bytes.byteLength);
          worker.postMessage({ type: "open", kind: props.kind, bytes }, [bytes]);
        }
      })
      .catch((cause: unknown) =>
        fail(cause instanceof Error ? cause.message : t.tools.filePreview.readFailed),
      );
    return () => {
      controller.abort();
      worker.terminate();
      workerRef.current = null;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [props.src, props.kind, props.sizeBytes]);
  const selectPage = setPage;
  if (error)
    return (
      <div
        role="alert"
        className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1 px-6 text-center"
      >
        <p className="text-sm font-medium">{t.tools.filePreview.noPreview}</p>
        <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
          {localizeFilePreviewError(error)} {t.tools.filePreview.saveOfficeHint}
        </p>
      </div>
    );
  if (notebook)
    return (
      <Suspense fallback={<FileSurfaceLoading />}>
        <NotebookPreview notebook={notebook} sizeBytes={fileSize} />
      </Suspense>
    );
  const sheet = workbook?.sheets[page];
  const documentPage = previewDocument?.pages[page];
  const navigation = workbook ? "sheet" : (previewDocument?.navigation ?? "slide");
  const documentCount = previewDocument?.pages.length ?? 0;
  const documentDetails =
    navigation === "chapter"
      ? t.tools.officeNavigation.chapterCount(page + 1, documentCount)
      : t.tools.officeNavigation.count(documentCount, navigation);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {count > 0 ? (
        <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border/60 px-3 text-xs">
          <FileSurfaceAction
            label={t.tools.officeNavigation.previous(navigation)}
            disabled={page === 0}
            onPress={() => selectPage(page - 1)}
          >
            <ChevronLeftIcon className="size-3.5" />
          </FileSurfaceAction>
          {workbook ? (
            <div className="min-w-0 flex-1">
              <Select
                value={page}
                onValueChange={(value) => {
                  if (value !== null) selectPage(value);
                }}
              >
                <SelectTrigger aria-label={t.tools.filePreview.sheet} size="xs">
                  <SelectValue>{sheet?.name}</SelectValue>
                </SelectTrigger>
                <SelectPopup>
                  {workbook.sheets.map((item, index) => (
                    <SelectItem key={index} value={index}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            </div>
          ) : previewDocument?.navigation === "chapter" ? (
            <div className="min-w-0 flex-1">
              <Select
                value={page}
                onValueChange={(value) => {
                  if (value !== null) selectPage(value);
                }}
              >
                <SelectTrigger aria-label={t.tools.filePreview.chapter} size="xs">
                  <SelectValue>
                    {documentPage &&
                      (documentPage.generatedTitle
                        ? t.tools.filePreview.pageNumber(page + 1)
                        : documentPage.title)}
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup>
                  {previewDocument.pages.map((item, index) => (
                    <SelectItem key={index} value={index}>
                      {item.generatedTitle ? t.tools.filePreview.pageNumber(index + 1) : item.title}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
            </div>
          ) : (
            <span className="flex-1 text-center tabular-nums" aria-live="polite">
              {t.tools.officeNavigation.position(navigation, page + 1, count)}
            </span>
          )}
          <FileSurfaceAction
            label={t.tools.officeNavigation.next(navigation)}
            disabled={page + 1 === count}
            onPress={() => selectPage(page + 1)}
          >
            <ChevronRightIcon className="size-3.5" />
          </FileSurfaceAction>
        </div>
      ) : null}
      {props.kind === "ods" && sheet ? (
        <div
          className="flex min-h-10 shrink-0 flex-wrap items-center gap-x-1 border-b border-border/60 px-3 py-2 text-xs text-muted-foreground tabular-nums"
          role="status"
        >
          {t.tools.officeNavigation.sheetDetails(
            page + 1,
            count,
            sheet.rowCount.toLocaleString(),
            sheet.columns.toLocaleString(),
          )}
          {fileSize !== undefined
            ? ` · ${fileSize === 0 ? t.tools.filePreview.zeroBytes : formatAttachmentSize(fileSize)}`
            : ""}
        </div>
      ) : null}
      {documentPage ? (
        <>
          {props.kind !== "epub" ? (
            <FileSurfaceNotice>{t.tools.filePreview.officeNotice}</FileSurfaceNotice>
          ) : null}
          <Suspense fallback={<FileSurfaceLoading />}>
            <DocumentPages
              html={documentPage.html}
              name={`${props.name}: ${documentPage.generatedTitle ? t.tools.filePreview.pageNumber(page + 1) : documentPage.title}`}
              details={`${documentDetails}${fileSize !== undefined ? ` · ${fileSize === 0 ? t.tools.filePreview.zeroBytes : formatAttachmentSize(fileSize)}` : ""}`}
            />
          </Suspense>
        </>
      ) : sheet ? (
        <>
          <FileSurfaceNotice>
            {t.tools.filePreview.sheetNotice}
            {sheet.truncated
              ? props.kind === "ods"
                ? t.tools.filePreview.odsLimit
                : t.tools.filePreview.sheetLimit
              : ""}
          </FileSurfaceNotice>
          {sheet.rowCount === 0 ? (
            <p className="p-6 text-xs text-muted-foreground">{t.tools.filePreview.emptySheet}</p>
          ) : (
            <VirtualTablePreview
              key={page}
              name={`${props.name}: ${sheet.name}`}
              count={sheet.rowCount}
              columns={sheet.columns}
              getRows={(index) => (index === 0 ? sheet.rows : sheetPages.get(`${page}:${index}`))}
              loadPage={(index) => {
                const key = `${page}:${index}`;
                if (pendingPages.current.has(key)) return;
                pendingPages.current.add(key);
                workerRef.current?.postMessage({ type: "sheet-page", sheet: page, index });
              }}
            />
          )}
        </>
      ) : (
        <FileSurfaceLoading />
      )}
    </div>
  );
}
