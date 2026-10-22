/** Favorite paint follows saved state; transient feedback belongs only to an activating click. */
import { useEffect, useId, useRef } from "react";
import { StarIcon } from "lucide-react";
import { t } from "~/i18n";
import { isPhysicsEnabled, onPhysicsChange } from "~/lib/motion/preference";
import { springToLinear } from "~/lib/motion/springToLinear";
import { TOKENS } from "~/lib/motion/tokens";
import { useStableCallback } from "~/hooks/useStableCallback";
import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

const FAVORITE_SPRING = springToLinear(TOKENS.jolt);

/** Owns click feedback and its cleanup; the caller owns persistence and supplies a model identity key. */
export function ModelFavoriteButton({
  isFavorite,
  disabled,
  onToggle,
}: {
  isFavorite: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const gradientId = useId();
  const starRef = useRef<SVGSVGElement>(null);
  const feedbackRef = useRef<{ animations: Animation[]; layer: HTMLSpanElement } | null>(null);
  const stopFeedback = useStableCallback(() => {
    const feedback = feedbackRef.current;
    feedbackRef.current = null;
    feedback?.layer.remove();
    for (const animation of feedback?.animations ?? []) animation.cancel();
  });
  useEffect(() => {
    const unsubscribe = onPhysicsChange((enabled) => {
      if (!enabled) stopFeedback();
    });
    return () => {
      unsubscribe();
      stopFeedback();
    };
  }, [stopFeedback]);
  useEffect(() => {
    if (!isFavorite) stopFeedback();
  }, [isFavorite, stopFeedback]);

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            size="icon-xs"
            variant="ghost-muted"
            className="-mr-1 shrink-0"
            data-model-favorite={isFavorite}
            disabled={disabled}
            aria-label={
              isFavorite
                ? t.composer.modelPicker.removeFavorite
                : t.composer.modelPicker.addFavorite
            }
            onKeyDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              stopFeedback();
              const star = starRef.current;
              if (!isFavorite && isPhysicsEnabled() && star) {
                // An imperative, temporary layer cannot be replayed by prop updates or row recycling.
                const layer = document.createElement("span");
                layer.className = "composer-model-favorite-particles";
                layer.setAttribute("aria-hidden", "true");
                event.currentTarget.append(layer);
                const animations = [
                  star.animate([{ transform: "scale(0.55)" }, { transform: "scale(1)" }], {
                    duration: FAVORITE_SPRING.durationMs,
                    easing: FAVORITE_SPRING.easing,
                  }),
                ];
                for (let index = 0; index < 6; index++) {
                  const particle = document.createElement("span");
                  particle.className = "composer-model-favorite-particle";
                  layer.append(particle);
                  const angle = ((-90 + index * 60) * Math.PI) / 180;
                  animations.push(
                    particle.animate(
                      [
                        { transform: "translate(0px, 0px) scale(1)", opacity: 1 },
                        {
                          transform: `translate(${Math.cos(angle) * 14}px, ${Math.sin(angle) * 14}px) scale(0)`,
                          opacity: 0,
                        },
                      ],
                      { duration: 520, easing: "ease-out", fill: "forwards" },
                    ),
                  );
                }
                const feedback = { animations, layer };
                feedbackRef.current = feedback;
                const finish = () => {
                  // Canceled feedback may settle after a newer click has already started.
                  if (feedbackRef.current === feedback) stopFeedback();
                };
                void Promise.all(animations.map((animation) => animation.finished)).then(
                  finish,
                  finish,
                );
              }
              onToggle();
            }}
          >
            <StarIcon
              ref={starRef}
              className="composer-model-favorite-star size-3.5"
              aria-hidden="true"
              style={{
                fill: isFavorite ? `url(#${gradientId})` : "none",
                stroke: isFavorite ? `url(#${gradientId})` : "#7c8796",
              }}
            >
              <defs>
                <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="var(--model-favorite-green)" />
                  <stop offset="35%" stopColor="var(--model-favorite-blue)" />
                  <stop offset="70%" stopColor="var(--model-favorite-purple)" />
                  <stop offset="100%" stopColor="var(--model-favorite-pink)" />
                </linearGradient>
              </defs>
            </StarIcon>
          </Button>
        }
      />
      <TooltipPopup side="top" align="center">
        {isFavorite ? t.composer.modelPicker.removeFavorite : t.composer.modelPicker.addFavorite}
      </TooltipPopup>
    </Tooltip>
  );
}
