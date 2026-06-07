/**
 * chronicle.test.ts — TDD spec for the Chronicle sync core.
 * Run: bun test
 * These tests ARE the client-side contract for `maw <name> chronicle`.
 */
import { test, expect, describe } from "bun:test";
import { isNewer, filterDelta, buildChroniclePayload, nextCursor, type DiscordMessage } from "./chronicle";

const M = (id: string, ts: string, content = "", username = "bms"): DiscordMessage => ({
  id, timestamp: ts, content, author: { username },
});

const msgs: DiscordMessage[] = [
  M("100", "2026-06-07T09:00:00.000Z", "hello"),
  M("102", "2026-06-07T09:02:00.000Z", "world"),
  M("101", "2026-06-07T09:01:00.000Z", "middle"),
];

describe("isNewer (snowflake compare)", () => {
  test("everything is new when cursor is null (first run)", () => {
    expect(isNewer("100", null)).toBe(true);
  });
  test("strictly-greater snowflake is newer", () => {
    expect(isNewer("102", "101")).toBe(true);
    expect(isNewer("101", "101")).toBe(false); // not strictly newer — no double-emit
    expect(isNewer("100", "101")).toBe(false);
  });
});

describe("filterDelta", () => {
  test("returns only messages newer than cursor, oldest→newest", () => {
    const out = filterDelta(msgs, "100");
    expect(out.map((m) => m.id)).toEqual(["101", "102"]);
  });
  test("first run (null cursor) returns all, sorted by id", () => {
    expect(filterDelta(msgs, null).map((m) => m.id)).toEqual(["100", "101", "102"]);
  });
  test("no new messages → empty (idempotent re-run)", () => {
    expect(filterDelta(msgs, "102")).toEqual([]);
  });
});

describe("buildChroniclePayload", () => {
  test("maps each message to a Chronicle event with ts as the truth", () => {
    const out = buildChroniclePayload(filterDelta(msgs, "100"), { oracle: "chaiklang", channelId: "999" });
    expect(out).toEqual([
      { oracle: "chaiklang", channel_id: "999", message_id: "101", ts: "2026-06-07T09:01:00.000Z", author: "bms", content: "middle" },
      { oracle: "chaiklang", channel_id: "999", message_id: "102", ts: "2026-06-07T09:02:00.000Z", author: "bms", content: "world" },
    ]);
  });
  test("missing author falls back to 'unknown'", () => {
    const out = buildChroniclePayload([{ id: "1", timestamp: "t", content: "x" }], { oracle: "o", channelId: "c" });
    expect(out[0].author).toBe("unknown");
  });
});

describe("nextCursor (atomic advance)", () => {
  test("advances to the max snowflake seen", () => {
    expect(nextCursor(msgs, "100")).toBe("102");
  });
  test("keeps previous cursor when nothing new (POST fail safe)", () => {
    expect(nextCursor([], "102")).toBe("102");
  });
  test("never goes backwards", () => {
    expect(nextCursor([M("101", "t")], "105")).toBe("105");
  });
});
