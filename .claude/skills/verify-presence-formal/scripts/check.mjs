#!/usr/bin/env node
// Model-check the active-readers presence protocol against the current code.
//
//   node .claude/skills/verify-presence-formal/scripts/check.mjs            # all checks
//   node .claude/skills/verify-presence-formal/scripts/check.mjs timing     # one check
//
// Exit codes: 0 every check matches model/expected.json
//             1 a check's outcome changed (new violation, or a finding now passes)
//             2 the model no longer matches the code (drift): nothing was checked
//             3 tooling / TLC error
//             4 checks match, but covered code changed since the sync commit: review it
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SKILL = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = resolve(SKILL, "../../..");
const MODEL = join(SKILL, "model");
const OUT = join(REPO, ".verify", "formal");
const TOOLS = join(REPO, ".verify", "tools");

// ---------------------------------------------------------------- tools ----
const TLA2TOOLS = { url: "https://github.com/tlaplus/tlaplus/releases/download/v1.7.4/tla2tools.jar", sha256: "936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88" };
const JRE_WIN = {
  url: "https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.13%2B11/OpenJDK17U-jre_x64_windows_hotspot_17.0.13_11.zip",
  sha256: "11a61a94d383e755b08b4e5890a13d148bc9f95b7149cbbeec62efb8c75a4a67",
};
const sha256 = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");

async function download(spec, file) {
  if (existsSync(file) && sha256(file) === spec.sha256) return file;
  mkdirSync(dirname(file), { recursive: true });
  console.log(`downloading ${spec.url}`);
  const res = await fetch(spec.url);
  if (!res.ok) throw new Error(`download failed: HTTP ${res.status} ${spec.url}`);
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  const got = sha256(file);
  if (got !== spec.sha256) {
    rmSync(file);
    throw new Error(`checksum mismatch for ${spec.url}: got ${got}`);
  }
  return file;
}

function javaMajor(java) {
  const r = spawnSync(java, ["-version"], { encoding: "utf8" });
  if (r.status !== 0) return 0;
  const m = (r.stderr + r.stdout).match(/version "(\d+)(?:\.(\d+))?/);
  if (!m) return 0;
  return m[1] === "1" ? Number(m[2]) : Number(m[1]);
}

async function tools() {
  const jar = process.env.TLA2TOOLS || (await download(TLA2TOOLS, join(TOOLS, "tla2tools.jar")));
  for (const candidate of [process.env.JAVA, "java"].filter(Boolean)) {
    if (javaMajor(candidate) >= 11) return { jar, java: candidate };
  }
  if (process.platform !== "win32") throw new Error("Java 11+ not found. Install one (e.g. `mise use java@temurin-17`) or set JAVA=/path/to/java.");
  const jreRoot = join(TOOLS, "jre17");
  const findJava = () => {
    if (!existsSync(jreRoot)) return null;
    for (const d of readdirSync(jreRoot)) {
      const j = join(jreRoot, d, "bin", "java.exe");
      if (existsSync(j)) return j;
    }
    return null;
  };
  let java = findJava();
  if (!java) {
    const zip = await download(JRE_WIN, join(TOOLS, "jre17.zip"));
    mkdirSync(jreRoot, { recursive: true });
    // Windows' own bsdtar reads zip; Git Bash's GNU tar on PATH does not.
    execFileSync(join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe"), ["-xf", zip, "-C", jreRoot]);
    java = findJava();
  }
  if (!java || javaMajor(java) < 11) throw new Error("Could not set up Java 17 in .verify/tools/jre17");
  return { jar, java };
}

// ------------------------------------------------- code -> model binding ----
const read = (rel) => readFileSync(join(REPO, rel), "utf8").replace(/\r\n?/g, "\n");

function msConstant(rel, name) {
  const m = read(rel).match(new RegExp(`const ${name}\\s*=\\s*([\\d_]+)\\s*;`));
  if (!m) throw drift(`${rel}: cannot find 'const ${name} = <number>;'`);
  return Number(m[1].replace(/_/g, ""));
}

// Facts the model's actions depend on. If one disappears the model may no
// longer describe the code: re-read the code and update Presence.tla.
const ANCHORS = [
  ["src/components/ActiveReaders.vue", /localStorage\.getItem\(STORAGE_KEY\)/, "all tabs share one visitorId from localStorage (model: one visitor, many Tabs)"],
  ["src/components/ActiveReaders.vue", /function start\(\) \{\s*stop\(\);\s*beat\(\);\s*timer = setInterval\(beat, HEARTBEAT_MS\);/, "start() beats at once then every HEARTBEAT_MS (YouOpenTab / YouSwitchBack / TimerFires)"],
  ["src/components/ActiveReaders.vue", /if \(document\.visibilityState === "visible"\) start\(\);\s*else stop\(\);/, "hidden stops heartbeats, visible restarts them (YouSwitchAway / YouSwitchBack)"],
  ["src/components/ActiveReaders.vue", /navigator\.sendBeacon\("\/api\/presence\/leave"/, "pagehide sends the leave beacon (YouCloseTab)"],
  ["src/components/ActiveReaders.vue", /window\.addEventListener\("pagehide", onPageHide\)/, "leave is tied to pagehide (YouCloseTab)"],
  ["src/lib/presence.ts", /\.zadd\(PRESENCE_KEY, \{ score: now, member: visitorId \}\)/, "heartbeat stores server time as the score (ServerHandlesHeartbeat)"],
  ["src/lib/presence.ts", /\.zremrangebyscore\(PRESENCE_KEY, 0, now - ACTIVE_WINDOW_MS\)/, "stale = score <= now - window, inclusive (Counted)"],
  ["src/lib/presence.ts", /redis\.zrem\(PRESENCE_KEY, visitorId\)/, "leave removes the member outright (ServerHandlesLeave)"],
  ["src/pages/api/presence/index.ts", /heartbeat\(visitorId\)/, "POST /api/presence calls heartbeat"],
  ["src/pages/api/presence/leave.ts", /leave\(visitorId\)/, "POST /api/presence/leave calls leave"],
];

class Drift extends Error {}
const drift = (msg) => new Drift(msg);

function binding() {
  const problems = [];
  for (const [rel, re, fact] of ANCHORS) if (!re.test(read(rel))) problems.push(`${rel}: no longer matches "${fact}"`);
  if (problems.length) throw drift(problems.join("\n"));
  const heartbeatMs = msConstant("src/components/ActiveReaders.vue", "HEARTBEAT_MS");
  const windowMs = msConstant("src/lib/presence.ts", "ACTIVE_WINDOW_MS");
  const tickMs = 10_000;
  for (const [n, v] of [["HEARTBEAT_MS", heartbeatMs], ["ACTIVE_WINDOW_MS", windowMs]]) {
    if (v % tickMs) throw drift(`${n} = ${v} is not a multiple of the model tick (${tickMs} ms); change tickMs in check.mjs`);
  }
  return { heartbeatMs, windowMs, tickMs, heartbeat: heartbeatMs / tickMs, window: windowMs / tickMs };
}

// Coverage record + sync commit live in SKILL.md.
function coverage() {
  const skill = readFileSync(join(SKILL, "SKILL.md"), "utf8");
  const sync = skill.match(/^Sync commit: `([0-9a-f]{7,40})`/m)?.[1];
  const files = [...skill.matchAll(/^- `(src\/[^`]+)`/gm)].map((m) => m[1]);
  if (!sync || !files.length) throw new Error("SKILL.md is missing its 'Sync commit:' line or coverage list");
  const changed = execFileSync("git", ["diff", "--name-only", sync, "--", ...files], { cwd: REPO, encoding: "utf8" }).trim();
  return { sync, files, changed: changed ? changed.split("\n") : [] };
}

// ---------------------------------------------------------------- checks ---
const expected = JSON.parse(readFileSync(join(MODEL, "expected.json"), "utf8"));

function cfg(check, b) {
  const tabs = check.tabs.join(", ");
  const maxTime = 2 * b.window + 2;
  return [
    "SPECIFICATION Spec",
    `CONSTANTS`,
    `  Tabs = {${tabs}}`,
    `  Heartbeat = ${b.heartbeat}`,
    `  Window = ${b.window}`,
    `  MaxDelay = ${check.maxDelay ?? 1}`,
    `  MaxTime = ${maxTime}`,
    `  AllowReopen = ${check.allowReopen ? "TRUE" : "FALSE"}`,
    `  MaxEpoch = ${check.maxEpoch ?? 2}`,
    "CONSTRAINT Bounded",
    "INVARIANT TypeOK",
    ...check.rules.map((r) => `INVARIANT ${r}`),
    "",
  ].join("\n");
}

function parseTrace(out) {
  const blocks = out.split(/\n(?=State \d+: )/).filter((b) => /^State \d+: /.test(b));
  return blocks.map((block) => {
    const [head, ...rest] = block.split("\n");
    const action = head.match(/^State \d+: <(\w[\w ]*?)(?: line| >|>)/)?.[1] ?? head;
    const vars = {};
    let cur = null;
    for (const line of rest) {
      const m = line.match(/^\/\\ (\w+) = (.*)$/);
      if (m) vars[(cur = m[1])] = m[2];
      else if (cur && line.trim() && !line.startsWith("State ")) vars[cur] += " " + line.trim();
    }
    return { action, vars };
  });
}

const fnMap = (s = "") => Object.fromEntries([...s.matchAll(/(\w+) :> ("?[\w]+"?)/g)].map((m) => [m[1], m[2].replace(/"/g, "")]));
// TLC prints record fields in its own order, so read each field by name.
const records = (s = "") =>
  [...s.matchAll(/\[[^\]]*\]/g)].map((m) => ({
    kind: m[0].match(/kind \|-> "(\w+)"/)?.[1],
    tab: m[0].match(/tab \|-> (\w+)/)?.[1],
    key: m[0],
  }));

function story(trace, b) {
  const secs = (ticks) => `${Number(ticks) * (b.tickMs / 1000)} s`;
  const lines = [];
  for (let i = 1; i < trace.length; i++) {
    const prev = trace[i - 1].vars;
    const cur = trace[i].vars;
    const t0 = fnMap(prev.tab), t1 = fnMap(cur.tab);
    const changedTab = Object.keys(t1).find((k) => t0[k] !== t1[k]) ?? Object.keys(fnMap(cur.nextBeat)).find((k) => fnMap(prev.nextBeat)[k] !== fnMap(cur.nextBeat)[k]);
    const gone = records(prev.net).find((r) => !records(cur.net).some((c) => c.key === r.key));
    const at = `[t=${secs(cur.now)}]`;
    const say = {
      YouOpenTab: `tab ${changedTab} loads the page; ActiveReaders mounts and POSTs /api/presence`,
      YouOpenTabInBackground: `tab ${changedTab} loads the page in the background (no heartbeat)`,
      YouSwitchAway: `tab ${changedTab} is hidden; stop() clears the heartbeat timer`,
      YouSwitchBack: `tab ${changedTab} is visible again; start() POSTs /api/presence`,
      TimerFires: `tab ${changedTab}'s ${secs(b.heartbeat)} timer fires and POSTs /api/presence`,
      YouCloseTab: `tab ${changedTab} fires pagehide (close, reload or leave the site); sendBeacon POSTs /api/presence/leave`,
      AHeartbeatArrives: `server handles ${gone?.tab}'s heartbeat: ZADD presence score=now`,
      ALeaveArrives: `server handles ${gone?.tab}'s leave: ZREM presence`,
      TimePasses: `${secs(1)} pass`,
    }[trace[i].action] ?? trace[i].action;
    lines.push(`  ${String(i).padStart(2)}. ${at} ${say}`);
  }
  const last = trace.at(-1).vars;
  const counted = last.inSet === "TRUE" && Number(last.score) + b.window > Number(last.now);
  lines.push(`      => tabs ${JSON.stringify(fnMap(last.tab))}, in Redis: ${last.inSet === "TRUE" ? `yes (score t=${secs(last.score)})` : "no"}, counted: ${counted ? "yes" : "no"}`);
  return lines.join("\n");
}

function runTlc(name, check, b, tl) {
  const dir = join(OUT, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "Presence.tla"), readFileSync(join(MODEL, "Presence.tla")));
  writeFileSync(join(dir, "Presence.cfg"), cfg(check, b));
  const r = spawnSync(tl.java, ["-XX:+UseParallelGC", "-cp", tl.jar, "tlc2.TLC", "-workers", "1", "-metadir", join(dir, "states"), "-config", "Presence.cfg", "Presence.tla"], { cwd: dir, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const out = (r.stdout ?? "") + (r.stderr ?? "");
  writeFileSync(join(dir, "tlc.out"), out);
  const states = out.match(/(\d+) distinct states found/)?.[1];
  if (/Model checking completed\. No error has been found\./.test(out)) return { outcome: "pass", states, dir };
  const inv = out.match(/Error: Invariant (\w+) is violated/)?.[1];
  if (inv) return { outcome: "violates", rule: inv, states, dir, trace: parseTrace(out) };
  return { outcome: "error", dir, out: out.split("\n").slice(-25).join("\n") };
}

// ------------------------------------------------------------------ main ---
const only = process.argv[2];
let exit = 0;
let coverageWarn = false;
try {
  const b = binding();
  console.log(`code: HEARTBEAT_MS=${b.heartbeatMs}, ACTIVE_WINDOW_MS=${b.windowMs} (tick ${b.tickMs} ms; heartbeat ${b.heartbeat} ticks, window ${b.window} ticks); all ${ANCHORS.length} code anchors present`);
  const cov = coverage();
  if (cov.changed.length) {
    console.log(`COVERAGE: covered code changed since sync commit ${cov.sync}: ${cov.changed.join(", ")}`);
    console.log(`          Re-read those diffs against model/Presence.tla before trusting this result.`);
    coverageWarn = true;
  } else console.log(`coverage: no covered file changed since sync commit ${cov.sync}`);

  const tl = await tools();
  for (const [name, check] of Object.entries(expected.checks)) {
    if (only && only !== name) continue;
    const res = runTlc(name, check, b, tl);
    const want = check.expect;
    const match = res.outcome === want.outcome && (want.outcome !== "violates" || res.rule === want.rule);
    const label = res.outcome === "pass" ? `holds (${res.states} states)` : res.outcome === "violates" ? `VIOLATES ${res.rule}` : "TLC ERROR";
    console.log(`\n${match ? "as expected" : "CHANGED   "}  ${name}: ${label}${want.finding ? `  [known finding ${want.finding}]` : ""}`);
    console.log(`  ${check.question}`);
    if (res.trace) console.log(story(res.trace, b));
    if (res.outcome === "error") {
      console.log(res.out);
      exit = Math.max(exit, 3);
    } else if (!match) {
      exit = Math.max(exit, 1);
      if (want.outcome === "pass") console.log(`  -> NEW VIOLATION. Either the code broke this rule (a bug: the steps above, in code terms) or the model is wrong (check each step is possible in the code).`);
      else console.log(`  -> Known finding ${want.finding} no longer reproduces. If the code was fixed on purpose, set this check's expect to {"outcome":"pass"} in model/expected.json.`);
    }
    console.log(`  files: ${res.dir}`);
  }
} catch (e) {
  if (e instanceof Drift) {
    console.log(`MODEL DRIFT: the code no longer matches what Presence.tla assumes:\n${e.message}`);
    exit = 2;
  } else {
    console.log(`ERROR: ${e.stack ?? e}`);
    exit = 3;
  }
}
if (exit === 0 && coverageWarn) exit = 4;
console.log(`\n${["OK: every check matches model/expected.json", "CHANGED: a check outcome differs from model/expected.json", "DRIFT: the model no longer matches the code; nothing was checked", "ERROR", "OK BUT REVIEW: checks match, but covered code changed since the sync commit"][exit]}`);
process.exit(exit);
