/** Exercises form validation and normalization through user input, before persistence. */
import "../index.css";
import { expect, it, vi } from "vite-plus/test";
import { page, userEvent } from "vite-plus/test/browser";
import { render } from "../../test/render";
import { t } from "../i18n";
import { WebPageEditDialog } from "./WebPageEditDialog";

it("rejects a non-web URL without saving or dismissing the form", async () => {
  const save = vi.fn(() => true);
  const close = vi.fn();
  await using _screen = await render(<WebPageEditDialog onSave={save} onClose={close} />);
  await page
    .getByRole("textbox", { name: t.webPages.url, exact: true })
    .fill("javascript:alert(1)");
  await page.getByRole("button", { name: t.webPages.save, exact: true }).click();
  await expect.element(page.getByRole("alert")).toHaveTextContent(t.webPages.invalidUrl);
  expect(save).not.toHaveBeenCalled();
  expect(close).not.toHaveBeenCalled();
});

it("normalizes a bare hostname and submits an empty optional name", async () => {
  const save = vi.fn(() => true);
  await using _screen = await render(<WebPageEditDialog onSave={save} onClose={() => {}} />);
  await page.getByRole("textbox", { name: t.webPages.url, exact: true }).fill("chatgpt.com");
  await page.getByRole("button", { name: t.webPages.save, exact: true }).click();
  expect(save).toHaveBeenCalledWith({ url: "https://chatgpt.com/", name: "" });
});

it("prefills the existing launch target and name for editing", async () => {
  await using _screen = await render(
    <WebPageEditDialog
      entry={{ id: "chat", name: "My chat", url: "https://chatgpt.com/" }}
      onSave={() => true}
      onClose={() => {}}
    />,
  );
  await expect
    .element(page.getByRole("textbox", { name: t.webPages.url, exact: true }))
    .toHaveValue("https://chatgpt.com/");
  await expect
    .element(page.getByRole("textbox", { name: t.webPages.name, exact: true }))
    .toHaveValue("My chat");
});

it("submits on Enter from the URL field", async () => {
  const save = vi.fn(() => true);
  await using _screen = await render(<WebPageEditDialog onSave={save} onClose={() => {}} />);
  await page.getByRole("textbox", { name: t.webPages.url, exact: true }).fill("deepseek.com");
  await userEvent.keyboard("{Enter}");
  expect(save).toHaveBeenCalledWith({ url: "https://deepseek.com/", name: "" });
});

it("keeps the form open and reports URL errors when persistence rejects the entry", async () => {
  const close = vi.fn();
  await using _screen = await render(<WebPageEditDialog onSave={() => false} onClose={close} />);
  await page.getByRole("textbox", { name: t.webPages.url, exact: true }).fill("chatgpt.com");
  await page.getByRole("button", { name: t.webPages.save, exact: true }).click();
  await expect.element(page.getByRole("alert")).toHaveTextContent(t.webPages.invalidUrl);
  expect(close).not.toHaveBeenCalled();
});
