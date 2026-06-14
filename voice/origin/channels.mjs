#!/usr/bin/env node
// List every server (guild) the bot is in + all channels (voice & text) with category + id.
//   node channels.mjs            all guilds
//   node channels.mjs <guildId>  one guild
import { Client, GatewayIntentBits, ChannelType } from "discord.js";

const only = process.argv[2];
const token = process.env.DISCORD_BOT_TOKEN;
if (!token) { console.error("no DISCORD_BOT_TOKEN"); process.exit(1); }

const KIND = {
  [ChannelType.GuildText]: "📝 text",
  [ChannelType.GuildVoice]: "🔊 voice",
  [ChannelType.GuildStageVoice]: "🎙️ stage",
  [ChannelType.GuildAnnouncement]: "📣 news",
  [ChannelType.GuildForum]: "💬 forum",
};

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });
client.once("clientReady", async () => {
  console.log(`logged in as ${client.user.tag} (${client.user.id})\n`);
  for (const [, g] of client.guilds.cache) {
    if (only && g.id !== only) continue;
    console.log(`🏠 SERVER: ${g.name}  (${g.id})`);
    const chans = await g.channels.fetch().catch(() => g.channels.cache);
    // group by category
    const byCat = new Map();
    for (const [, c] of chans) {
      if (!c || !(c.type in KIND)) continue;
      const cat = c.parent?.name || "(no category)";
      if (!byCat.has(cat)) byCat.set(cat, []);
      byCat.get(cat).push(c);
    }
    for (const [cat, list] of byCat) {
      console.log(`  📂 ${cat}`);
      for (const c of list.sort((a, b) => (a.rawPosition ?? 0) - (b.rawPosition ?? 0))) {
        const occ = c.type === ChannelType.GuildVoice && c.members?.size ? `  [${c.members.size} in voice]` : "";
        console.log(`     ${KIND[c.type]}  ${c.name}  (${c.id})${occ}`);
      }
    }
    console.log("");
  }
  await client.destroy();
  process.exit(0);
});
client.login(token);
setTimeout(() => { console.error("timeout"); process.exit(2); }, 20000);
