/** Checks worker copy localization while preserving external diagnostic details. */
import { expect, it } from "vite-plus/test";
import { installMessages } from "~/i18n";
import { en } from "~/i18n/locales/en";
import { messages } from "~/i18n/locales/zh-CN";
import { localizeFilePreviewError } from "./filePreviewErrors";

it("uses the current language for worker errors and preserves external errors", () => {
  try {
    installMessages("en", en);
    expect(localizeFilePreviewError("Could not preview this file.")).toBe(
      "Could not preview this file.",
    );
    installMessages("zh-CN", messages);
    expect(localizeFilePreviewError("Could not preview this file.")).toBe("无法预览此文件。");
    expect(localizeFilePreviewError("Invalid TIFF metadata.")).toBe("TIFF 元数据无效。");
    expect(localizeFilePreviewError("Library failure: object 42")).toBe(
      "Library failure: object 42",
    );
  } finally {
    installMessages("en", en);
  }
});
