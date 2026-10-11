/** Localized media presentation and existing interaction behavior. */
import { t } from "~/i18n";
/** Resolves web references without inheriting the desktop renderer's custom app scheme. */
export function resolveProtocolRelativeMediaUrl(src: string): string {
  if (!src.startsWith("//")) return src;
  const protocol =
    typeof window !== "undefined" && window.location.protocol === "http:" ? "http:" : "https:";
  return `${protocol}${src}`;
}

/** Reads media only for an explicit save/copy action; remote hosts must allow browser CORS. */
async function readMediaBlob(src: string): Promise<Blob> {
  let response: Response;
  try {
    response = await fetch(src);
  } catch (cause) {
    throw new Error(t.tools.media.fetchFailed, { cause });
  }
  if (!response.ok) throw new Error(t.tools.media.httpError(response.status));
  const blob = await response.blob();
  if (blob.type.split(";", 1)[0] === "text/html") {
    throw new Error(t.tools.media.pageInstead);
  }
  return blob;
}

/** Downloads the original bytes with their original filename, without changing playback URLs. */
export async function downloadMedia(src: string, name: string): Promise<void> {
  const url = URL.createObjectURL(await readMediaBlob(src));
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    anchor.click();
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
}

/** Converts browser-decodable images, including SVG, into the clipboard's portable PNG format. */
export async function readMediaPng(src: string): Promise<Blob> {
  const blob = await readMediaBlob(src);
  if (blob.type.split(";", 1)[0] === "image/png") return blob;

  const url = URL.createObjectURL(blob);
  const image = new Image();
  image.src = url;
  try {
    try {
      await image.decode();
    } catch (cause) {
      throw new Error(t.tools.media.decodeFailed, {
        cause,
      });
    }
    const { naturalWidth: width, naturalHeight: height } = image;
    if (width <= 0 || height <= 0 || width * height > 64_000_000) {
      throw new Error(t.tools.media.imageTooLarge);
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error(t.tools.media.copyUnavailable);
    context.drawImage(image, 0, 0);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (png) => (png ? resolve(png) : reject(new Error(t.tools.media.conversionFailed))),
        "image/png",
      );
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
