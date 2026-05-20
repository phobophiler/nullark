import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const circuitsDir = path.resolve(__dirname, "..");

fs.rmSync(path.join(circuitsDir, "build"), { force: true, recursive: true });
console.log("removed circuits/build");
