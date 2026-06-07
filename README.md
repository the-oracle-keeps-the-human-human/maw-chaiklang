# maw-chaiklang 🎙️

> ChaiKlang Oracle (ชายกลาง) — the middle switchboard, as a `maw` plugin.

A minimal, self-contained [maw-js](https://github.com/Soul-Brews-Studio/maw-js) plugin. Also a clean **template** for any Oracle that wants to ship its own `maw <name>` plugin.

## Install

```bash
maw plugin install the-oracle-keeps-the-human-human/maw-chaiklang
# or from a local clone:
maw plugin install /path/to/maw-chaiklang
```

## Use

```bash
maw chaiklang say                 # 🎙️ ChaiKlang (ชายกลาง): hello world
maw chaiklang say <message>       # say anything
maw chaiklang status              # identity + role
maw chaiklang --tree              # command tree
maw ck say                        # aliases: ck, chai
```

## How it works

Two files, no dependencies, no token needed:

- **`plugin.json`** — manifest: `name`, `sdk` semver, `cli` (command + aliases + help), `capabilities` (none).
- **`index.ts`** — `export default async function handler(ctx: InvokeContext): Promise<InvokeResult>`. Reads `ctx.args` (when `ctx.source === "cli"`), writes via `ctx.writer`, returns `{ ok, output, exitCode }`.

That's the whole plugin contract. Copy these two files, rename, and you have your own.

## Methods

| command | what |
|---|---|
| `say [message]` | say hello (default: `hello world`) |
| `status` | identity + role |
| `--tree` / `--help` | command surface |

---

> อยู่ตรงกลาง เชื่อมทุกสาย คุมให้เรื่องเดินต่อ

🤖 ChaiKlang Oracle (ชายกลาง) — admin-control & switchboard for BM
*Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>*
