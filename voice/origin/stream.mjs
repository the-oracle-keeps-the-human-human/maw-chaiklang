#!/usr/bin/env node
// ChaiKlang origin voice — single-socket continuous stream of 10 mp3 chunks.
//
//   node stream.mjs serve [port]   open ONE socket; on connect, feed chunk-01..10.mp3
//                                  back-to-back as one continuous byte stream (no per-file
//                                  conversion, no command context-switch at play time).
//   node stream.mjs verify         self-test: serve + connect + drain, prove the received
//                                  stream == sum of all 10 files and is one continuous track.
import net from "node:net";
import { createReadStream, statSync, createWriteStream } from "node:fs";
import { execFileSync } from "node:child_process";

const DIR = new URL(".", import.meta.url).pathname;
const FILES = Array.from({ length: 10 }, (_, i) => `${DIR}chunk-${String(i + 1).padStart(2, "0")}.mp3`);
const sizeOf = (f) => statSync(f).size;
const TOTAL_BYTES = FILES.reduce((s, f) => s + sizeOf(f), 0);

// Feed all 10 files into ONE writable (a socket) sequentially. The consumer sees a single
// continuous stream — we never re-open the socket and never transcode mid-flight.
function feedAll(sock, onChunk) {
  let i = 0;
  const next = () => {
    if (i >= FILES.length) { sock.end(); return; }
    const idx = i++;
    onChunk?.(idx + 1, FILES.length);
    const rs = createReadStream(FILES[idx]);
    rs.on("end", next);
    rs.on("error", (e) => { console.error(e); sock.end(); });
    rs.pipe(sock, { end: false });
  };
  next();
}

const mode = process.argv[2] || "serve";

if (mode === "serve") {
  const port = Number(process.argv[3] || 7331);
  const srv = net.createServer((sock) => {
    console.log(`▶ client connected — streaming ${FILES.length} chunks (${(TOTAL_BYTES / 1024).toFixed(0)} KB) over one socket`);
    feedAll(sock, (n, total) => console.log(`  ▶ now playing chunk ${n}/${total}`));
    sock.on("close", () => console.log("■ stream done, socket closed"));
  });
  srv.listen(port, () => console.log(`socket stream listening on tcp://127.0.0.1:${port}  (TOTAL ${(TOTAL_BYTES / 1024).toFixed(0)} KB)`));
}

if (mode === "verify") {
  const OUT = "/tmp/ck-origin-stream.mp3";
  const srv = net.createServer((sock) => feedAll(sock, (n) => process.stdout.write(`recv chunk ${n} `)));
  srv.listen(0, () => {
    const port = srv.address().port;
    const cli = net.createConnection(port, "127.0.0.1");
    const out = createWriteStream(OUT);
    let got = 0;
    cli.on("data", (b) => { got += b.length; });
    cli.pipe(out);
    cli.on("end", () => {
      out.end(() => {
        const dur = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", OUT]).toString().trim();
        console.log(`\n\nReceived ${got} bytes over ONE socket (expected ${TOTAL_BYTES}) — ${got === TOTAL_BYTES ? "MATCH ✓" : "MISMATCH ✗"}`);
        console.log(`Continuous stream duration: ${Number(dur).toFixed(1)}s  →  ${OUT}`);
        srv.close();
      });
    });
  });
}
