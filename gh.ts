/**
 * maw chaiklang gh — reusable wrapper over the GitHub ops the switchboard does by hand.
 *
 * Born from Workshop-05 (2026-06-18): kept running the same `gh` / `gh api graphql`
 * incantations to invite collaborators, open forums (Discussions), and comment on
 * issues/discussions. This crystallizes them into one verb so they're reuse-safe.
 *
 *   maw chaiklang gh whoami
 *   maw chaiklang gh invite <user> [--repo o/n] [--perm push|admin|maintain|triage|pull]
 *   maw chaiklang gh forum  [<o/n>] [--off]                 # enable/disable Discussions
 *   maw chaiklang gh issue-comment <num> <body...> [--repo o/n]
 *   maw chaiklang gh discuss-comment <num> <body...> [--repo o/n] [--reply <commentNodeId>]
 *   maw chaiklang gh discussions [--repo o/n]               # list discussions (number→title)
 *
 * Thin shell over the `gh` CLI (inherits its auth — no token handling here).
 */
import { execFileSync } from "child_process";

type Log = (s: string) => void;

// Flags that consume the following token as their value (so positional parsing skips both).
const FLAG_WITH_VAL = new Set(["--repo", "--perm", "--reply"]);

function gh(args: string[]): string {
  try {
    return execFileSync("gh", args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }).trim();
  } catch (e: any) {
    const msg = (e?.stderr?.toString?.() || e?.message || String(e)).trim();
    throw new Error(msg);
  }
}

function opt(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

function positionals(args: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith("--")) { if (FLAG_WITH_VAL.has(a)) i++; continue; }
    out.push(a);
  }
  return out;
}

// repo = --repo o/n, else first positional if it looks like owner/name, else detect from cwd.
function resolveRepo(args: string[], maybeFirst?: string): string {
  const flag = opt(args, "--repo");
  if (flag) return flag;
  if (maybeFirst && /^[^/]+\/[^/]+$/.test(maybeFirst)) return maybeFirst;
  try {
    return gh(["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"]);
  } catch {
    throw new Error("no --repo and not inside a gh repo — pass --repo owner/name");
  }
}

function help(log: Log) {
  log("maw chaiklang gh — reusable GitHub wrapper 🦁");
  log("  whoami                                    current gh login");
  log("  invite <user> [--repo o/n] [--perm push]  add collaborator (verifies user, pending accept)");
  log("  forum [<o/n>] [--off]                      enable (or --off disable) Discussions = the forum");
  log("  discussions [--repo o/n]                   list discussions (number → title)");
  log("  issue-comment <num> <body...> [--repo o/n] comment on an issue");
  log("  discuss-comment <num> <body...> [--repo o/n] [--reply <nodeId>]  comment/reply on a discussion");
}

export async function runGh(log: Log, args: string[]): Promise<boolean> {
  const pos = positionals(args);
  const verb = pos[0]?.toLowerCase();

  try {
    switch (verb) {
      case undefined:
      case "help": case "-h": case "--help":
        help(log); return true;

      case "whoami":
        log(`gh: ${gh(["api", "user", "--jq", ".login"])}`); return true;

      case "invite": {
        const user = pos[1];
        if (!user) { log("usage: maw chaiklang gh invite <user> [--repo o/n] [--perm push]"); return false; }
        const repo = resolveRepo(args);
        const perm = opt(args, "--perm") || "push";
        gh(["api", `users/${user}`, "--jq", ".login"]);              // verify the user exists first
        gh(["api", "-X", "PUT", `repos/${repo}/collaborators/${user}`, "-f", `permission=${perm}`]);
        log(`✅ invited ${user} → ${repo} (${perm}) — pending accept`);
        log(`   https://github.com/${repo}/invitations`);
        return true;
      }

      case "forum": case "discussions-enable": {
        const repo = resolveRepo(args, pos[1]);
        const on = !args.includes("--off");
        gh(["api", "-X", "PATCH", `repos/${repo}`, "-f", `has_discussions=${on}`]);
        log(`✅ Discussions ${on ? "enabled" : "disabled"} on ${repo}`);
        if (on) log(`   https://github.com/${repo}/discussions`);
        return true;
      }

      case "discussions": case "discuss-list": {
        const repo = resolveRepo(args, pos[1]);
        const [owner, name] = repo.split("/");
        const q = `query($o:String!,$n:String!){repository(owner:$o,name:$n){discussions(first:30,orderBy:{field:CREATED_AT,direction:DESC}){nodes{number title category{name}}}}}`;
        const out = gh(["api", "graphql", "-f", `query=${q}`, "-f", `o=${owner}`, "-f", `n=${name}`,
          "--jq", '.data.repository.discussions.nodes[] | "#\\(.number) [\\(.category.name)] \\(.title)"']);
        log(out || "(no discussions)");
        return true;
      }

      case "issue-comment": case "ic": {
        const num = pos[1]; const body = pos.slice(2).join(" ");
        if (!num || !body) { log("usage: maw chaiklang gh issue-comment <num> <body...> [--repo o/n]"); return false; }
        const repo = resolveRepo(args);
        const url = gh(["issue", "comment", num, "--repo", repo, "--body", body]);
        log(`✅ commented on ${repo}#${num}`);
        if (url) log(`   ${url}`);
        return true;
      }

      case "discuss-comment": case "dc": {
        const num = pos[1]; const body = pos.slice(2).join(" ");
        if (!num || !body) { log("usage: maw chaiklang gh discuss-comment <num> <body...> [--repo o/n] [--reply <nodeId>]"); return false; }
        const repo = resolveRepo(args);
        const [owner, name] = repo.split("/");
        const did = gh(["api", "graphql", "-f",
          `query=query($o:String!,$n:String!){repository(owner:$o,name:$n){discussion(number:${Number(num)}){id}}}`,
          "-f", `o=${owner}`, "-f", `n=${name}`, "--jq", ".data.repository.discussion.id"]);
        if (!did) { log(`no discussion #${num} on ${repo}`); return false; }
        const reply = opt(args, "--reply");
        const mut = `mutation($d:ID!,$b:String!${reply ? ",$r:ID!" : ""}){addDiscussionComment(input:{discussionId:$d,body:$b${reply ? ",replyToId:$r" : ""}}){comment{url}}}`;
        const margs = ["api", "graphql", "-f", `query=${mut}`, "-f", `d=${did}`, "-f", `b=${body}`];
        if (reply) margs.push("-f", `r=${reply}`);
        const url = gh([...margs, "--jq", ".data.addDiscussionComment.comment.url"]);
        log(`✅ ${reply ? "replied" : "commented"} on ${repo} discussion #${num}`);
        if (url) log(`   ${url}`);
        return true;
      }

      default:
        log(`unknown: gh ${verb} — run 'maw chaiklang gh help'`);
        return false;
    }
  } catch (e: any) {
    log(`❌ gh: ${e?.message || e}`);
    return false;
  }
}
