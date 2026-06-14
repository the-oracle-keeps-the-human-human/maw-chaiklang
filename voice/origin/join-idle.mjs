#!/usr/bin/env node
// Join a voice channel and STAY there quietly (muted + deafened), with reconnect.
// For "all bots wait in General" — idle presence, no audio, minimal resources.
//   node join-idle.mjs <guildId> <channelId>
import { Client, GatewayIntentBits } from "discord.js";
import {
  joinVoiceChannel, VoiceConnectionStatus, entersState, getVoiceConnection,
} from "@discordjs/voice";

const GUILD = process.argv[2] || "1410301189123342488";       // Soul Brews - Brewing for Life
const CHANNEL = process.argv[3] || "1410301190092099637";     // General (voice)
const token = process.env.DISCORD_BOT_TOKEN;
if (!token) { console.error("no DISCORD_BOT_TOKEN"); process.exit(1); }

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });
const stamp = () => new Date().toISOString().slice(11, 19);

function join() {
  const conn = joinVoiceChannel({
    guildId: GUILD, channelId: CHANNEL,
    adapterCreator: client.guilds.cache.get(GUILD).voiceAdapterCreator,
    selfDeaf: true, selfMute: true,   // quiet idle presence, conserve resources
  });
  conn.on("error", (e) => console.log(`${stamp()} conn error (handled): ${e.message}`));
  conn.on(VoiceConnectionStatus.Disconnected, async () => {
    console.log(`${stamp()} disconnected — trying to recover`);
    try {
      await Promise.race([
        entersState(conn, VoiceConnectionStatus.Signalling, 5000),
        entersState(conn, VoiceConnectionStatus.Connecting, 5000),
      ]);
      console.log(`${stamp()} reconnecting`);
    } catch {
      console.log(`${stamp()} could not recover — rejoining fresh`);
      try { conn.destroy(); } catch {}
      setTimeout(join, 3000);
    }
  });
  return conn;
}

client.once("clientReady", async () => {
  console.log(`${stamp()} logged in as ${client.user.tag} — idling in voice ${CHANNEL}`);
  const ghost = getVoiceConnection(GUILD);
  if (ghost) { try { ghost.destroy(); } catch {} await new Promise(r => setTimeout(r, 2000)); }
  const conn = join();
  try { await entersState(conn, VoiceConnectionStatus.Ready, 20000); console.log(`${stamp()} ✓ ready, holding (muted+deafened)`); }
  catch (e) { console.log(`${stamp()} not ready: ${e.message}`); }
  // stay alive indefinitely; heartbeat log every 5 min
  setInterval(() => {
    const c = getVoiceConnection(GUILD);
    console.log(`${stamp()} alive — voice status: ${c?.state?.status || "none"}`);
  }, 300000);
});
client.login(token);
// no global timeout — persistent daemon
