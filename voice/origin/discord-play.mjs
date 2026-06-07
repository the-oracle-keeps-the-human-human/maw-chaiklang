#!/usr/bin/env node
// ChaiKlang origin voice → Discord. Joins 🔊・general and plays the 10 origin chunks as
// ONE continuous stream (single PassThrough fed file-by-file, no per-file transcode call).
//
//   node discord-play.mjs            play all 10 chunks back-to-back
//   node discord-play.mjs --only 1   play just chunk N (mic check)
//
// Hardened: clears any stale voice session first, survives networking errors, retries.
import { Client, GatewayIntentBits } from "discord.js";
import {
  joinVoiceChannel, createAudioPlayer, createAudioResource, StreamType,
  AudioPlayerStatus, VoiceConnectionStatus, entersState, getVoiceConnection,
} from "@discordjs/voice";
import { PassThrough } from "node:stream";
import { createReadStream } from "node:fs";

const GUILD = "1512058941536735383";          // Oracle School🔮
const VOICE_CHANNEL = "1512058942250024983";  // 🔊・general
const DIR = new URL(".", import.meta.url).pathname;
const FILES = Array.from({ length: 10 }, (_, i) => `${DIR}chunk-${String(i + 1).padStart(2, "0")}.mp3`);

const onlyIdx = process.argv.includes("--only") ? Number(process.argv[process.argv.indexOf("--only") + 1]) : null;
const playlist = onlyIdx ? [FILES[onlyIdx - 1]] : FILES;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const token = process.env.DISCORD_BOT_TOKEN;
if (!token) { console.error("no DISCORD_BOT_TOKEN"); process.exit(1); }

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });

function buildSingleStream(files) {
  const out = new PassThrough();
  let i = 0;
  const next = () => {
    if (i >= files.length) { out.end(); return; }
    const idx = i++;
    console.log(`  ▶ feeding chunk ${idx + 1}/${files.length} into the stream`);
    const rs = createReadStream(files[idx]);
    rs.on("end", next);
    rs.on("error", (e) => { console.error(e); out.end(); });
    rs.pipe(out, { end: false });
  };
  next();
  return out;
}

function freshConnection() {
  const conn = joinVoiceChannel({
    guildId: GUILD, channelId: VOICE_CHANNEL,
    adapterCreator: client.guilds.cache.get(GUILD).voiceAdapterCreator,
    selfDeaf: false, selfMute: false,
  });
  conn.on("error", (e) => console.error("voice conn error (handled):", e.message));
  return conn;
}

async function attemptPlay(n) {
  console.log(`--- attempt ${n} ---`);
  const conn = freshConnection();
  try {
    await entersState(conn, VoiceConnectionStatus.Ready, 20000);
  } catch (e) {
    console.error("not ready:", e.message); try { conn.destroy(); } catch {} return false;
  }
  console.log("✓ voice connection ready");

  const player = createAudioPlayer();
  conn.subscribe(player);
  const stream = buildSingleStream(playlist);
  player.play(createAudioResource(stream, { inputType: StreamType.Arbitrary }));
  console.log(`playing ${playlist.length} chunk(s) as one continuous stream`);

  return await new Promise((resolve) => {
    let done = false;
    const finish = (ok) => { if (done) return; done = true; resolve(ok); };
    player.on(AudioPlayerStatus.Idle, () => { console.log("■ stream finished cleanly"); try { conn.destroy(); } catch {} finish(true); });
    player.on("error", (e) => { console.error("player error:", e.message); try { conn.destroy(); } catch {} finish(false); });
    conn.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Promise.race([
          entersState(conn, VoiceConnectionStatus.Signalling, 5000),
          entersState(conn, VoiceConnectionStatus.Connecting, 5000),
        ]);
        console.log("…reconnecting voice");
      } catch { console.error("voice dropped (disconnected)"); try { conn.destroy(); } catch {} finish(false); }
    });
  });
}

client.once("clientReady", async () => {
  console.log(`logged in as ${client.user.tag}`);

  // Clear any stale ChaiKlang voice session this process owns (no churn — don't create/destroy extra connections).
  const ghost = getVoiceConnection(GUILD);
  if (ghost) { console.log("destroying stale voice connection"); try { ghost.destroy(); } catch {} await sleep(3000); }

  // One clean attempt; on a soft failure wait a long beat (let Discord reap voice state) and try once more.
  let ok = false;
  for (let n = 1; n <= 2 && !ok; n++) {
    ok = await attemptPlay(n);
    if (!ok && n < 2) await sleep(8000);
  }
  console.log(ok ? "RESULT: played all chunks ✓" : "RESULT: failed after retries ✗");
  try { await client.destroy(); } catch {}
  process.exit(ok ? 0 : 5);
});

client.login(token);
setTimeout(() => { console.error("global timeout"); getVoiceConnection(GUILD)?.destroy(); process.exit(4); }, 300000);
