import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function RetainedTerminalPortal({
  target,
  children,
  fill = true,
}: {
  target: HTMLDivElement | null;
  children: ReactNode;
  fill?: boolean;
}) {
  const [container] = useState(() => {
    const element = document.createElement("div");
    element.className = fill ? "flex h-full min-h-0 flex-1 flex-col" : "flex min-h-0 flex-col";
    return element;
  });
  const parking = useRef<HTMLDivElement>(null);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- moves the same terminal DOM between the active layout slot and hidden parking
  useLayoutEffect(() => {
    (target ?? parking.current)?.appendChild(container);
    return () => container.remove();
  }, [container, target]);
  return (
    <>
      <div hidden ref={parking} />
      {createPortal(children, container)}
    </>
  );
}
