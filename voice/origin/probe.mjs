#!/usr/bin/env node
// Read-only probe: log in as ChaiKlang, find the guild for the workshop text channel,
// list its voice channels and who's in them. No voice join, no messages.
import { Client, GatewayIntentBits } from "discord.js";

const TEXT_CHANNEL = "1513113459682705408";
const token = process.env.DISCORD_BOT_TOKEN;
if (!token) { console.error("no DISCORD_BOT_TOKEN"); process.exit(1); }

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

client.once("clientReady", async () => {
  console.log(`logged in as ${client.user.tag} (${client.user.id})`);
  for (const [, g] of client.guilds.cache) {
    const ch = g.channels.cache.get(TEXT_CHANNEL);
    const tag = ch ? "  <-- workshop guild" : "";
    console.log(`guild ${g.name} (${g.id})${tag}`);
    if (ch) {
      for (const [, c] of g.channels.cache) {
        if (c.type === 2 || c.type === 13) { // GuildVoice / StageVoice
          const members = [...(c.members?.values() || [])].map((m) => m.user.username);
          console.log(`  🔊 ${c.name} (${c.id})${members.length ? "  members: " + members.join(", ") : ""}`);
        }
      }
    }
  }
  await client.destroy();
  process.exit(0);
});

client.login(token);
setTimeout(() => { console.error("timeout"); process.exit(2); }, 20000);
