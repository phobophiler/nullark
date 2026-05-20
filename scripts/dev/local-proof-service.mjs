#!/usr/bin/env node

console.error(
  [
    "Nullark local proof service is not bundled as a public runtime service.",
    "Use npm --workspace @shielded-transfers/web run dev for the web app.",
    "Do not paste private note material into third-party or shared services."
  ].join("\n")
);
process.exit(1);
