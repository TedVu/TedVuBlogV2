// Feature: share buttons (see features/share.md).
import { evidence, firstPost, launchBrowser, newPage } from "../scripts/lib.mjs";

const SITE = "https://tedvu.com";

export default async function () {
  const ev = evidence("share");
  const browser = await launchBrowser();
  try {
    const { context, page, consoleErrors } = await newPage(browser, { permissions: ["clipboard-read", "clipboard-write"] });
    // Never load the real social sites; record where the popup tried to go.
    await context.route(/facebook\.com|x\.com|wa\.me/, (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<title>blocked by verify</title>" }));

    const post = await firstPost(page);
    const canonical = `${SITE}${post.path}`;
    await page.goto(post.path);
    const top = page.locator(".share.top");
    const enc = encodeURIComponent(canonical);
    const t = encodeURIComponent(post.title);
    const expected = {
      "Share on Facebook": `https://www.facebook.com/sharer/sharer.php?u=${enc}`,
      "Share on X": `https://x.com/intent/post?url=${enc}&text=${t}`,
      "Share on WhatsApp": `https://wa.me/?text=${t}%20${enc}`,
    };
    for (const [name, href] of Object.entries(expected)) {
      const link = top.getByRole("link", { name });
      const got = await link.getAttribute("href");
      ev.check(`share-links: ${name} href carries the canonical URL`, got === href, got);
      ev.check(`share-links: ${name} opens in a new tab`, (await link.getAttribute("target")) === "_blank" && (await link.getAttribute("rel"))?.includes("noopener"));
    }

    const [popup] = await Promise.all([page.waitForEvent("popup"), top.getByRole("link", { name: "Share on X" }).click()]);
    await popup.waitForURL((url) => url.hostname === "x.com");
    ev.check("share-links: clicking X opens a popup to the intent URL", popup.url() === expected["Share on X"], popup.url());
    await popup.close();

    // share-copy
    await page.evaluate(() => navigator.clipboard.writeText(""));
    await top.getByRole("button", { name: "Copy link" }).click();
    await top.getByText("Copied", { exact: true }).waitFor();
    ev.check("share-copy: clipboard holds the canonical URL", (await page.evaluate(() => navigator.clipboard.readText())) === canonical);
    ev.check("share-copy: live region announces it", (await top.locator("[data-share-status]").innerText()) === "Link copied");
    await ev.shot(page, "01-copied");
    await page.waitForTimeout(2300);
    ev.check("share-copy: confirmation clears after ~2s", await top.getByText("Copied", { exact: true }).isHidden());

    // share-native: shown only when the browser supports navigator.share.
    const supported = await page.evaluate(() => "share" in navigator);
    const nativeVisible = await top.getByRole("button", { name: "Share via…" }).isVisible();
    ev.check("share-native: button visibility matches navigator.share support", supported === nativeVisible, `share in navigator: ${supported}`);

    ev.check("no console errors", consoleErrors.length === 0, consoleErrors.join(" | "));
    await context.close();
  } finally {
    await browser.close();
  }
  return ev.finish();
}
