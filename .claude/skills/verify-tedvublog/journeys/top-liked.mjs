// Feature: most liked posts on the home page (see features/top-liked.md).
import { evidence, launchBrowser, newPage, redis } from "../scripts/lib.mjs";

export default async function () {
  const ev = evidence("top-liked");
  const browser = await launchBrowser();
  try {
    let { context, page, consoleErrors } = await newPage(browser);

    // top-empty
    await redis("reset", {});
    await page.goto("/");
    await page.getByText("No likes yet — be the first!").waitFor();
    ev.check("top-empty: empty store shows the empty prompt", true);

    // Pick two real posts from the blog index.
    await page.goto("/blog/");
    const items = page.locator("[data-post-slug]");
    await items.first().waitFor();
    if ((await items.count()) < 2) {
      ev.check("precondition: at least two published posts", false, "Contentful returned fewer than 2 posts");
      return ev.finish();
    }
    const posts = [];
    for (const i of [0, 1]) posts.push({ key: `blog/${await items.nth(i).getAttribute("data-post-slug")}`, title: (await items.nth(i).locator("h2").innerText()).trim() });

    // top-order: higher count first; unknown keys and zero counts are skipped.
    await redis("seed", { likes: { [posts[0].key]: 2, [posts[1].key]: 5, "blog/no-such-post-verify": 9, "blog/zero-verify": 0 } });
    ev.save("seeded.json", await redis("dump"));
    // /api/likes/top is cached for 60s per browser, so a profile that already
    // loaded the home page would keep showing the empty list. Use a fresh one.
    await context.close();
    ({ context, page, consoleErrors } = await newPage(browser));
    await page.goto("/");
    const list = page.getByRole("heading", { name: "Most liked posts" }).locator("..").getByRole("listitem");
    await list.first().waitFor();
    const rows = await list.allInnerTexts();
    ev.save("rows.json", rows);
    ev.check("top-order: two rows (unknown and zero keys skipped)", rows.length === 2, JSON.stringify(rows));
    ev.check("top-order: most liked first", rows[0]?.includes(posts[1].title) && rows[0]?.includes("5") && rows[1]?.includes(posts[0].title) && rows[1]?.includes("2"));
    const href = await list.first().getByRole("link").getAttribute("href");
    ev.check("top-link: row links to the post", href === `/${posts[1].key}/`, href);
    await ev.shot(page, "01-top-liked");

    await list.first().getByRole("link").click();
    await page.waitForURL(`**/${posts[1].key}/`);
    ev.check("top-link: clicking opens the post", (await page.getByRole("heading", { level: 1 }).innerText()).trim() === posts[1].title);

    ev.check("no console errors", consoleErrors.length === 0, consoleErrors.join(" | "));
    await context.close();
    await redis("reset", {});
  } finally {
    await browser.close();
  }
  return ev.finish();
}
