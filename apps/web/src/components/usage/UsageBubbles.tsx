/** SVG view of the pure bubble solver; frame coordinates never enter React state. */
import { useId, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import type { ModelTotals } from "@t3tools/shared/usageMerge";
import { formatPercent } from "@t3tools/shared/usageFormat";
import { t } from "~/i18n";
import { usePhysicsMotion } from "../../hooks/usePhysicsMotion";
import { useMotionJob } from "../../lib/motion/react";
import { observeResize } from "../../lib/observeResize";
import { modelShare } from "./usageBreakdown";
import { PROVIDER_ORDER, PROVIDER_PRESENTATION } from "./usageProviders";
import {
  createUsageBubbles,
  releaseUsageBubble,
  UsageBubblePhysics,
  type UsageBubble,
} from "./usageBubbles.logic";

/** Model selection remains page-owned; unknown cost shares are represented in list mode. */
interface UsageBubblesProps {
  readonly models: readonly ModelTotals[];
  readonly metric: "cost" | "tokens";
  readonly onSelectModel: (key: string) => void;
}

/** Pointer session tracks maximum travel, so a drag out and back cannot become a click. */
interface BubbleDrag {
  readonly key: string;
  readonly pointerId: number;
  readonly startX: number;
  readonly startY: number;
  lastX: number;
  lastY: number;
  lastTime: number;
  distance: number;
}

/** Paint mutable geometry directly; React owns identities, gradients, and accessible text. */
function paintBubbles(svg: SVGSVGElement | null, nodes: readonly UsageBubble[]) {
  if (!svg) return;
  const elements = new Map(
    Array.from(svg.querySelectorAll<SVGGElement>("[data-bubble]")).map((group) => [
      group.dataset.bubble,
      group,
    ]),
  );
  for (const node of nodes) {
    const element = elements.get(node.key);
    if (!element) continue;
    element.setAttribute("transform", `translate(${node.x} ${node.y})`);
    for (const circle of element.querySelectorAll("circle")) {
      circle.setAttribute("r", String(Math.max(0, node.radius)));
    }
  }
}

/** Show model spheres, persistent member hints, and click/keyboard selection with optional dragging. */
export function UsageBubbles({ models, metric, onSelectModel }: UsageBubblesProps) {
  const host = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const simulation = useRef<UsageBubblePhysics | null>(null);
  const drag = useRef<BubbleDrag | null>(null);
  const [width, setWidth] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const hintCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { enabled } = usePhysicsMotion();
  const { start, stop } = useMotionJob();
  const id = useId().replaceAll(":", "");
  const shares = useMemo(
    () =>
      models.flatMap((model) => {
        const share = modelShare(model, metric);
        return share === null
          ? []
          : [
              {
                key: `${model.provider}:${model.model}`,
                label: model.model,
                provider: model.provider,
                share,
              },
            ];
      }),
    [metric, models],
  );
  const nodes = useMemo(() => createUsageBubbles(shares, width, 300), [shares, width]);
  useLayoutEffect(() => cancelHintClose, []);

  /** Cancel the pending exit when the pointer reaches either the sphere or its detached hint. */
  function cancelHintClose() {
    if (hintCloseTimer.current !== null) clearTimeout(hintCloseTimer.current);
    hintCloseTimer.current = null;
  }

  /** Allow time to cross the gap to the scrollable hint without leaving a permanent overlay. */
  function scheduleHintClose() {
    cancelHintClose();
    hintCloseTimer.current = setTimeout(() => {
      hintCloseTimer.current = null;
      setHint(null);
    }, 300);
  }

  /** Opening either by focus or pointer cancels an earlier sphere's pending dismissal. */
  function showHint(key: string) {
    cancelHintClose();
    setHint(key);
  }
  useLayoutEffect(() => {
    const element = host.current;
    if (!element) return;
    setWidth(element.clientWidth);
    return observeResize(element, () => setWidth(element.clientWidth));
  }, []);

  useLayoutEffect(() => {
    stop();
    drag.current = null;
    if (width <= 0) return;
    const physics = new UsageBubblePhysics(
      createUsageBubbles(shares, width, 300, simulation.current?.nodes),
      width,
      300,
    );
    simulation.current = physics;
    const paint = () => paintBubbles(svg.current, physics.nodes);
    if (!enabled) {
      physics.settle();
      paint();
      return stop;
    }
    paint();
    start((dt) => {
      const moving = physics.step(dt);
      paint();
      return moving;
    });
    return stop;
  }, [shares, width, enabled, start, stop]);

  /** Restart the single graph job after input without rebuilding its nodes. */
  function wake() {
    const physics = simulation.current;
    if (!physics || !enabled) return;
    physics.wake();
    start((dt) => {
      const moving = physics.step(dt);
      paintBubbles(svg.current, physics.nodes);
      return moving;
    });
  }

  /** Convert a captured pointer to field pixels; the SVG always uses the measured field width. */
  function point(event: PointerEvent<SVGGElement>) {
    const bounds = svg.current!.getBoundingClientRect();
    return {
      x: ((event.clientX - bounds.left) * width) / bounds.width,
      y: ((event.clientY - bounds.top) * 300) / bounds.height,
    };
  }

  /** Release on up, cancel, or lost capture; only a short pointer-up selects an individual model. */
  function release(event: PointerEvent<SVGGElement>, node: UsageBubble) {
    const session = drag.current;
    if (!session || session.pointerId !== event.pointerId || session.key !== node.key) return;
    const distance = Math.max(
      session.distance,
      Math.hypot(event.clientX - session.startX, event.clientY - session.startY),
    );
    drag.current = null;
    if (simulation.current) simulation.current.drag = null;
    const movingNode = simulation.current?.nodes.find((item) => item.key === node.key);
    if (movingNode) releaseUsageBubble(movingNode);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    wake();
    if (event.type === "pointerup" && distance < 4 && !node.members.length) onSelectModel(node.key);
  }

  const hinted = nodes.find((node) => node.key === hint);
  const name = (node: UsageBubble) =>
    node.members.length
      ? t.tools.usage.bubblesOther.replace("{count}", String(node.members.length))
      : node.label;
  return (
    <div ref={host} className="usage-bubbles-field" data-motion={enabled}>
      <svg
        ref={svg}
        viewBox={`0 0 ${Math.max(1, width)} 300`}
        aria-label={t.tools.usage.compositionTitle}
      >
        <defs>
          {[...PROVIDER_ORDER, "other"].map((provider) => {
            const color =
              provider === "other"
                ? "var(--usage-bubble-other)"
                : PROVIDER_PRESENTATION[provider as keyof typeof PROVIDER_PRESENTATION].color;
            return (
              <radialGradient key={provider} id={`${id}-${provider}`} cx=".38" cy=".32" r=".78">
                <stop offset="0" stopColor={`color-mix(in srgb, ${color}, white 45%)`} />
                <stop offset=".5" stopColor={color} />
                <stop offset="1" stopColor={`color-mix(in srgb, ${color}, black 65%)`} />
              </radialGradient>
            );
          })}
          <radialGradient id={`${id}-highlight`} cx=".33" cy=".26" r=".42">
            <stop offset="0" stopColor="var(--usage-bubble-highlight)" stopOpacity=".75" />
            <stop offset=".45" stopColor="var(--usage-bubble-highlight)" stopOpacity=".12" />
            <stop offset="1" stopColor="var(--usage-bubble-highlight)" stopOpacity="0" />
          </radialGradient>
          <filter id={`${id}-shadow`} x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow
              dx="3"
              dy="9"
              stdDeviation="6"
              floodColor="var(--usage-bubble-shadow)"
              floodOpacity=".65"
            />
          </filter>
        </defs>
        {nodes.map((node) => {
          const fontSize = Math.min(12, node.targetRadius / 4.2);
          const maxCharacters = Math.max(
            4,
            Math.floor((node.targetRadius * 1.7) / (fontSize * 0.62)),
          );
          const label = name(node);
          return (
            <g
              key={node.key}
              data-bubble={node.key}
              className="usage-bubble"
              role="button"
              tabIndex={0}
              aria-label={`${label}: ${formatPercent(node.share)}`}
              aria-describedby={hint === node.key ? `${id}-hint` : undefined}
              filter={`url(#${id}-shadow)`}
              onFocus={() => showHint(node.key)}
              onBlur={scheduleHintClose}
              onPointerEnter={() => showHint(node.key)}
              onPointerLeave={() => {
                if (!drag.current) scheduleHintClose();
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape" && hinted) {
                  event.preventDefault();
                  cancelHintClose();
                  setHint(null);
                }
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  if (!node.members.length) onSelectModel(node.key);
                  else showHint(node.key);
                }
              }}
              onClick={() => {
                if (!enabled && !node.members.length) onSelectModel(node.key);
              }}
              onPointerDown={(event) => {
                if (!enabled || event.button !== 0 || drag.current) return;
                const movingNode = simulation.current?.nodes.find((item) => item.key === node.key);
                if (!movingNode) return;
                event.preventDefault();
                event.currentTarget.focus();
                event.currentTarget.setPointerCapture(event.pointerId);
                const position = point(event);
                drag.current = {
                  key: node.key,
                  pointerId: event.pointerId,
                  startX: event.clientX,
                  startY: event.clientY,
                  lastX: position.x,
                  lastY: position.y,
                  lastTime: event.timeStamp,
                  distance: 0,
                };
                movingNode.vx = movingNode.vy = 0;
                if (simulation.current) simulation.current.drag = movingNode;
                wake();
              }}
              onPointerMove={(event) => {
                const session = drag.current;
                if (!session || session.key !== node.key || session.pointerId !== event.pointerId)
                  return;
                const movingNode = simulation.current?.nodes.find((item) => item.key === node.key);
                if (!movingNode) return;
                const position = point(event);
                const dt = Math.max(0.008, (event.timeStamp - session.lastTime) / 1000);
                movingNode.vx = (position.x - session.lastX) / dt;
                movingNode.vy = (position.y - session.lastY) / dt;
                movingNode.x = position.x;
                movingNode.y = position.y;
                session.distance = Math.max(
                  session.distance,
                  Math.hypot(event.clientX - session.startX, event.clientY - session.startY),
                );
                session.lastX = position.x;
                session.lastY = position.y;
                session.lastTime = event.timeStamp;
                paintBubbles(svg.current, simulation.current?.nodes ?? []);
              }}
              onPointerUp={(event) => release(event, node)}
              onPointerCancel={(event) => release(event, node)}
              onLostPointerCapture={(event) => release(event, node)}
            >
              <circle fill={`url(#${id}-${node.provider})`} stroke="var(--usage-bubble-edge)" />
              <circle fill={`url(#${id}-highlight)`} />
              {node.targetRadius > 30 && (
                <text
                  textAnchor="middle"
                  fontSize={fontSize}
                  fill={
                    node.provider === "codex"
                      ? "var(--usage-bubble-dark-text)"
                      : "var(--usage-bubble-highlight)"
                  }
                >
                  <tspan x="0" y="-1" fontWeight="600">
                    {label.length > maxCharacters ? `${label.slice(0, maxCharacters - 1)}…` : label}
                  </tspan>
                  <tspan x="0" y={fontSize + 1}>
                    {formatPercent(node.share)}
                  </tspan>
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {!nodes.length && <p className="usage-bubbles-empty">{t.tools.usage.noActivity}</p>}
      {hinted && (
        <div
          id={`${id}-hint`}
          role="tooltip"
          className="usage-bubbles-hint"
          onPointerEnter={cancelHintClose}
          onPointerLeave={scheduleHintClose}
        >
          <strong>{name(hinted)}</strong>
          {(hinted.members.length ? hinted.members : [hinted]).map((member) => (
            <span key={member.key}>
              {member.label} <b>{formatPercent(member.share)}</b>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
