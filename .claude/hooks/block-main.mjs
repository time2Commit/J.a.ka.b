#!/usr/bin/env node
// PreToolUse hook (Bash): blocks commits and pushes to `main`.
// The maintainer can bypass the GitHub ruleset that protects `main`, and Claude
// acts with the maintainer's credentials, so the rule is enforced here as well.
// Exit code 2 blocks the tool call and shows stderr to Claude.
import { execFileSync } from "node:child_process";
import process from "node:process";

const PROTECTED = "main";

let raw = "";
for await (const chunk of process.stdin) raw += chunk;

let input;
try {
  input = JSON.parse(raw);
} catch {
  process.exit(0);
}

const command = String(input?.tool_input?.command ?? "");
const cwd = input?.cwd || process.cwd();

function currentBranch() {
  try {
    return execFileSync("git", ["symbolic-ref", "--short", "-q", "HEAD"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function block(reason) {
  process.stderr.write(
    `Blocked: ${reason}\n` +
      `Work on a branch and open a pull request against ${PROTECTED} (see CLAUDE.md, "Git workflow").\n`,
  );
  process.exit(2);
}

// Split chained commands so each git invocation is checked on its own.
const segments = command.split(/&&|\|\||;|\||\n/).map((s) => s.trim());
const targetsMain = new RegExp(`(^|[\\s:+])(refs/heads/)?${PROTECTED}(\\s|$)`);

for (const segment of segments) {
  const git = segment.match(/^(?:\S+=\S+\s+)*git\b(.*)$/);
  if (!git) continue;
  // Drop global options such as `-C <dir>` or `-c key=value` before the subcommand.
  const rest = git[1].replace(/^(\s+(-C|-c)\s+\S+|\s+--?[\w-]+(=\S+)?)*/, "").trim();
  const [subcommand, ...args] = rest.split(/\s+/);

  if (subcommand === "push") {
    const refspecs = args.filter((a) => !a.startsWith("-")).slice(1);
    if (refspecs.some((r) => targetsMain.test(r))) {
      block(`pushing to ${PROTECTED} is not allowed.`);
    }
    if (refspecs.length === 0 && currentBranch() === PROTECTED) {
      block(`the current branch is ${PROTECTED}; pushing it is not allowed.`);
    }
  }

  if (subcommand === "commit" && currentBranch() === PROTECTED) {
    block(`committing directly on ${PROTECTED} is not allowed.`);
  }
}

process.exit(0);
