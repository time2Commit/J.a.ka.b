// Runs the Next.js standalone server. The standalone output does not include
// `.next/static` and `public/`, so they are copied next to the server first.
import { cp } from "node:fs/promises";
import { spawn } from "node:child_process";

const root = new URL("../", import.meta.url).pathname;
const out = `${root}.next/standalone/apps/web`;
await cp(`${root}.next/static`, `${out}/.next/static`, { recursive: true });
await cp(`${root}public`, `${out}/public`, { recursive: true });
spawn("node", [`${out}/server.js`], { stdio: "inherit" }).on("exit", (code) =>
  process.exit(code ?? 0),
);
