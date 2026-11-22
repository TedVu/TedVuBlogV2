// Feature: theme (see features/theme.md). Expectations come from
// openspec/changes/add-dark-mode/specs (site-theme).
import { evidence, firstPost, launchBrowser, newPage } from "../scripts/lib.mjs";

const theme = (page) => page.evaluate(() => document.documentElement.dataset.theme);

// WCAG contrast of an element's text colour against the page background.
const contrast = (page, selector) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const parse = (c) => c.match(/[\d.]+/g).slice(0, 3).map(Number);
    const lum = ([r, g, b]) => {
      const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const fg = parse(getComputedStyle(el).color);
    const bg = parse(getComputedStyle(document.body).backgroundColor);
    const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x);
    return Math.round(((a + 0.05) / (b + 0.05)) * 100) / 100;
  }, selector);

export default async function () {
  const ev = evidence("theme");
  const browser = await launchBrowser();
  try {
    // theme-initial: no saved choice, OS light -> light; OS dark -> dark.
    const light = await newPage(browser, { colorScheme: "light" });
    await light.page.goto("/");
    ev.check("theme-initial: OS light + no saved choice renders light (spec)", (await theme(light.page)) === "light", `got ${await theme(light.page)}`);
    await ev.shot(light.page, "01-initial-os-light");

    const dark = await newPage(browser, { colorScheme: "dark" });
    await dark.page.goto("/");
    ev.check("theme-initial: OS dark + no saved choice renders dark", (await theme(dark.page)) === "dark", `got ${await theme(dark.page)}`);
    await dark.context.close();

    // theme-toggle: click the header toggle, no reload, choice saved.
    const page = light.page;
    const toggle = page.getByRole("button", { name: "Toggle dark mode" });
    const start = await theme(page);
    await page.evaluate(() => (window.__noReload = true));
    await toggle.click();
    const flipped = start === "dark" ? "light" : "dark";
    await page.waitForFunction((t) => document.documentElement.dataset.theme === t, flipped);
    ev.check("theme-toggle: click flips the theme without a reload", await page.evaluate(() => window.__noReload === true), `${start} -> ${flipped}`);
    ev.check("theme-toggle: aria-pressed reflects dark", (await toggle.getAttribute("aria-pressed")) === String(flipped === "dark"));
    ev.check("theme-toggle: choice saved", (await page.evaluate(() => localStorage.getItem("theme"))) === flipped);
    await ev.shot(page, "02-after-toggle");

    // Keyboard operable.
    await toggle.focus();
    await page.keyboard.press("Enter");
    await page.waitForFunction((t) => document.documentElement.dataset.theme === t, start);
    ev.check("theme-toggle: Enter key toggles back", (await theme(page)) === start);

    // theme-persist: choose dark, navigate via header link, then full reload.
    if ((await theme(page)) !== "dark") await toggle.click();
    await page.waitForFunction(() => document.documentElement.dataset.theme === "dark");
    await page.getByRole("link", { name: "Blog", exact: true }).click();
    await page.waitForURL((url) => /^\/blog\/?$/.test(url.pathname));
    ev.check("theme-persist: dark survives client-side navigation", (await theme(page)) === "dark");
    await page.reload();
    ev.check("theme-persist: dark survives full reload", (await theme(page)) === "dark");

    // theme-saved-wins: saved light beats OS dark.
    const osDark = await newPage(browser, { colorScheme: "dark" });
    await osDark.page.goto("/");
    await osDark.page.evaluate(() => localStorage.setItem("theme", "light"));
    await osDark.page.reload();
    ev.check("theme-saved-wins: saved light overrides OS dark", (await theme(osDark.page)) === "light");
    await osDark.context.close();

    // theme-contrast: post-page widgets readable in dark.
    const post = await firstPost(page);
    await page.goto(post.path);
    await page.locator(".post-actions.bottom").scrollIntoViewIfNeeded();
    await page.locator(".post-actions.bottom .prompt").waitFor();
    const ratio = await contrast(page, ".post-actions.bottom .prompt");
    ev.check("theme-contrast: like prompt text >= 4.5:1 in dark (spec)", ratio !== null && ratio >= 4.5, `ratio ${ratio}`);
    await ev.shot(page, "03-post-dark");

    ev.check("no console errors", light.consoleErrors.length === 0, light.consoleErrors.join(" | "));
    await light.context.close();
  } finally {
    await browser.close();
  }
  return ev.finish();
}
