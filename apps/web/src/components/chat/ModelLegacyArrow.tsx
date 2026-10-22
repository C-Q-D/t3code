/** Legacy disclosure rotation shares the user's motion preference and preserves interrupted momentum. */
import { useLayoutEffect, useRef } from "react";
import { ChevronRightIcon } from "lucide-react";
import { TOKENS } from "~/lib/motion/tokens";
import { createModelPickerSpring } from "./modelPickerSpring";

/** Mount at the saved angle; only subsequent disclosure changes animate. */
export function ModelLegacyArrow({ expanded }: { expanded: boolean }) {
  const ref = useRef<SVGSVGElement>(null);
  const spring = useRef<ReturnType<typeof createModelPickerSpring> | null>(null);
  useLayoutEffect(() => {
    const element = ref.current!;
    spring.current = createModelPickerSpring(element, "rotate", TOKENS.snap);
    return () => {
      spring.current?.dispose();
      spring.current = null;
    };
  }, []);
  useLayoutEffect(() => {
    const element = ref.current!;
    const motion = spring.current!;
    const mounted = element.style.rotate !== "";
    const from = motion.sample();
    const to = expanded ? 90 : 0;
    element.style.rotate = `${to}deg`;
    if (mounted) motion.move(to, from);
  }, [expanded]);
  return <ChevronRightIcon ref={ref} className="size-4" />;
}
