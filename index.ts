/**
 * maw chaiklang — ChaiKlang Oracle (ชายกลาง) plugin.
 *
 * The middle switchboard. Thin, self-contained dispatcher.
 *   maw chaiklang say [message]   → say hello (default: hello world)
 *   maw chaiklang status          → identity + role
 *   maw chaiklang --tree          → command tree
 */
import type { InvokeContext, InvokeResult } from "maw-js/plugin/types";

export const command = {
  name: "chaiklang",
  description: "ChaiKlang Oracle (ชายกลาง) — the middle switchboard.",
};

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
    log("├── say [message]   say hello (default: hello world)");
    log("├── status          identity + role");
    log("└── --tree          this command tree");
    return done(true);
  }

  if (!sub || sub === "help" || sub === "-h" || sub === "--help") {
    log("maw chaiklang — ChaiKlang Oracle (ชายกลาง), the middle switchboard 🎙️");
    log("");
    log("  say [message]   say hello (default: hello world)");
    log("  status          identity + role");
    log("  --tree          command tree");
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
    default:
      log(`unknown: ${sub} — run 'maw chaiklang --help'`);
      return done(false);
  }
}
