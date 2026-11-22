// Feature: likes (see features/likes.md).
import { evidence, firstPost, launchBrowser, newPage, redis } from "../scripts/lib.mjs";

export default async function () {
  const ev = evidence("likes");
  await redis("reset", {});
  const browser = await launchBrowser();
  try {
    const { context, page, consoleErrors } = await newPage(browser);
    const post = await firstPost(page);
    ev.log("picked post", { note: post.postKey });

    const posts = [];
    page.on("request", (r) => r.method() === "POST" && r.url().includes("/api/likes/") && posts.push(r.url()));

    await page.goto(post.path);
    const top = page.locator(".post-actions.top button[aria-pressed]");
    await top.locator(".count").filter({ hasNotText: "–" }).waitFor();
    ev.check("top button starts unliked at 0", (await top.getAttribute("aria-label")) === "Like this post" && (await top.locator(".count").innerText()) === "0");
    await ev.shot(page, "01-before");

    await top.click();
    await page.locator('.post-actions.top button[aria-label="You liked this post"]').waitFor();
    await page.waitForFunction(() => document.querySelector(".post-actions.top button .count")?.textContent?.trim() === "1");
    ev.check("top button shows liked with count 1", (await top.getAttribute("aria-pressed")) === "true");

    const bottom = page.locator(".post-actions.bottom button[aria-pressed]");
    await bottom.scrollIntoViewIfNeeded();
    await page.locator('.post-actions.bottom button[aria-label="You liked this post"]').waitFor();
    ev.check("bottom button in sync (liked, count 1)", (await bottom.locator(".count").innerText()) === "1");
    ev.check("bottom prompt thanks the reader", await page.getByText("Thanks for reading!").isVisible());
    await ev.shot(page, "02-after-like");

    ev.check("exactly one like POST was sent", posts.length === 1, `${posts.length} POST(s)`);
    const stored = await redis("dump");
    ev.save("redis-after-like.json", stored);
    ev.check("Redis stores count 1 for the post", stored.zsets.likes?.[post.postKey] === 1, JSON.stringify(stored.zsets.likes));
    ev.check("Redis records one voter", (stored.sets[`likes:voters:${post.postKey}`] ?? []).length === 1);
    ev.check("localStorage remembers the like", (await page.evaluate((k) => localStorage.getItem(k), `liked:${post.postKey}`)) === "1");

    await page.reload();
    await page.locator('.post-actions.top button[aria-label="You liked this post"]').waitFor();
    ev.check("like survives reload", (await top.locator(".count").innerText()) === "1");

    // Fresh browser profile, same IP: the server must not count a second vote.
    const second = await newPage(browser);
    await second.page.goto(post.path);
    const top2 = second.page.locator(".post-actions.top button[aria-pressed]");
    await top2.locator(".count").filter({ hasText: "1" }).waitFor();
    ev.check("fresh profile sees count 1 and an enabled button", (await top2.getAttribute("aria-label")) === "Like this post");
    await top2.click();
    await second.page.locator('.post-actions.top button[aria-label="You liked this post"]').waitFor();
    await second.page.waitForTimeout(500);
    ev.check("repeat voter (same IP) is not counted again", (await top2.locator(".count").innerText()) === "1");
    await ev.shot(second.page, "03-repeat-voter");
    const stored2 = await redis("dump");
    ev.save("redis-after-repeat.json", stored2);
    ev.check("Redis count still 1", stored2.zsets.likes?.[post.postKey] === 1);

    ev.check("no console errors", consoleErrors.length + second.consoleErrors.length === 0, [...consoleErrors, ...second.consoleErrors].join(" | "));
    await context.close();
    await second.context.close();
  } finally {
    await browser.close();
  }
  return ev.finish();
}
