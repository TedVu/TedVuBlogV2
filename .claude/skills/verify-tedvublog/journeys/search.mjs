// Feature: blog search (see features/search.md).
import { evidence, launchBrowser, newPage } from "../scripts/lib.mjs";

export default async function () {
  const ev = evidence("search");
  const browser = await launchBrowser();
  try {
    const { context, page, consoleErrors } = await newPage(browser);
    await page.goto("/blog/");
    const items = page.locator("[data-post-slug]");
    await items.first().waitFor();
    const total = await items.count();
    const target = { slug: await items.first().getAttribute("data-post-slug"), title: (await items.first().locator("h2").innerText()).trim() };
    ev.log("posts listed", { note: `${total}; target "${target.title}"` });

    const box = page.getByRole("searchbox", { name: "Search posts" });
    const visibleSlugs = () => page.locator("[data-post-slug]:not([hidden])").evaluateAll((els) => els.map((e) => e.dataset.postSlug));

    await box.fill(target.title);
    await page.waitForFunction((slug) => {
      const shown = [...document.querySelectorAll("[data-post-slug]:not([hidden])")];
      return shown.length > 0 && shown.length < document.querySelectorAll("[data-post-slug]").length || (shown.length === 1 && shown[0].dataset.postSlug === slug);
    }, target.slug);
    const shown = await visibleSlugs();
    ev.check("search-match: full title shows the post", shown.includes(target.slug), shown.join(", "));
    await ev.shot(page, "01-match");

    await box.fill("zzqxjv");
    await page.getByText("No posts found").waitFor();
    ev.check("search-empty: nonsense query hides every post and says so", (await visibleSlugs()).length === 0);
    await ev.shot(page, "02-empty");

    await box.fill("");
    await page.waitForFunction((n) => document.querySelectorAll("[data-post-slug]:not([hidden])").length === n, total);
    ev.check("search-clear: clearing restores all posts", (await visibleSlugs()).length === total && (await page.getByText("No posts found").isHidden()));
    ev.check("search-error: no error banner", await page.getByRole("alert").isHidden());

    ev.check("no console errors", consoleErrors.length === 0, consoleErrors.join(" | "));
    await context.close();
  } finally {
    await browser.close();
  }
  return ev.finish();
}
