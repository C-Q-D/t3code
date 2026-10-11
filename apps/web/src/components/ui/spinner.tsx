/** Renders shared loading indicators with accessible localized text. */
import { t } from "~/i18n";
import { LoaderCircleIcon } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";
import { observeVisibleAnimation } from "~/lib/visibleAnimation";
import { cn } from "~/lib/utils";

// No default size: inside a Button the parent's svg rule sizes the glyph.
const spinnerVariants = cva("motion-safe:visible-animate-spin", {
  variants: {
    size: {
      xs: "size-3",
      sm: "size-3.5",
      md: "size-4",
      lg: "size-5",
    },
    tone: {
      current: "",
      muted: "text-muted-foreground",
    },
  },
  defaultVariants: { tone: "current" },
});

/** Renders a loading indicator with an accessible label; size, tone, className, and remaining SVG props control presentation. */
function Spinner({
  className,
  size,
  tone,
  ...props
}: React.ComponentPropsWithoutRef<typeof LoaderCircleIcon> & VariantProps<typeof spinnerVariants>) {
  return (
    <LoaderCircleIcon
      aria-label={t.app.actions.loading}
      ref={observeVisibleAnimation}
      className={cn(spinnerVariants({ size, tone }), className)}
      role="status"
      {...props}
    />
  );
}

export { Spinner };
