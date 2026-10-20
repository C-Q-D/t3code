/** Exercise forbidden class syntax and safe attribute variants through the real oxlint plugin. */
/* oxlint-disable t3code/no-has-selector -- the fixtures deliberately include forbidden selectors */
import { assert, describe } from "@effect/vitest";

import { createOxlintRuleHarness } from "../test/utils.ts";

const rule = createOxlintRuleHarness("t3code/no-has-selector", { filename: "fixture.tsx" });

describe("t3code/no-has-selector", () => {
  describe.each([
    "has-[:disabled]:x",
    "has-disabled:x",
    "group-has-[input:checked]/row:x",
    "peer-has-checked:x",
    "not-has-[input]:x",
    "in-has-[input]:x",
    "in-[[data-slot=a]:has(b)]:x",
    "[&:has(.x)]:y",
    "hover:has-[:focus-visible]:x",
    "[&:HAS(.x)]:y",
  ])("forbidden token: %s", (token) => {
    rule.invalid(
      "reports the selector and replacement guidance",
      `const el = <div className=${JSON.stringify(token)} />;`,
      (output) => {
        assert.match(output, /Do not use :has\(\) or has-\* variants/);
      },
    );
  });

  describe.each([
    `const el = <div class="has-disabled:x" />;`,
    `const value = cn("p-2", enabled && "has-disabled:x");`,
    `const value = cva("p-2", { variants: { size: { small: "has-disabled:x" } } });`,
    `const value = tv({ base: "has-disabled:x" });`,
    "const value = `flex ${layout} has-disabled:x`;",
    `const value = { "has-disabled:x": enabled };`,
  ])("class source: %s", (source) => {
    rule.invalid("reports forbidden syntax in the existing literal coverage", source);
  });

  describe.each([
    "data-[has-icon=false]:x",
    "group-data-[has-icon=false]/banner-row:x",
    "data-has-overflow-y:x",
    "data-has-overflow-x:x",
    "hover:x",
    "hover:group-data-[has-icon=false]/banner-row:x",
    "data-[value=has-disabled:x]:y",
    "content-[has-disabled:x]",
    "has-disabled",
  ])("safe token: %s", (token) => {
    rule.valid(
      "allows attributes and utilities without relational selectors",
      `const el = <div className=${JSON.stringify(token)} />;`,
    );
  });
});
const indicators = createOxlintRuleHarness("t3code/no-outset-state-indicators", {
  filename: "fixture.tsx",
});

describe("t3code/no-outset-state-indicators", () => {
  describe.each(
    Object.entries({
      "inset state rings": `const el = <button className="focus-visible:ring-2 focus-visible:ring-inset ring-1 ring-border" />;`,
      "an unconditional inset": `const el = <button className="ring-inset data-selected:ring-2" />;`,
      "an inset in a sibling composer argument": `const value = cn(active && "dark:focus-visible:ring-2", "focus-visible:ring-inset");`,
      "an inset in a nested conditional composer": `const value = cn(enabled && cn("focus-visible:ring-2", "focus-visible:ring-inset"));`,
      "outlines covered by the inward default": `const el = <button className="focus-visible:outline-2 focus-visible:outline-ring" />;`,
      "wider outlines with a matching inward offset": `const el = <button className="focus-visible:outline-3 focus-visible:-outline-offset-3" />;`,
      "arbitrary pixel outlines with a matching inward offset": `const el = <button className="focus-visible:outline-[3px] focus-visible:-outline-offset-3" />;`,
      "arbitrary outline colors": `const el = <button className="focus-visible:outline-[#243c5a]" />;`,
      "decorative rings without a state": `const el = <img className="ring-2 ring-background" />;`,
      prose: `const note = "the focus ring stays visible";`,
    }),
  )("valid: %s", (name, source) => {
    indicators.valid(name, source);
  });

  describe.each(
    Object.entries({
      "state rings without an inset": `const el = <button className="focus-visible:ring-2 focus-visible:ring-ring" />;`,
      "an inset from another state": `const el = <button className="focus:ring-inset focus-visible:ring-2" />;`,
      "an inset from another conditional branch": `const value = cn(active ? "focus:ring-2" : "ring-inset");`,
      "an inset passed to another function": `const value = cn("focus-visible:ring-2", label("ring-inset"));`,
      "arbitrary state ring widths": `const value = cn("has-[:focus-visible]:ring-[3px]");`,
      "positive outline offsets": `const el = <button className="focus-visible:outline-2 focus-visible:outline-offset-2" />;`,
      "arbitrary outline offsets": `const el = <button className="focus-visible:[outline-offset:2px]" />;`,
      "wide outlines without an inward offset":
        "const className = `focus-visible:outline-4 ${layout}`;",
    }),
  )("invalid: %s", (name, source) => {
    indicators.invalid(name, source);
  });
});
