#!/usr/bin/env node
// Play ONE mp3 file into 🔊・general and leave. For the round-table turn (short clip < 50s).
//   node play-one.mjs roundtable.mp3
import { Client, GatewayIntentBits } from "discord.js";
import {
  joinVoiceChannel, createAudioPlayer, createAudioResource, StreamType,
  AudioPlayerStatus, VoiceConnectionStatus, entersState, getVoiceConnection,
} from "@discordjs/voice";
import { createReadStream } from "node:fs";

const GUILD = "1512058941536735383";          // Oracle School🔮
const VOICE_CHANNEL = "1512058942250024983";  // 🔊・general
const file = process.argv[2];
if (!file) { console.error("usage: node play-one.mjs <file.mp3>"); process.exit(1); }
const DIR = new URL(".", import.meta.url).pathname;
const path = file.startsWith("/") ? file : DIR + file;

const token = process.env.DISCORD_BOT_TOKEN;
if (!token) { console.error("no DISCORD_BOT_TOKEN"); process.exit(1); }
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });

client.once("clientReady", async () => {
  console.log(`logged in as ${client.user.tag}; playing ${path}`);
  const ghost = getVoiceConnection(GUILD);
  if (ghost) { try { ghost.destroy(); } catch {} await new Promise(r => setTimeout(r, 2000)); }

  const conn = joinVoiceChannel({
    guildId: GUILD, channelId: VOICE_CHANNEL,
    adapterCreator: client.guilds.cache.get(GUILD).voiceAdapterCreator,
    selfDeaf: false, selfMute: false,
  });
  conn.on("error", (e) => console.error("conn error (handled):", e.message));
  try { await entersState(conn, VoiceConnectionStatus.Ready, 20000); }
  catch (e) { console.error("not ready:", e.message); conn.destroy(); process.exit(2); }
  console.log("✓ voice ready");

  const player = createAudioPlayer();
  conn.subscribe(player);
  player.play(createAudioResource(createReadStream(path), { inputType: StreamType.Arbitrary }));
  console.log("▶ playing");
  player.on(AudioPlayerStatus.Idle, () => {
    console.log("■ done, leaving");
    try { conn.destroy(); } catch {}
    client.destroy().then(() => process.exit(0));
  });
  player.on("error", (e) => { console.error("player error:", e.message); try { conn.destroy(); } catch {} process.exit(3); });
});
client.login(token);
setTimeout(() => { console.error("timeout"); getVoiceConnection(GUILD)?.destroy(); process.exit(4); }, 60000);
