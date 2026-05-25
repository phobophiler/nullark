#!/usr/bin/env node
import {
  buildDocs,
  validateDocsLinks,
  validateDocsPrivacyClaims,
  validateDocsRedactions,
  validateDocsSeo,
  validateDocsSourceSync
} from "./docs-core.mjs";

const command = process.argv[2] ?? "check";
const preview = process.env.DOCS_PREVIEW === "1" || process.argv.includes("--preview");
const validators = {
  "check:redactions": validateDocsRedactions,
  "check:privacy-claims": validateDocsPrivacyClaims,
  "check:source-sync": validateDocsSourceSync,
  "check:links": validateDocsLinks,
  "check:seo": validateDocsSeo
};

function fail(blockers) {
  for (const blocker of blockers) {
    console.error(`- ${blocker}`);
  }
  process.exit(1);
}

if (command === "build") {
  const result = buildDocs({ preview });
  console.log(`built ${result.pages.length} docs pages into ${result.outDir}`);
} else if (command === "check") {
  buildDocs({ preview });
  const blockers = Object.values(validators).flatMap((validator) => validator({ preview }));
  if (blockers.length !== 0) {
    console.error("docs check failed:");
    fail(blockers);
  }
  console.log("docs check passed");
} else if (validators[command]) {
  buildDocs({ preview });
  const blockers = validators[command]({ preview });
  if (blockers.length !== 0) {
    console.error(`${command} failed:`);
    fail(blockers);
  }
  console.log(`${command} passed`);
} else {
  console.error(`unknown docs command: ${command}`);
  process.exit(1);
}
