/** Shared theme preview data and command-palette orb, plus compact appearance-card swatches. */
import { t } from "~/i18n";
import type { CSSProperties } from "react";
import {
  STANDARD_THEME_PREVIEW_COLORS as SHARED_STANDARD_THEME_PREVIEW_COLORS,
  THEME_PREVIEW_RENDER_SPECS,
} from "@t3tools/shared/themePreview";
import { cn } from "../../lib/utils";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import {
  getThemeColorsForMode,
  getThemeModes,
  type ThemeAppearance,
  type ThemeDefinition,
} from "../../themePalette";

const THEME_PREVIEW_ROLES = [
  "sidebar",
  "canvas",
  "surface",
  "accentSurface",
  "accent",
  "messageSurface",
  "messageAction",
] as const;
type ThemePreviewRole = (typeof THEME_PREVIEW_ROLES)[number];
type ThemeCardPreview = {
  mode: ThemeAppearance;
  colors: Readonly<Record<ThemePreviewRole, string>>;
};
export type ThemeCardDefinition = {
  id: string;
  label: string;
  previews: ReadonlyArray<ThemeCardPreview>;
};
export type ThemeMode = ThemeAppearance | "system";
export type ThemeCardPreviewColors = ThemeCardPreview["colors"];

const STANDARD_THEME_PREVIEW_COLORS: Record<
  ThemeAppearance,
  Readonly<Record<ThemePreviewRole, string>>
> = {
  light: {
    sidebar: "#fafafa",
    surface: "#ffffff",
    accentSurface: "#f4f4f5",
    messageSurface: "#e4e4e7",
    ...SHARED_STANDARD_THEME_PREVIEW_COLORS.light,
  },
  dark: {
    sidebar: "#0f0f10",
    surface: "#121212",
    accentSurface: "#27272a",
    messageSurface: "#27272a",
    ...SHARED_STANDARD_THEME_PREVIEW_COLORS.dark,
  },
};

export const STANDARD_THEME_CARDS: ReadonlyArray<ThemeCardDefinition> = [
  {
    id: "default",
    label: "T3 Code",
    previews: (["light", "dark"] as const).map((mode) => ({
      mode,
      colors: STANDARD_THEME_PREVIEW_COLORS[mode],
    })),
  },
];

export function getThemeCardDefinition(theme: ThemeDefinition): ThemeCardDefinition {
  return {
    id: theme.id,
    label: theme.label,
    previews: getThemeModes(theme).map((mode) => {
      const colors = getThemeColorsForMode(theme, mode) ?? theme.colors;
      return {
        mode,
        colors: {
          sidebar: colors.sidebar,
          canvas: colors.canvas,
          surface: colors.surface,
          accentSurface: colors.accentSurface,
          accent: colors.accent,
          messageSurface: colors.messageSurface,
          messageAction: colors.messageAction,
        },
      };
    }),
  };
}

function getThemePreviewStyle(
  colors: ThemeCardPreviewColors,
  mode: ThemeAppearance,
): CSSProperties {
  const spec = THEME_PREVIEW_RENDER_SPECS[mode];
  const modeBase = `color-mix(in oklab, ${colors.canvas} ${spec.baseWeight * 100}%, ${spec.baseTarget})`;
  const accentPosition = `${spec.accent.center[0] * 100}% ${spec.accent.center[1] * 100}%`;
  const actionPosition = `${spec.action.center[0] * 100}% ${spec.action.center[1] * 100}%`;
  return {
    backgroundColor: modeBase,
    backgroundImage: [
      `radial-gradient(circle at ${accentPosition} in oklab, ${colors.accent} 0%, color-mix(in oklab, ${colors.accent} ${spec.accent.middleOpacity * 100}%, transparent) ${spec.accent.middleOffset * 100}%, transparent ${spec.accent.endOffset * 100}%)`,
      `radial-gradient(circle at ${actionPosition} in oklab, color-mix(in oklab, ${colors.messageAction} ${spec.action.startOpacity * 100}%, transparent) 0%, transparent ${spec.action.endOffset * 100}%)`,
    ].join(", "),
  };
}

function themePreviewEdgeShadow(mode: ThemeAppearance): string {
  return mode === "dark"
    ? "inset 0 0 0 1px rgb(255 255 255 / 0.14), 0 1px 2px rgb(0 0 0 / 0.18)"
    : "inset 0 0 0 1px rgb(0 0 0 / 0.10), 0 1px 2px rgb(0 0 0 / 0.08)";
}

export function ThemePreviewCircle({
  colors,
  mode,
  className,
}: {
  colors: ThemeCardPreviewColors;
  mode: ThemeAppearance;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "relative block size-14 shrink-0 overflow-hidden rounded-full border-2 border-background",
        className,
      )}
      style={{ boxShadow: themePreviewEdgeShadow(mode) }}
    >
      <span
        className="absolute inset-0 rounded-full"
        style={{
          ...getThemePreviewStyle(colors, mode),
          filter: `blur(${THEME_PREVIEW_RENDER_SPECS[mode].blurAt56Px}px)`,
          transform: `scale(${THEME_PREVIEW_RENDER_SPECS[mode].scale})`,
        }}
      />
    </span>
  );
}

/**
 * M3 palette dots retain the existing per-appearance assignment action.
 * Runtime colors come from the installed theme, never from design sample palettes.
 */
export function ThemePreviewCircles({
  label,
  activeModes,
  onSelectMode,
  previews,
}: {
  label: string;
  activeModes: ReadonlyArray<ThemeMode>;
  onSelectMode: (mode: ThemeMode) => void;
  previews: ThemeCardDefinition["previews"];
}) {
  return (
    <div className="flex min-w-0 items-center gap-1">
      {previews.map((preview) => (
        <Tooltip key={preview.mode}>
          <TooltipTrigger
            render={
              <button
                type="button"
                aria-label={t.settings.themePreviewCircles.applyMode(label, preview.mode)}
                aria-pressed={activeModes.includes(preview.mode)}
                className={cn(
                  "flex h-6 cursor-pointer items-center gap-1 rounded-full outline-none focus-visible:inset-shadow-focus",
                  activeModes.includes(preview.mode) && "inset-shadow-selected-control",
                )}
                onClick={() => onSelectMode(preview.mode)}
              >
                <span
                  aria-hidden
                  className="size-3 rounded-full shadow-settings-theme-dot"
                  style={{ backgroundColor: preview.colors.canvas }}
                />
                {previews.length === 1 ? (
                  <span
                    aria-hidden
                    className="size-3 rounded-full shadow-settings-theme-dot"
                    style={{ backgroundColor: preview.colors.messageSurface }}
                  />
                ) : null}
                <span
                  aria-hidden
                  className="size-3 rounded-full shadow-settings-theme-dot"
                  style={{ backgroundColor: preview.colors.accent }}
                />
                {previews.length === 1 ? (
                  <span
                    aria-hidden
                    className="size-3 rounded-full shadow-settings-theme-dot"
                    style={{ backgroundColor: preview.colors.messageAction }}
                  />
                ) : null}
              </button>
            }
          />
          <TooltipPopup>
            {preview.mode === "light"
              ? t.settings.themePreviewCircles.applyLightModeOnly
              : t.settings.themePreviewCircles.applyDarkModeOnly}
          </TooltipPopup>
        </Tooltip>
      ))}
    </div>
  );
}
