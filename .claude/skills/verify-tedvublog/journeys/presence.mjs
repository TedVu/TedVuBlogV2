// Feature: active readers count in the header (see features/presence.md).
import { evidence, launchBrowser, newPage, redis } from "../scripts/lib.mjs";

const presenceMembers = async () => Object.keys((await redis("dump")).zsets.presence ?? {});

export default async function () {
  const ev = evidence("presence");
  await redis("reset", {});

  // presence-bots: an automated browser (navigator.webdriver) is not counted.
  const bot = await launchBrowser();
  try {
    const { page } = await newPage(bot);
    await page.goto("/");
    await page.waitForTimeout(3000);
    ev.check("presence-bots: webdriver browser shows no counter", (await page.getByText(/Active readers:/).count()) === 0);
    ev.check("presence-bots: webdriver browser sends no heartbeat", (await presenceMembers()).length === 0);
  } finally {
    await bot.close();
  }

  const browser = await launchBrowser({ presence: true });
  try {
    const a = await newPage(browser);
    await a.page.goto("/");
    await a.page.getByText("Active readers: 1").waitFor({ timeout: 15000 });
    ev.check("presence-count: first reader sees 1", true);
    await ev.shot(a.page, "01-one-reader");

    const b = await newPage(browser);
    await b.page.goto("/blog/");
    await b.page.getByText("Active readers: 2").waitFor({ timeout: 15000 });
    ev.check("presence-count: second browser profile sees 2", (await presenceMembers()).length === 2);
    await ev.shot(b.page, "02-two-readers");

    // presence-leave: closing a tab sends the leave beacon.
    await b.context.close({ runBeforeUnload: true });
    const until = Date.now() + 5000;
    let members = await presenceMembers();
    while (members.length !== 1 && Date.now() < until) {
      await new Promise((r) => setTimeout(r, 250));
      members = await presenceMembers();
    }
    ev.check("presence-leave: closing a profile's tab removes it from Redis", members.length === 1, `${members.length} member(s)`);
    ev.save("redis-after-leave.json", await redis("dump"));

    // presence-nav: the counter persists across client-side navigation.
    await a.page.getByRole("link", { name: "Blog", exact: true }).click();
    await a.page.waitForURL((url) => /^\/blog\/?$/.test(url.pathname));
    ev.check("presence-nav: counter still shown after navigation", await a.page.getByText(/Active readers: \d+/).isVisible());

    ev.check("no console errors", a.consoleErrors.length === 0, a.consoleErrors.join(" | "));
    await a.context.close();
  } finally {
    await browser.close();
  }
  return ev.finish();
}
