import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const circuitsDir = path.resolve(__dirname, "..");

const steps = [
  ["node", ["scripts/clean-build.mjs"]],
  ["npm", ["run", "fixtures"]],
  ["npm", ["run", "compile"]],
  ["npm", ["run", "witness"]],
  ["npm", ["run", "groth16"]],
  ["node", ["scripts/write-provenance-manifest.mjs"]]
];

for (const [command, args] of steps) {
  const result = spawnSync(command, args, {
    cwd: circuitsDir,
    env: process.env,
    stdio: "inherit"
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
