// Shared helpers for the verify-tedvublog harness: run state, the fake Redis
// side channel, browser launch, and evidence capture.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

export const SKILL_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const REPO = resolve(SKILL_DIR, "../../..");
export const VERIFY_DIR = join(REPO, ".verify");
export const RUN_ID = process.env.VERIFY_RUN || "default";
export const RUN_DIR = join(VERIFY_DIR, "runs", RUN_ID);
export const STATE_FILE = join(RUN_DIR, "state.json");
export const EVIDENCE_DIR = join(VERIFY_DIR, "evidence", RUN_ID);

export function readState() {
  if (!existsSync(STATE_FILE)) {
    throw new Error(`No running instance for run '${RUN_ID}'. Start one with: node .claude/skills/verify-tedvublog/scripts/control.mjs up`);
  }
  return JSON.parse(readFileSync(STATE_FILE, "utf8"));
}

export function writeState(state) {
  mkdirSync(RUN_DIR, { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

export function pidAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM";
  }
}

export function killTree(pid) {
  if (!pidAlive(pid)) return false;
  if (process.platform === "win32") {
    try {
      execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
    } catch {}
  } else {
    try {
      process.kill(-pid, "SIGTERM");
    } catch {
      try {
        process.kill(pid, "SIGTERM");
      } catch {}
    }
  }
  return true;
}

export const gitRev = () => {
  try {
    const rev = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: REPO, encoding: "utf8" }).trim();
    const dirty = execFileSync("git", ["status", "--porcelain", "--", "src", "astro.config.mjs", "package.json"], { cwd: REPO, encoding: "utf8" }).trim();
    return dirty ? `${rev}+dirty` : rev;
  } catch {
    return "unknown";
  }
};

// --- fake Redis side channel (reads/writes stored state, never drives the app)
export async function redis(path, body) {
  const { redisPort } = readState();
  const res = await fetch(`http://127.0.0.1:${redisPort}/__verify/${path}`, {
    method: body === undefined ? "GET" : "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`fake-upstash ${path}: HTTP ${res.status}`);
  return res.json();
}

// --- browser ----------------------------------------------------------------
// `presence: true` hides navigator.webdriver so ActiveReaders renders; without
// it the component deliberately stays hidden for automated browsers.
export async function launchBrowser({ presence = false, headless = process.env.HEADED ? false : true } = {}) {
  const { chromium } = await import("playwright-core");
  const args = presence ? ["--disable-blink-features=AutomationControlled"] : [];
  for (const channel of ["chrome", "msedge", undefined]) {
    try {
      return await chromium.launch({ channel, headless, args });
    } catch (e) {
      if (channel === undefined) throw e;
    }
  }
}

export async function newPage(browser, { colorScheme = "light", permissions = [] } = {}) {
  const { baseUrl } = readState();
  const context = await browser.newContext({ baseURL: baseUrl, colorScheme, viewport: { width: 1280, height: 900 } });
  if (permissions.length) await context.grantPermissions(permissions, { origin: baseUrl });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
  page.on("pageerror", (e) => consoleErrors.push(String(e)));
  return { context, page, consoleErrors };
}

// The first post linked from /blog, as { slug, title, postKey, path }.
export async function firstPost(page) {
  await page.goto("/blog/");
  const item = page.locator("[data-post-slug]").first();
  await item.waitFor();
  const slug = await item.getAttribute("data-post-slug");
  const title = (await item.locator("h2").innerText()).trim();
  return { slug, title, postKey: `blog/${slug}`, path: `/blog/${slug}/` };
}

// --- evidence ---------------------------------------------------------------
export function evidence(feature) {
  const dir = join(EVIDENCE_DIR, feature);
  mkdirSync(dir, { recursive: true });
  const steps = [];
  let failed = false;
  const log = (step, detail = {}) => {
    steps.push({ at: new Date().toISOString(), step, ...detail });
    console.log(`  ${detail.ok === false ? "FAIL" : "ok  "} ${step}${detail.note ? ` — ${detail.note}` : ""}`);
    if (detail.ok === false) failed = true;
  };
  const check = (step, ok, note) => log(step, { ok: Boolean(ok), note });
  const shot = async (page, name) => {
    const png = join(dir, `${name}.png`);
    const aria = join(dir, `${name}.aria.yml`);
    await page.screenshot({ path: png, fullPage: false });
    writeFileSync(aria, await page.locator("body").ariaSnapshot());
    log(`captured ${name}`, { files: [png, aria] });
  };
  const save = (name, data) => {
    const file = join(dir, name);
    writeFileSync(file, typeof data === "string" ? data : JSON.stringify(data, null, 2));
    return file;
  };
  const finish = () => {
    const state = readState();
    save("steps.json", { feature, run: RUN_ID, rev: state.rev, baseUrl: state.baseUrl, passed: !failed, steps });
    console.log(`${failed ? "FAILED" : "PASSED"}: ${feature}. Evidence in ${dir}`);
    process.exitCode = failed ? 1 : 0;
    return !failed;
  };
  return { dir, log, check, shot, save, finish };
}
