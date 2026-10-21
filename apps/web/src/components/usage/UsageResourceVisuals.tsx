/** Resource-only meters and static CPU history; frame values stay outside React state. */
import { useId, useRef } from "react";
import { useAnimatedNumber } from "../../hooks/useAnimatedNumber";
import {
  wholeHostCpuPercent,
  type UsageCpuFrame,
  type UsageResourceGroupKey,
} from "./usageResource.logic";

/** Stable formatter avoids restarting unchanged number animations. */
function formatCpu(value: number) {
  return `${value.toFixed(1)}%`;
}

/** Show a host meter; optional text replaces percent copy but not the percentage fill. */
export function UsageResourceMeter({
  label,
  percent,
  text,
}: {
  readonly label: string;
  readonly percent: number | null;
  readonly text?: string;
}) {
  const number = useRef<HTMLSpanElement>(null);
  const fill = useRef<HTMLSpanElement>(null);
  useAnimatedNumber(number, percent, formatCpu, fill);
  return (
    <div className="usage-resource-meter">
      <div>
        <span>{label}</span>
        <b>{text === undefined ? <span ref={number} /> : text}</b>
      </div>
      <div
        className="usage-resource-track"
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent ?? undefined}
        aria-valuetext={text}
      >
        <span ref={fill} />
      </div>
    </div>
  );
}

/** Draw timestamps over two minutes, breaking lines across absent groups and sampling pauses. */
export function UsageResourceSpark({
  frames,
  group,
  cpuCount,
}: {
  readonly frames: readonly UsageCpuFrame[];
  readonly group: UsageResourceGroupKey;
  readonly cpuCount: number;
}) {
  const id = useId().replaceAll(":", "");
  const end = frames.at(-1)?.at ?? 0;
  const max = Math.max(
    1,
    ...frames.map((frame) => wholeHostCpuPercent(frame.groups.get(group) ?? 0, cpuCount) ?? 0),
  );
  const segments: { x: number; y: number }[][] = [];
  let segment: { x: number; y: number }[] = [];
  let lastAt: number | null = null;
  for (const frame of frames) {
    const raw = frame.groups.get(group);
    const value = raw === undefined ? null : wholeHostCpuPercent(raw, cpuCount);
    // A background pause does not prove continuous CPU activity between its endpoints.
    if (value === null || (lastAt !== null && frame.at - lastAt > 5000)) {
      if (segment.length) segments.push(segment);
      segment = [];
    }
    if (value !== null)
      segment.push({ x: ((frame.at - end + 120000) / 120000) * 92, y: 21 - (value / max) * 19 });
    lastAt = frame.at;
  }
  if (segment.length) segments.push(segment);
  const last = segments.at(-1)?.at(-1);
  return (
    <svg className="usage-resource-spark" viewBox="0 0 92 24" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--usage-resource-color)" stopOpacity=".35" />
          <stop offset="1" stopColor="var(--usage-resource-color)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {segments.map((points) => {
        const line = points.map((point) => `${point.x},${point.y}`).join(" ");
        return (
          <g key={points[0]!.x}>
            <polygon
              points={`${points[0]!.x},24 ${line} ${points.at(-1)!.x},24`}
              fill={`url(#${id})`}
            />
            <polyline
              points={line}
              fill="none"
              stroke="var(--usage-resource-color)"
              strokeWidth="1.4"
              strokeLinejoin="round"
            />
          </g>
        );
      })}
      {last && <circle cx={last.x} cy={last.y} r="2.2" fill="var(--usage-resource-color)" />}
    </svg>
  );
}
