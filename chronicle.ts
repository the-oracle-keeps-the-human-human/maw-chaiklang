/**
 * chronicle.ts — pure, testable core for `maw chaiklang chronicle`.
 *
 * Incremental Discord → Chronicle backend sync.
 * Cursor = last synced message snowflake (time-ordered). Timestamp is the truth.
 * Pure functions here; all I/O (Discord fetch, POST, state file) lives in index.ts.
 */

export type DiscordMessage = {
  id: string;                 // snowflake (time-ordered)
  timestamp: string;          // ISO 8601 — the truth
  content: string;
  author?: { username?: string; id?: string };
};

export type ChronicleEvent = {
  oracle: string;
  channel_id: string;
  message_id: string;
  ts: string;                 // ISO timestamp (source of truth)
  author: string;
  content: string;
};

/** snowflake compare — BigInt so we never lose precision on 19-digit ids. */
export function isNewer(id: string, sinceId: string | null): boolean {
  if (!sinceId) return true;
  try { return BigInt(id) > BigInt(sinceId); } catch { return false; }
}

/** Delta: only messages strictly newer than the cursor. Never re-emits old ones. */
export function filterDelta(messages: DiscordMessage[], sinceId: string | null): DiscordMessage[] {
  return messages
    .filter((m) => isNewer(m.id, sinceId))
    .sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1)); // oldest → newest
}

/** Build the Chronicle payload — one event per message, keyed by ts downstream. */
export function buildChroniclePayload(
  messages: DiscordMessage[],
  ctx: { oracle: string; channelId: string },
): ChronicleEvent[] {
  return messages.map((m) => ({
    oracle: ctx.oracle,
    channel_id: ctx.channelId,
    message_id: m.id,
    ts: m.timestamp,
    author: m.author?.username ?? "unknown",
    content: m.content ?? "",
  }));
}

/** Chronicle backend (oracle-chronicle /api/record) record shape — one per event. */
export type ChronicleRecord = {
  oracle: string;
  type: "discord_message";
  data: { channel: string; message_id: string; author: string; content: string; ts: string };
  ts: string;
};

/** Map a ChronicleEvent → the /api/record body the backend accepts. */
export function toRecord(e: ChronicleEvent): ChronicleRecord {
  return {
    oracle: e.oracle,
    type: "discord_message",
    data: { channel: e.channel_id, message_id: e.message_id, author: e.author, content: e.content, ts: e.ts },
    ts: e.ts,
  };
}

/** Advance the cursor to the newest id seen; keep previous if nothing new. */
export function nextCursor(messages: DiscordMessage[], prev: string | null): string | null {
  if (messages.length === 0) return prev;
  let max = prev ? BigInt(prev) : 0n;
  for (const m of messages) { const v = BigInt(m.id); if (v > max) max = v; }
  return max === 0n ? prev : max.toString();
}
