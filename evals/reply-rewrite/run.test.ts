import { expect, it } from "vite-plus/test";
import { gradeReplyRewrite } from "./grade.ts";

it("flags missing numbers and protected code but leaves semantic review required on a literal pass", () => {
  expect(
    gradeReplyRewrite("Wait 120 seconds, then run `check`.", "Run `check`.", ["120"]),
  ).toMatchObject({ literalChecksPassed: false, missing: ["120"] });
  expect(gradeReplyRewrite("Run `check`.", "Run `clean`.", [])).toMatchObject({
    literalChecksPassed: false,
    bodyFailure: { code: "protocol" },
  });
  expect(gradeReplyRewrite("It may work.", "It will work.", [])).toMatchObject({
    literalChecksPassed: true,
    semanticReview: "required",
  });
});
