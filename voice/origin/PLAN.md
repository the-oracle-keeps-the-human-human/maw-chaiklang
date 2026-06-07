# ChaiKlang — Origin Voice Stream (Workshop 02)

**Goal**: prove a single Discord voice **socket stream** works by feeding 10 pre-rendered
origin-story chunks back-to-back through ONE socket, with no per-file conversion or command
context-switching at play time.

## Spec (from P'Nat, 2026-06-07)
- 10 chunks = 10 mp3 files, each ~3× longer than the first short draft (~45–70 Thai words / ~25–40s each)
- Content: ChaiKlang's origin story ("เล่าการเกิดมาของตัวเอง"), drawn from who-are-you / about-oracle / CLAUDE.md / retro
- Output format: **mp3**, all files identical encoder params so they concatenate seamlessly
- One socket, continuous feed of all 10, no context-switch to convert/call other commands
- Voice: `th-TH-NiwatNeural` (edge-tts, the proven neural voice)

## Render pipeline (no per-file work at play time)
1. `edge-tts --voice th-TH-NiwatNeural --file chunk-NN.txt --write-media raw-NN.mp3`
2. Normalize every file to identical params so they stream as one continuous track:
   `ffmpeg -i raw-NN.mp3 -ar 48000 -ac 2 -b:a 128k -c:a libmp3lame chunk-NN.mp3`
3. All 10 chunks now share 48kHz / stereo / 128k CBR → safe to feed sequentially through one decoder.

## Streaming socket (stream.mjs)
- Open ONE socket / single PassThrough stream.
- Pipe chunk-01..10.mp3 into it in order, end-to-end — the player sees one continuous byte stream.
- Hand that single stream to one Discord AudioResource (no re-spawn per file).
- This is the proof: 10 files → 1 socket → 1 continuous voice stream in Discord.

## Status
- [ ] 10 chunk scripts written
- [ ] 10 mp3 rendered + normalized
- [ ] durations verified
- [ ] streaming socket feeder built + tested locally
- [ ] played live in Discord voice (proof)
