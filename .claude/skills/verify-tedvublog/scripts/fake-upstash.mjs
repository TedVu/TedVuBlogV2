#!/usr/bin/env node
// Verification scaffolding: an in-memory stand-in for the Upstash Redis REST API,
// so a verification run never reads or writes the production likes/presence data.
//
// It speaks the subset of the protocol that @upstash/redis uses for this repo:
//   POST /            body ["cmd", ...args]           -> {"result": ...}
//   POST /pipeline    body [["cmd", ...args], ...]    -> [{"result": ...}, ...]
// with `Authorization: Bearer <token>` and base64 string results when the client
// sends `Upstash-Encoding: base64` (the SDK default).
//
// EVAL accepts exactly one script: the ADD_LIKE_SCRIPT literal read from
// src/lib/likes.ts at startup. Any other script is an error, so a change to the
// Lua in likes.ts fails loudly here instead of being silently mis-emulated.
//
// Side channel for the verification harness (never used by the app):
//   GET  /__verify/info    -> { pid, scriptSha, commands }
//   GET  /__verify/dump    -> full store + command count
//   POST /__verify/reset   -> empty store
//   POST /__verify/seed    -> body { likes: { "blog/slug": 3 }, voters: { "blog/slug": ["hash"] } }
//
// Usage: node fake-upstash.mjs --port 0 --token <token> --repo <repo root> [--ready-file <path>]

import { createServer } from "node:http";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, all) => {
    if (cur.startsWith("--")) acc.push([cur.slice(2), all[i + 1]]);
    return acc;
  }, []),
);
const TOKEN = args.token;
const REPO = args.repo;
if (!TOKEN || !REPO) {
  console.error("usage: fake-upstash.mjs --port <n> --token <t> --repo <dir>");
  process.exit(2);
}

// --- the one Lua script this fake understands -------------------------------
const likesSource = readFileSync(join(REPO, "src/lib/likes.ts"), "utf8");
const scriptMatch = likesSource.match(/const ADD_LIKE_SCRIPT = `([\s\S]*?)`;/);
if (!scriptMatch) {
  console.error("fake-upstash: could not find ADD_LIKE_SCRIPT in src/lib/likes.ts");
  process.exit(3);
}
// JS normalizes CRLF inside template literals to LF, so the string the SDK
// sends has LF even when the checkout has CRLF line endings.
const ADD_LIKE_SCRIPT = scriptMatch[1].replace(/\r\n?/g, "\n");
const EXPECTED_BODY = `
if redis.call('SADD', KEYS[2], ARGV[2]) == 1 then
  return redis.call('ZINCRBY', KEYS[1], 1, ARGV[1])
end
return redis.call('ZSCORE', KEYS[1], ARGV[1]) or 0
`;
const scriptKnown = ADD_LIKE_SCRIPT === EXPECTED_BODY;
const scriptSha = createHash("sha1").update(ADD_LIKE_SCRIPT).digest("hex");

// --- store --------------------------------------------------------------------
let zsets = new Map(); // key -> Map(member -> score)
let sets = new Map(); // key -> Set(member)
let expiries = new Map(); // key -> epoch ms
let commands = 0;

function expireCheck(key) {
  const at = expiries.get(key);
  if (at !== undefined && Date.now() >= at) {
    zsets.delete(key);
    sets.delete(key);
    expiries.delete(key);
  }
}
const zset = (key, create = false) => {
  expireCheck(key);
  if (!zsets.has(key) && create) zsets.set(key, new Map());
  return zsets.get(key);
};
const set = (key, create = false) => {
  expireCheck(key);
  if (!sets.has(key) && create) sets.set(key, new Set());
  return sets.get(key);
};
const fmtScore = (n) => String(n);
const sorted = (z) => [...z.entries()].sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

function run(cmd) {
  commands++;
  const [rawName, ...a] = cmd;
  const name = String(rawName).toLowerCase();
  switch (name) {
    case "ping":
      return "PONG";
    case "zscore": {
      const z = zset(a[0]);
      const s = z?.get(String(a[1]));
      return s === undefined ? null : fmtScore(s);
    }
    case "zincrby": {
      const z = zset(a[0], true);
      const m = String(a[2]);
      const next = (z.get(m) ?? 0) + Number(a[1]);
      z.set(m, next);
      return fmtScore(next);
    }
    case "zadd": {
      const z = zset(a[0], true);
      let added = 0;
      for (let i = 1; i < a.length; i += 2) {
        const m = String(a[i + 1]);
        if (!z.has(m)) added++;
        z.set(m, Number(a[i]));
      }
      return added;
    }
    case "zrem": {
      const z = zset(a[0]);
      let removed = 0;
      for (const m of a.slice(1)) if (z?.delete(String(m))) removed++;
      return removed;
    }
    case "zcard":
      return zset(a[0])?.size ?? 0;
    case "zremrangebyscore": {
      const z = zset(a[0]);
      if (!z) return 0;
      const lo = a[1] === "-inf" ? -Infinity : Number(a[1]);
      const hi = a[2] === "+inf" ? Infinity : Number(a[2]);
      let removed = 0;
      for (const [m, s] of [...z]) if (s >= lo && s <= hi) (z.delete(m), removed++);
      return removed;
    }
    case "zrange": {
      const z = zset(a[0]);
      const flags = a.slice(3).map((f) => String(f).toLowerCase());
      if (flags.includes("byscore") || flags.includes("bylex")) throw new Error("fake-upstash: zrange byscore/bylex not implemented");
      let entries = z ? sorted(z) : [];
      if (flags.includes("rev")) entries = entries.reverse();
      let start = Number(a[1]);
      let stop = Number(a[2]);
      if (start < 0) start = Math.max(0, entries.length + start);
      if (stop < 0) stop = entries.length + stop;
      entries = entries.slice(start, stop + 1);
      return flags.includes("withscores") ? entries.flatMap(([m, s]) => [m, fmtScore(s)]) : entries.map(([m]) => m);
    }
    case "sadd": {
      const s = set(a[0], true);
      let added = 0;
      for (const m of a.slice(1)) if (!s.has(String(m))) (s.add(String(m)), added++);
      return added;
    }
    case "smembers":
      return [...(set(a[0]) ?? [])];
    case "expire": {
      expireCheck(a[0]);
      if (!zsets.has(a[0]) && !sets.has(a[0])) return 0;
      expiries.set(a[0], Date.now() + Number(a[1]) * 1000);
      return 1;
    }
    case "ttl": {
      expireCheck(a[0]);
      if (!zsets.has(a[0]) && !sets.has(a[0])) return -2;
      const at = expiries.get(a[0]);
      return at === undefined ? -1 : Math.ceil((at - Date.now()) / 1000);
    }
    case "eval": {
      const [script, numKeys, ...rest] = a;
      if (script !== ADD_LIKE_SCRIPT || !scriptKnown) {
        throw new Error("fake-upstash: unknown EVAL script; update scripts/fake-upstash.mjs to emulate the new Lua in src/lib/likes.ts");
      }
      const keys = rest.slice(0, Number(numKeys));
      const argv = rest.slice(Number(numKeys));
      // Mirrors the Lua exactly; one call is one atomic step, as in Redis.
      if (run(["sadd", keys[1], argv[1]]) === 1) return run(["zincrby", keys[0], 1, argv[0]]);
      return run(["zscore", keys[0], argv[0]]) ?? 0;
    }
    default:
      throw new Error(`fake-upstash: command '${name}' not implemented`);
  }
}

const b64 = (v) =>
  typeof v === "string"
    ? v === "OK"
      ? v
      : Buffer.from(v, "utf8").toString("base64")
    : Array.isArray(v)
      ? v.map(b64)
      : v;

function dump() {
  for (const k of [...zsets.keys(), ...sets.keys()]) expireCheck(k);
  return {
    zsets: Object.fromEntries([...zsets].map(([k, z]) => [k, Object.fromEntries(sorted(z))])),
    sets: Object.fromEntries([...sets].map(([k, s]) => [k, [...s].sort()])),
    expiries: Object.fromEntries(expiries),
    commands,
  };
}

const readBody = (req) =>
  new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });

const send = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://x");
    if (url.pathname.startsWith("/__verify/")) {
      const what = url.pathname.slice("/__verify/".length);
      if (what === "info") return send(res, 200, { pid: process.pid, scriptSha, scriptKnown, commands, fake: "fake-upstash" });
      if (what === "dump") return send(res, 200, dump());
      if (what === "reset" && req.method === "POST") {
        zsets = new Map();
        sets = new Map();
        expiries = new Map();
        return send(res, 200, { ok: true });
      }
      if (what === "seed" && req.method === "POST") {
        const body = JSON.parse((await readBody(req)) || "{}");
        for (const [postKey, n] of Object.entries(body.likes ?? {})) zset("likes", true).set(postKey, Number(n));
        for (const [postKey, voters] of Object.entries(body.voters ?? {})) for (const v of voters) set(`likes:voters:${postKey}`, true).add(v);
        return send(res, 200, { ok: true });
      }
      return send(res, 404, { error: "unknown verify endpoint" });
    }

    if (req.method !== "POST") return send(res, 405, { error: "POST only" });
    if (req.headers.authorization !== `Bearer ${TOKEN}`) return send(res, 401, { error: "Unauthorized" });
    const encode = String(req.headers["upstash-encoding"] ?? "").toLowerCase() === "base64" ? b64 : (v) => v;
    const body = JSON.parse(await readBody(req));
    const path = url.pathname.replace(/\/+$/, "");

    if (path === "/pipeline" || path === "/multi-exec") {
      const out = body.map((cmd) => {
        try {
          return { result: encode(run(cmd)) };
        } catch (e) {
          return { error: e.message };
        }
      });
      return send(res, 200, out);
    }
    if (path === "") {
      try {
        return send(res, 200, { result: encode(run(body)) });
      } catch (e) {
        console.error(e.message);
        return send(res, 400, { error: e.message });
      }
    }
    return send(res, 404, { error: `unknown path ${url.pathname}` });
  } catch (e) {
    console.error(e);
    send(res, 500, { error: String(e?.message ?? e) });
  }
});

server.listen(Number(args.port ?? 0), "127.0.0.1", () => {
  const { port } = server.address();
  console.log(`fake-upstash listening on http://127.0.0.1:${port} (script ${scriptKnown ? "known" : "UNKNOWN"} sha ${scriptSha})`);
  if (args["ready-file"]) writeFileSync(args["ready-file"], JSON.stringify({ port, pid: process.pid }));
});
