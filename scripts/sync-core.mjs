// Copies the shared code (core/src) into each package's src/core, and the shared tests (core/test) into its test/,
// so every package builds and publishes on its own with no internal package to depend on. --check fails when a copy
// differs from core, for CI and before a release.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packages = ["agentkit", "goat", "eliza"];
const check = process.argv.includes("--check");
const head = (from) => `// Copied from ${from} by scripts/sync-core.mjs. Edit it there, then run npm run sync at the repo root.\n`;

let stale = 0;
for (const p of packages) {
  for (const [src, dst] of [["core/src", `packages/${p}/src/core`], ["core/test", `packages/${p}/test`]]) {
    const from = path.join(root, src);
    fs.mkdirSync(path.join(root, dst), { recursive: true });
    for (const f of fs.readdirSync(from).filter((x) => /\.(ts|mjs)$/.test(x))) {
      const want = head(`${src}/${f}`) + fs.readFileSync(path.join(from, f), "utf8");
      const to = path.join(root, dst, f);
      const have = fs.existsSync(to) ? fs.readFileSync(to, "utf8") : undefined;
      if (have === want) continue;
      if (check) { console.error(`out of date: ${dst}/${f}`); stale++; continue; }
      fs.writeFileSync(to, want);
      console.log(`wrote ${dst}/${f}`);
    }
  }
}
if (check && stale) process.exit(1);
