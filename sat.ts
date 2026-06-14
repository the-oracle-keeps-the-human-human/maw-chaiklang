/**
 * maw chaiklang sat — satellite-image backfill (ชายกลาง).
 *
 * Pulls NASA Worldview "Snapshots" true-color imagery (MODIS/VIIRS) for a
 * date RANGE — no API key, no signup. Built backfill-first:
 *   - idempotent : skips a date whose file already exists & is a valid JPEG
 *   - resumable  : re-run continues where it stopped (skip-existing)
 *   - gap-aware  : failed dates are recorded so `--gaps-only` retries just them
 *   - manifest   : every run rewrites manifest.json (date → file/bytes/status)
 *
 *   maw chaiklang sat <start> <end> [--bbox=S,W,N,E] [--out=dir]
 *                                   [--layers=...] [--gaps-only] [--dry-run]
 *   e.g. maw chaiklang sat 2025-01-01 2025-04-30   # burning-season backfill
 */
import { writeFileSync, mkdirSync, existsSync, readFileSync, statSync } from "fs";
import { join } from "path";

const SNAPSHOT_API = "https://wvs.earthdata.nasa.gov/api/v1/snapshot";
const DEFAULT_BBOX = "16,97,21,102"; // S,W,N,E — Northern Thailand (Chiang Mai haze basin)
const DEFAULT_LAYERS =
  "MODIS_Terra_CorrectedReflectance_TrueColor,MODIS_Terra_Thermal_Anomalies_All";
const MIN_VALID_BYTES = 3000; // smaller ⇒ NASA returned an error page, not an image

export type DayStatus = "ok" | "skipped" | "gap" | "planned";

export interface DayResult {
  date: string;
  file: string;
  bytes: number;
  status: DayStatus;
  note?: string;
}

export interface BackfillOptions {
  start: string;
  end: string;
  bbox: string;
  layers: string;
  outDir: string;
  gapsOnly: boolean;
  force: boolean;
  dryRun: boolean;
}

/** Inclusive list of YYYY-MM-DD strings from start..end (UTC, no Date-now needed). */
export function dateRange(start: string, end: string): string[] {
  const toN = (s: string): number => Date.parse(`${s}T00:00:00Z`);
  const out: string[] = [];
  const s = toN(start);
  const e = toN(end);
  if (Number.isNaN(s) || Number.isNaN(e) || s > e) return out;
  for (let t = s; t <= e; t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

export function snapshotUrl(date: string, bbox: string, layers: string): string {
  const q = new URLSearchParams({
    REQUEST: "GetSnapshot",
    CRS: "EPSG:4326",
    BBOX: bbox,
    TIME: date,
    LAYERS: layers,
    FORMAT: "image/jpeg",
    WIDTH: "1024",
    HEIGHT: "1024",
  });
  return `${SNAPSHOT_API}?${q.toString()}`;
}

/** A file already on disk and big enough counts as done (idempotent skip). */
function alreadyHave(path: string): number {
  if (!existsSync(path)) return 0;
  const n = statSync(path).size;
  return n >= MIN_VALID_BYTES ? n : 0;
}

export function parseArgs(args: string[]): BackfillOptions | null {
  const positional = args.filter((a) => !a.startsWith("--"));
  const flag = (name: string, dflt: string): string => {
    const hit = args.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : dflt;
  };
  const [start, end] = positional;
  if (!start || !end) return null;
  return {
    start,
    end,
    bbox: flag("bbox", DEFAULT_BBOX),
    layers: flag("layers", DEFAULT_LAYERS),
    outDir: flag("out", join(process.cwd(), "sat-backfill")),
    gapsOnly: args.includes("--gaps-only"),
    force: args.includes("--force"),
    dryRun: args.includes("--dry-run"),
  };
}

async function fetchDay(
  date: string,
  opt: BackfillOptions,
  log: (s: string) => void,
): Promise<DayResult> {
  const file = join(opt.outDir, `cnx_${date}.jpg`);

  const have = alreadyHave(file);
  if (have && !opt.gapsOnly && !opt.force) {
    return { date, file, bytes: have, status: "skipped", note: "exists" };
  }

  const res = await fetch(snapshotUrl(date, opt.bbox, opt.layers));
  if (!res.ok) {
    log(`   ✗ ${date} → HTTP ${res.status}`);
    return { date, file, bytes: 0, status: "gap", note: `HTTP ${res.status}` };
  }
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf.byteLength < MIN_VALID_BYTES) {
    log(`   ✗ ${date} → ${buf.byteLength}B (error page, not imagery)`);
    return { date, file, bytes: buf.byteLength, status: "gap", note: "too small" };
  }
  writeFileSync(file, buf);
  log(`   ✓ ${date} → ${(buf.byteLength / 1024).toFixed(0)}KB`);
  return { date, file, bytes: buf.byteLength, status: "ok" };
}

export async function runSat(log: (s: string) => void, args: string[]): Promise<boolean> {
  const opt = parseArgs(args);
  if (!opt) {
    log("usage: maw chaiklang sat <start> <end> [--bbox=S,W,N,E] [--out=dir]");
    log("                        [--layers=...] [--gaps-only] [--force] [--dry-run]");
    log("  e.g. maw chaiklang sat 2025-01-01 2025-04-30   # NE Thailand burning season");
    return false;
  }

  const days = dateRange(opt.start, opt.end);
  if (!days.length) { log(`✗ bad range: ${opt.start}..${opt.end}`); return false; }

  log(`🛰️  sat backfill — ${opt.start} … ${opt.end}  (${days.length} days)`);
  log(`   bbox=${opt.bbox}  out=${opt.outDir}`);
  log(`   layers=${opt.layers}`);

  if (opt.dryRun) {
    log(`   --dry-run → ${days.length} URLs (first 3):`);
    for (const d of days.slice(0, 3)) log(`     ${d}  ${snapshotUrl(d, opt.bbox, opt.layers)}`);
    return true;
  }

  if (!existsSync(opt.outDir)) mkdirSync(opt.outDir, { recursive: true });

  const results: DayResult[] = [];
  for (const d of days) {
    results.push(await fetchDay(d, opt, log));
    await new Promise((r) => setTimeout(r, 250)); // be polite to NASA
  }

  const manifest = join(opt.outDir, "manifest.json");
  const prior: DayResult[] = existsSync(manifest)
    ? (JSON.parse(readFileSync(manifest, "utf8")) as DayResult[])
    : [];
  const byDate = new Map<string, DayResult>(prior.map((r) => [r.date, r]));
  for (const r of results) byDate.set(r.date, r);
  const merged = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  writeFileSync(manifest, JSON.stringify(merged, null, 2));

  const n = (s: DayStatus): number => results.filter((r) => r.status === s).length;
  const gaps = results.filter((r) => r.status === "gap").map((r) => r.date);
  log(`   ── ok:${n("ok")}  skipped:${n("skipped")}  gaps:${n("gap")}  (manifest: ${merged.length} days)`);
  if (gaps.length) log(`   gaps → retry with --gaps-only: ${gaps.join(", ")}`);
  return true;
}
