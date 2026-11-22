#!/usr/bin/env node
// verify-tedvublog control CLI.
//   node .claude/skills/verify-tedvublog/scripts/control.mjs up [--port 4329]
//   node .claude/skills/verify-tedvublog/scripts/control.mjs doctor
//   node .claude/skills/verify-tedvublog/scripts/control.mjs journey <likes|theme|share|search|top-liked|presence|all>
//   node .claude/skills/verify-tedvublog/scripts/control.mjs redis <dump|reset|seed '<json>'>
//   node .claude/skills/verify-tedvublog/scripts/control.mjs down
// Set VERIFY_RUN=<id> to keep several runs' state and evidence apart.
import { spawn } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import {
  EVIDENCE_DIR, REPO, RUN_DIR, RUN_ID, SKILL_DIR, STATE_FILE,
  gitRev, killTree, pidAlive, readState, redis, writeState,
} from "./lib.mjs";

const [cmd, ...rest] = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : fallback;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(what, fn, timeoutMs) {
  const until = Date.now() + timeoutMs;
  let last;
  while (Date.now() < until) {
    try {
      const v = await fn();
      if (v) return v;
    } catch (e) {
      last = e;
    }
    await sleep(500);
  }
  throw new Error(`Timed out waiting for ${what}${last ? `: ${last.message}` : ""}`);
}

function spawnLogged(name, args, env) {
  mkdirSync(RUN_DIR, { recursive: true });
  const logFile = join(RUN_DIR, `${name}.log`);
  const fd = openSync(logFile, "w");
  const child = spawn(process.execPath, args, {
    cwd: REPO,
    env,
    detached: true,
    stdio: ["ignore", fd, fd],
    windowsHide: true,
  });
  child.unref();
  closeSync(fd);
  return { pid: child.pid, logFile };
}

async function up() {
  if (existsSync(STATE_FILE)) {
    const s = readState();
    if (pidAlive(s.astroPid) || pidAlive(s.redisPid)) {
      console.error(`Run '${RUN_ID}' already has an instance at ${s.baseUrl}. Use it, or run 'down' first.`);
      process.exit(1);
    }
  }
  if (!existsSync(join(SKILL_DIR, "node_modules", "playwright-core"))) {
    console.error(`Harness deps missing. Run: npm install --prefix .claude/skills/verify-tedvublog`);
    process.exit(1);
  }
  rmSync(RUN_DIR, { recursive: true, force: true });
  mkdirSync(RUN_DIR, { recursive: true });

  const token = randomUUID();
  const readyFile = join(RUN_DIR, "redis.ready.json");
  const fake = spawnLogged("fake-upstash", [join(SKILL_DIR, "scripts", "fake-upstash.mjs"), "--port", "0", "--token", token, "--repo", REPO, "--ready-file", readyFile], process.env);
  writeState({ run: RUN_ID, redisPid: fake.pid, rev: gitRev() });
  const { port: redisPort } = await waitFor("fake-upstash", () => existsSync(readyFile) && JSON.parse(readFileSync(readyFile, "utf8")), 15000);

  // Real env vars beat .env in Vite, so these override the production Upstash
  // credentials for this process only. Contentful stays real (read-only).
  const env = {
    ...process.env,
    UPSTASH_REDIS_REST_URL: `http://127.0.0.1:${redisPort}`,
    UPSTASH_REDIS_REST_TOKEN: token,
    LIKE_SALT: `verify-${RUN_ID}`,
    ASTRO_TELEMETRY_DISABLED: "1",
  };
  const port = opt("port", "4329");
  const astro = spawnLogged("astro", [join(REPO, "node_modules", "astro", "astro.js"), "dev", "--host", "127.0.0.1", "--port", port], env);
  writeState({ run: RUN_ID, redisPid: fake.pid, redisPort, astroPid: astro.pid, rev: gitRev(), logs: { astro: astro.logFile, redis: fake.logFile } });

  // Astro moves to the next free port when ours is taken: read the real URL.
  const baseUrl = await waitFor(
    "astro dev to print its URL",
    () => {
      if (!pidAlive(astro.pid)) throw new Error(`astro exited; see ${astro.logFile}`);
      const m = readFileSync(astro.logFile, "utf8").match(/http:\/\/127\.0\.0\.1:(\d+)\//);
      return m && `http://127.0.0.1:${m[1]}`;
    },
    90000,
  );
  writeState({ ...readState(), baseUrl, startedAt: new Date().toISOString() });

  // Usable, not just listening: a page that needs Contentful renders, and the
  // likes API answers from the fake (its command counter moves).
  await waitFor("/blog/ to render posts from Contentful", async () => {
    const res = await fetch(`${baseUrl}/blog/`);
    return res.ok && (await res.text()).includes("data-post-slug");
  }, 120000);
  const before = (await redis("info")).commands;
  const probe = await fetch(`${baseUrl}/api/likes/blog/verify-probe`);
  const after = (await redis("info")).commands;
  if (!probe.ok || after <= before) {
    console.error(`Likes API is not talking to the fake Redis (HTTP ${probe.status}, fake commands ${before}->${after}). Refusing to continue: it could be writing to production. See ${astro.logFile}`);
    await down();
    process.exit(1);
  }
  console.log(`READY ${baseUrl} (run '${RUN_ID}', fake Redis :${redisPort}, rev ${readState().rev})`);
}

async function doctor() {
  let s;
  try {
    s = readState();
  } catch (e) {
    console.log(`DOCTOR FAIL: ${e.message}`);
    process.exit(1);
  }
  const results = [];
  const check = (name, ok, note = "") => results.push({ name, ok, note });
  check("astro process alive", pidAlive(s.astroPid), `pid ${s.astroPid}`);
  check("fake-upstash process alive", pidAlive(s.redisPid), `pid ${s.redisPid}`);
  const rev = gitRev();
  check("instance built from current checkout", rev === s.rev, `started at ${s.rev}, checkout now ${rev} (dev server hot-reloads src, but restart after package/config changes)`);
  let info;
  try {
    info = await redis("info");
    check("fake-upstash answering", info.fake === "fake-upstash", `:${s.redisPort}`);
    check("fake knows likes.ts Lua script", info.scriptKnown, info.scriptKnown ? `sha ${info.scriptSha.slice(0, 10)}` : "ADD_LIKE_SCRIPT changed: update fake-upstash.mjs");
  } catch (e) {
    check("fake-upstash answering", false, e.message);
  }
  try {
    const res = await fetch(`${s.baseUrl}/`);
    check("site responds", res.ok && (await res.text()).includes("Ted Vu"), `${s.baseUrl} HTTP ${res.status}`);
    const before = (await redis("info")).commands;
    const api = await fetch(`${s.baseUrl}/api/likes/blog/verify-probe`);
    const after = (await redis("info")).commands;
    check("likes API bound to the fake, not production", api.ok && after > before, `HTTP ${api.status}, fake commands ${before}->${after}`);
  } catch (e) {
    check("site responds", false, e.message);
  }
  for (const r of results) console.log(`${r.ok ? "ok  " : "FAIL"} ${r.name}${r.note ? ` (${r.note})` : ""}`);
  const ok = results.every((r) => r.ok || r.name === "instance built from current checkout");
  console.log(ok ? "DOCTOR OK" : "DOCTOR FAIL");
  process.exitCode = ok ? 0 : 1;
}

async function down() {
  if (!existsSync(STATE_FILE)) {
    console.log(`Nothing to stop for run '${RUN_ID}'.`);
    return;
  }
  const s = readState();
  // Kill only what this run started, by recorded pid.
  for (const [name, pid] of [["astro", s.astroPid], ["fake-upstash", s.redisPid]]) {
    console.log(`${killTree(pid) ? "stopped" : "not running"}: ${name} (pid ${pid})`);
  }
  rmSync(RUN_DIR, { recursive: true, force: true });
  console.log(`Cleaned run state. Evidence kept in ${EVIDENCE_DIR}`);
}

async function journey(name) {
  const dir = join(SKILL_DIR, "journeys");
  const names = name === "all" ? readdirSync(dir).filter((f) => f.endsWith(".mjs")).map((f) => f.slice(0, -4)) : [name];
  let failed = 0;
  for (const n of names) {
    const file = join(dir, `${n}.mjs`);
    if (!existsSync(file)) {
      console.error(`Unknown journey '${n}'. Available: ${readdirSync(dir).map((f) => f.replace(/\.mjs$/, "")).join(", ")}`);
      process.exit(2);
    }
    console.log(`journey ${n}`);
    process.exitCode = 0;
    try {
      const mod = await import(pathToFileURL(file).href);
      await mod.default();
    } catch (e) {
      console.error(`  FAIL ${n}: ${e.stack ?? e}`);
      process.exitCode = 1;
    }
    if (process.exitCode) failed++;
  }
  process.exitCode = failed ? 1 : 0;
}

switch (cmd) {
  case "up":
    await up();
    break;
  case "doctor":
    await doctor();
    break;
  case "down":
    await down();
    break;
  case "journey":
    await journey(rest[0] ?? "all");
    break;
  case "redis": {
    const [sub, json] = rest;
    if (sub === "dump") console.log(JSON.stringify(await redis("dump"), null, 2));
    else if (sub === "reset") console.log(JSON.stringify(await redis("reset", {})));
    else if (sub === "seed") console.log(JSON.stringify(await redis("seed", JSON.parse(json ?? "{}"))));
    else (console.error("redis <dump|reset|seed '<json>'>"), (process.exitCode = 2));
    break;
  }
  default:
    console.error("usage: control.mjs <up|doctor|journey <name>|redis <dump|reset|seed>|down>");
    process.exitCode = 2;
}
