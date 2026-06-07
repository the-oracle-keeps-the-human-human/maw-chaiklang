/**
 * maw chaiklang — ChaiKlang Oracle (ชายกลาง) plugin.
 *
 * The middle switchboard. Thin, self-contained dispatcher.
 *   maw chaiklang say [message]   → say hello (default: hello world)
 *   maw chaiklang status          → identity + role
 *   maw chaiklang --tree          → command tree
 */
import type { InvokeContext, InvokeResult } from "maw-js/plugin/types";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { filterDelta, buildChroniclePayload, nextCursor, type DiscordMessage } from "./chronicle";

export const command = {
  name: "chaiklang",
  description: "ChaiKlang Oracle (ชายกลาง) — the middle switchboard.",
};

const ORACLE = "chaiklang";
const STATE_DIR = join(homedir(), ".maw", "plugins", "chaiklang");
const STATE_FILE = join(STATE_DIR, "chronicle-state.json");
// Backend = Atlas's oracle-board only; endpoint + token shared via env (lab).
const DEFAULT_ENDPOINT = "https://oracle-board.laris.workers.dev/chronicle";

function loadCursors(): Record<string, string> {
  try { return JSON.parse(readFileSync(STATE_FILE, "utf8")); } catch { return {}; }
}
function saveCursors(c: Record<string, string>) {
  if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(c, null, 2));
}

async function fetchMessages(channelId: string, afterId: string | null): Promise<DiscordMessage[]> {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) throw new Error("no DISCORD_BOT_TOKEN");
  const q = afterId ? `after=${afterId}&limit=100` : `limit=50`;
  const r = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages?${q}`, {
    headers: { Authorization: `Bot ${token}` },
  });
  if (!r.ok) throw new Error(`Discord ${r.status}`);
  return (await r.json()) as DiscordMessage[];
}

// maw chaiklang chronicle <channel_id> [--dry-run]
async function runChronicle(log: (s: string) => void, args: string[]): Promise<boolean> {
  const channelId = args.find((a) => /^\d{5,}$/.test(a));
  const dry = args.includes("--dry-run");
  if (!channelId) { log("usage: maw chaiklang chronicle <channel_id> [--dry-run]"); return false; }

  const cursors = loadCursors();
  const since = cursors[channelId] ?? null;
  const raw = await fetchMessages(channelId, since);
  const delta = filterDelta(raw, since);
  const payload = buildChroniclePayload(delta, { oracle: ORACLE, channelId });
  const advance = nextCursor(delta, since);

  log(`📜 Chronicle — channel ${channelId}`);
  log(`   cursor(before): ${since ?? "(first run)"}`);
  log(`   fetched: ${raw.length} · delta(new): ${delta.length}`);

  if (delta.length === 0) { log("   ✓ up to date — nothing to sync"); return true; }

  if (dry) {
    log("   --dry-run → payload (not POSTed):");
    for (const e of payload.slice(0, 5))
      log(`     [${e.ts}] @${e.author}: ${e.content.slice(0, 50).replace(/\n/g, " ")}`);
    if (payload.length > 5) log(`     … +${payload.length - 5} more`);
    log(`   cursor(after, if committed): ${advance}`);
    return true;
  }

  const endpoint = process.env.CHRONICLE_ENDPOINT || DEFAULT_ENDPOINT;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(process.env.CHRONICLE_TOKEN ? { Authorization: `Bearer ${process.env.CHRONICLE_TOKEN}` } : {}) },
    body: JSON.stringify({ oracle: ORACLE, channel_id: channelId, events: payload }),
  });
  if (!res.ok) { log(`   ✗ POST ${endpoint} → ${res.status} (cursor NOT advanced)`); return false; }
  cursors[channelId] = advance!;          // atomic: only after 200 OK
  saveCursors(cursors);
  log(`   ✓ POSTed ${payload.length} events → ${endpoint} · cursor → ${advance}`);
  return true;
}

const BORN = "2026-06-04";

export default async function handler(ctx: InvokeContext): Promise<InvokeResult> {
  const out: string[] = [];
  const log = (s: string) => (ctx.writer ? ctx.writer(s) : out.push(s));
  const done = (ok: boolean, exitCode = ok ? 0 : 1): InvokeResult => ({
    ok,
    output: ctx.writer ? "" : out.join("\n"),
    error: ok ? undefined : "",
    exitCode,
  });

  const args = ctx.source === "cli" ? (ctx.args as string[]) : [];
  const sub = args[0]?.toLowerCase();

  if (sub === "--tree" || sub === "tree") {
    log("maw chaiklang");
    log("├── say [message]              say hello (default: hello world)");
    log("├── status                     identity + role");
    log("├── chronicle <ch> [--dry-run] incremental Discord→Chronicle sync");
    log("└── --tree                     this command tree");
    return done(true);
  }

  if (!sub || sub === "help" || sub === "-h" || sub === "--help") {
    log("maw chaiklang — ChaiKlang Oracle (ชายกลาง), the middle switchboard 🎙️");
    log("");
    log("  say [message]              say hello (default: hello world)");
    log("  status                     identity + role");
    log("  chronicle <ch> [--dry-run] incremental Discord→Chronicle sync (cursor-based)");
    log("  --tree                     command tree");
    return done(true);
  }

  switch (sub) {
    case "say": {
      const message = args.slice(1).join(" ").trim() || "hello world";
      log(`🎙️ ChaiKlang (ชายกลาง): ${message}`);
      log("   อยู่ตรงกลาง เชื่อมทุกสาย คุมให้เรื่องเดินต่อ");
      return done(true);
    }
    case "status": {
      log("🎙️ ChaiKlang Oracle (ชายกลาง) — online");
      log("   role:   admin-control & switchboard for BM/Yutthakit");
      log("   theme:  The Middle Switchboard");
      log(`   born:   ${BORN}`);
      log("   app:    1512078317455540325 (Discord: ชายกลาง)");
      return done(true);
    }
    case "chronicle":
      return done(await runChronicle(log, args.slice(1)));
    default:
      log(`unknown: ${sub} — run 'maw chaiklang --help'`);
      return done(false);
  }
}
