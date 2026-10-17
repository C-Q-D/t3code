/** Generates QR vectors; optional presentation variants do not change the encoded payload. */
import { memo } from "react";
import { cn } from "~/lib/utils";
import { QrCode } from "@t3tools/shared/qrCode";

/** QR payload, geometry, error correction and explicit high-contrast colors. */
type QRCodeSvgProps = {
  variant?: "default" | "settings";
  value: string;
  size?: number;
  level?: "L" | "M" | "Q" | "H";
  marginSize?: number;
  title?: string;
  className?: string;
  foregroundColor?: string;
  backgroundColor?: string;
};

const ERROR_CORRECTION_LEVELS = {
  L: QrCode.Ecc.LOW,
  M: QrCode.Ecc.MEDIUM,
  Q: QrCode.Ecc.QUARTILE,
  H: QrCode.Ecc.HIGH,
} as const;

/** Compresses horizontal runs into SVG path commands; marginSize is the quiet zone in QR modules. */
function buildQrPathData(qrCode: ReturnType<typeof QrCode.encodeText>, marginSize: number): string {
  const commands: Array<string> = [];

  for (let y = 0; y < qrCode.size; y += 1) {
    let runStart = -1;

    for (let x = 0; x <= qrCode.size; x += 1) {
      const isDark = x < qrCode.size && qrCode.getModule(x, y);

      if (isDark) {
        if (runStart === -1) {
          runStart = x;
        }
        continue;
      }

      if (runStart === -1) {
        continue;
      }

      commands.push(
        `M${runStart + marginSize} ${y + marginSize}h${x - runStart}v1H${runStart + marginSize}z`,
      );
      runStart = -1;
    }
  }

  return commands.join("");
}

/** Renders an encoded QR image; settings adds the shared raised tile while preserving color and size defaults. */
export const QRCodeSvg = memo(function QRCodeSvg({
  variant = "default",
  value,
  size = 128,
  level = "L",
  marginSize = 0,
  title,
  className,
  foregroundColor = "#000",
  backgroundColor = "#fff",
}: QRCodeSvgProps) {
  const qrCode = QrCode.encodeText(value, ERROR_CORRECTION_LEVELS[level]);
  const viewBoxSize = qrCode.size + marginSize * 2;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      role={title ? "img" : undefined}
      aria-label={title}
      className={cn(
        // SettingsPage8a P2: shared 132px pairing tile, also used in the manual-copy dialog.
        variant === "settings" &&
          "rounded-settings-row-surface bg-primary p-2 text-shadow-none shadow-connections-qr",
        className,
      )}
    >
      {title ? <title>{title}</title> : null}
      <rect width={viewBoxSize} height={viewBoxSize} fill={backgroundColor} />
      <path d={buildQrPathData(qrCode, marginSize)} fill={foregroundColor} />
    </svg>
  );
});
