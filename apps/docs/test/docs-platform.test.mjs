import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildDocs,
  validateDocsLinks,
  validateDocsPrivacyClaims,
  validateDocsRedactions,
  validateDocsSeo,
  validateDocsSourceSync
} from "../src/docs-core.mjs";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

function tempBuildDirs(label) {
  return {
    outDir: fs.mkdtempSync(path.join(os.tmpdir(), `nullark-docs-${label}-`)),
    privateDir: fs.mkdtempSync(path.join(os.tmpdir(), `nullark-docs-private-${label}-`))
  };
}

test("docs build emits static docs-only output with SEO assets", () => {
  const { outDir, privateDir } = tempBuildDirs("build");
  const result = buildDocs({ repoRoot, outDir, privateDir });

  assert.ok(result.pages.length >= 15);
  assert.ok(fs.existsSync(path.join(outDir, "index.html")));
  assert.ok(fs.existsSync(path.join(outDir, "start/overview/index.html")));
  assert.ok(fs.existsSync(path.join(outDir, "security/privacy-model/index.html")));
  assert.ok(fs.existsSync(path.join(outDir, "sitemap.xml")));
  assert.ok(fs.existsSync(path.join(outDir, "robots.txt")));
  assert.ok(fs.existsSync(path.join(outDir, "_headers")));
  assert.ok(fs.existsSync(path.join(outDir, "_redirects")));
  assert.ok(fs.existsSync(path.join(outDir, "search-index.json")));
});

test("docs build publishes only allowlisted runtime fields", () => {
  const { outDir, privateDir } = tempBuildDirs("runtime");
  buildDocs({ repoRoot, outDir, privateDir });

  const runtime = JSON.parse(fs.readFileSync(path.join(outDir, "assets/runtime.json"), "utf8"));
  assert.equal(runtime.chainId, 4326);
  assert.equal(runtime.pool, "0x08bA57aA9Bc13Ccaf0dda0Fb7Cd7A2570b0FE4d8");
  assert.equal(runtime.relayerEndpoint, "https://relayer.nullark.com/transaction");
  assert.equal(runtime.relayerEndpointLabel, "Machine/API endpoint");
  assert.deepEqual(Object.keys(runtime).sort(), [
    "chainId",
    "environment",
    "feeController",
    "groth16PublicInputCount",
    "groth16PublicInputOrder",
    "groth16PublicInputOrderText",
    "merkleTreeDepth",
    "pool",
    "poolContractName",
    "poolDeploymentBlock",
    "poolSourcePath",
    "poseidon2",
    "privateTransferVerifier",
    "privateTransferVerifierName",
    "productVersion",
    "provingSystem",
    "publicBrowserProverManifestPath",
    "publicBrowserProverManifestSha256",
    "relayerEndpoint",
    "relayerEndpointLabel",
    "rpcUrl",
    "trustedSetupRecordPath",
    "trustedSetupRecordSha256",
    "verifierAdapter",
    "verifierAdapterName",
    "withdrawFinalZkeyPath",
    "withdrawFinalZkeySha256",
    "withdrawSelector",
    "withdrawVerifier",
    "withdrawVerifierBytecodeHash",
    "withdrawVerifierName",
    "withdrawWasmPath",
    "withdrawWasmSha256",
    "withdrawalFeeBps"
  ]);
  assert.equal(runtime.provingSystem, "Circom/snarkjs Groth16 over BN254");
  assert.equal(runtime.withdrawWasmPath, "/proving/withdraw.wasm");
  assert.equal(runtime.withdrawFinalZkeyPath, "/proving/withdraw_final.zkey");
  assert.equal(runtime.groth16PublicInputCount, 10);
  assert.match(runtime.groth16PublicInputOrderText, /1\. root\n2\. nullifier/);
  assert.doesNotMatch(JSON.stringify(runtime), /circuits\/|approvedBy|ownerApprovalRef|dryRunArtifactRef/);
});

test("docs validators reject internal leaks and unsupported privacy claims", () => {
  const { outDir, privateDir } = tempBuildDirs("validators");
  buildDocs({ repoRoot, outDir, privateDir });

  assert.deepEqual(validateDocsRedactions({ repoRoot, outDir }), []);
  assert.deepEqual(validateDocsPrivacyClaims({ repoRoot, outDir }), []);
  assert.deepEqual(validateDocsSourceSync({ repoRoot, outDir }), []);
  assert.deepEqual(validateDocsLinks({ repoRoot, outDir }), []);
  assert.deepEqual(validateDocsSeo({ repoRoot, outDir }), []);

  fs.writeFileSync(
    path.join(outDir, "leak.html"),
    "public-artifacts/current.json 0x44387e86cf6cc44b1a7871e2b9aab80072074261b05fcbd3b88c335b87601191"
  );
  assert.match(validateDocsRedactions({ repoRoot, outDir }).join("\n"), /internal repo path|live-smoke transaction hash/);

  const claimDir = path.join(outDir, "bad-claim");
  fs.mkdirSync(claimDir);
  fs.writeFileSync(path.join(claimDir, "index.html"), "<main>Nullark provides sender privacy.</main>");
  assert.match(validateDocsPrivacyClaims({ repoRoot, outDir }).join("\n"), /unsupported privacy claim/);
});

test("preview docs builds emit noindex metadata and headers for every route", () => {
  const { outDir, privateDir } = tempBuildDirs("preview");
  buildDocs({ repoRoot, outDir, privateDir, preview: true });

  const headers = fs.readFileSync(path.join(outDir, "_headers"), "utf8");
  const page = fs.readFileSync(path.join(outDir, "index.html"), "utf8");
  assert.match(headers, /X-Robots-Tag: noindex, nofollow/);
  assert.match(page, /<meta name="robots" content="noindex, nofollow">/);
  assert.equal(fs.existsSync(path.join(outDir, "sitemap.xml")), false);
});

test("docs pages include single search, navigation, and heading anchors", () => {
  const { outDir, privateDir } = tempBuildDirs("ui");
  buildDocs({ repoRoot, outDir, privateDir });

  const page = fs.readFileSync(path.join(outDir, "start/overview/index.html"), "utf8");
  assert.match(page, /aria-label="Open docs search"/);
  assert.match(page, /data-search-open/);
  assert.match(page, /data-search-modal/);
  assert.match(page, /id="docs-search-modal-input"/);
  assert.doesNotMatch(page, /data-theme-toggle/);
  assert.doesNotMatch(page, /class="top-links"/);
  assert.match(page, /data-mobile-nav-toggle/);
  assert.doesNotMatch(page, /aria-label="Docs version"/);
  assert.doesNotMatch(page, /class="runtime-badge"/);
  assert.doesNotMatch(page, /Versions<\/span>/);
  assert.match(page, /class="anchor-link"/);
  assert.match(page, /class="nav-section"/);
  assert.match(page, /class="section-icon"/);
  assert.match(page, /class="toc-card"/);
  assert.match(page, /href="#main-paths"/);
  assert.match(page, /Start<\/span>/);
  assert.match(page, /Developers<\/span>/);
});

test("overview renders restrained editorial components", () => {
  const { outDir, privateDir } = tempBuildDirs("editorial");
  buildDocs({ repoRoot, outDir, privateDir });

  const page = fs.readFileSync(path.join(outDir, "start/overview/index.html"), "utf8");
  assert.match(page, /class="hero-panel"/);
  assert.match(page, /class="card-grid"/);
  assert.match(page, /class="card-icon"/);
  assert.match(page, /class="table-wrap"/);
  assert.match(page, /class="safety-strip"/);
  assert.doesNotMatch(page, /class="trust-card"/);
  assert.match(page, /Use fixed-denomination ETH notes with explicit public-exit checks/);
  assert.match(page, /Verify the live pool, check what stays public/);
  assert.match(page, /Start here/);
  assert.match(page, /Current runtime/);
  assert.match(page, /Hard boundaries/);
  assert.match(page, /docs.nullark.com does not connect wallets/);
  assert.doesNotMatch(page, /No wallet prompts|Trust-led|Public docs only|Relayer is API-only|Privacy claims constrained/);
});

test("docs stylesheet provides polished responsive docs primitives", () => {
  const { outDir, privateDir } = tempBuildDirs("style");
  buildDocs({ repoRoot, outDir, privateDir });

  const css = fs.readFileSync(path.join(outDir, "assets/styles.css"), "utf8");
  assert.match(css, /Protocol Manual layer/);
  assert.match(css, /\.topbar\{\s*height:52px/);
  assert.match(css, /\.shell\{\s*grid-template-columns:250px minmax\(0,700px\) 180px/);
  assert.match(css, /\.article\{max-width:700px\}/);
  assert.match(css, /h1\{\s*margin:0 0 10px;\s*color:var\(--ink\);\s*font-size:32px/);
  assert.match(css, /\.toc-card,.trust-card\{\s*border:0;\s*border-radius:0;\s*background:transparent/);
  assert.match(css, /body\[data-theme=light\]\{\s*--bg:#ffffff/);
  assert.match(css, /body:after\{display:none\}/);
  assert.match(css, /\.doc-card:hover\{/);
  assert.match(css, /\.search-dialog\{/);
  assert.match(css, /--accent:#a78bfa/);
  assert.match(css, /td code\{\s*background:transparent/);
  assert.match(css, /\.code-label/);
  assert.match(css, /\.page-kind/);
  assert.match(css, /\.section-icon,.callout-icon,.card-icon,.inline-icon,.search-result-icon/);
  assert.match(css, /\.callout\{\s*display:grid/);
  assert.match(css, /\.external-link\{/);
  assert.match(css, /@media\(max-width:900px\)/);
});

test("docs render table and step primitives for reference-grade pages", () => {
  const { outDir, privateDir } = tempBuildDirs("primitives");
  buildDocs({ repoRoot, outDir, privateDir });

  const deposit = fs.readFileSync(path.join(outDir, "users/deposit/index.html"), "utf8");
  const contracts = fs.readFileSync(path.join(outDir, "reference/contracts/index.html"), "utf8");
  assert.doesNotMatch(deposit, /class="steps"/);
  assert.match(deposit, /Before you deposit/);
  assert.match(deposit, /class="table-wrap"/);
  assert.match(deposit, /<th>Denomination<\/th>/);
  assert.match(contracts, /class="table-wrap"/);
  assert.match(contracts, /Surface: public reference/);
  assert.doesNotMatch(contracts, /class="badge-row"/);
  assert.match(contracts, /Groth16WithdrawVerifier/);
  const runtime = fs.readFileSync(path.join(outDir, "developers/runtime-config/index.html"), "utf8");
  assert.match(runtime, /class="code-label">json<\/span>/);
  assert.match(runtime, /class="tabs"/);
  assert.match(runtime, /class="checklist-marker"/);
  assert.match(runtime, /class="checklist-text">Operator-only evidence paths must stay out of <code>apps\/docs\/dist<\/code>/);
  const privacy = fs.readFileSync(path.join(outDir, "security/privacy-model/index.html"), "utf8");
  assert.doesNotMatch(privacy, /class="accordion"/);
  assert.match(privacy, /class="callout-icon"/);
  assert.doesNotMatch(contracts, /class="inline-icon"/);
  const proving = fs.readFileSync(path.join(outDir, "developers/proving-artifacts/index.html"), "utf8");
  assert.match(proving, /Circom\/snarkjs Groth16 over BN254/);
  assert.match(proving, /ActionRoutingGroth16Verifier/);
  assert.match(proving, /Groth16WithdrawVerifier/);
  assert.match(proving, /Groth16PrivateTransferVerifier/);
  assert.match(proving, /\/proving\/withdraw\.wasm/);
  assert.match(proving, /\/proving\/withdraw_final\.zkey/);
  assert.match(proving, /b97120c59c4d4874ae8c66721327d32a9fa91a07b228e75035d38344c8d17143/);
  assert.match(proving, /804da480e694aa081ee14ed69557e6042b48ec305a90678c2b7f2162a1f0da25/);
  assert.match(proving, /1\. root/);
  assert.match(proving, /10\. encryptedOutputNoteHash/);
  assert.doesNotMatch(proving, /class="card-grid"/);
  assert.doesNotMatch(proving, /circuits\/|approvedBy|ownerApprovalRef|dryRunArtifactRef|proof blobs<\/td>|raw witnesses<\/td>/);
});

test("core pages use page-specific authored IA without generated templates", () => {
  const { outDir, privateDir } = tempBuildDirs("editorial-constraints");
  buildDocs({ repoRoot, outDir, privateDir });

  const pages = new Map([
    ["start/overview/index.html", ["Start here", "Current runtime", "Main paths", "Hard boundaries"]],
    ["start/status-and-networks/index.html", ["Current deployment", "Public surfaces", "Domain boundaries", "Fast receipts are not final review"]],
    ["start/what-is-public/index.html", ["Public by design", "Wallet-gated private state", "Where links come from", "Practical rule"]],
    ["users/deposit/index.html", ["Before you deposit", "Choose an amount", "What gets written on-chain", "After deposit"]],
    ["users/withdraw-public-exit/index.html", ["Before you withdraw", "Recipient choice", "Wallet submit or relayer submit", "After the transaction"]],
    ["users/private-balance-recovery/index.html", ["What recovery can restore", "What it cannot restore", "Safe recovery checklist", "Failure cases"]],
    ["developers/architecture/index.html", ["Runtime surfaces", "Data flow", "Trust boundaries", "Public references"]],
    ["developers/proving-artifacts/index.html", ["Groth16 verifier path", "Browser artifacts", "Public input order", "What is not published", "Related pages"]],
    ["security/privacy-model/index.html", ["The claim", "What remains public", "Where links come from", "How to reduce avoidable links"]]
  ]);
  for (const [rel, headings] of pages.entries()) {
    const page = fs.readFileSync(path.join(outDir, rel), "utf8");
    for (const heading of headings) {
      assert.match(page, new RegExp(`>${heading} <a class="anchor-link"`), `${rel} missing ${heading}`);
    }
    assert.doesNotMatch(page, /Use this page to|Before acting|Not covered/);
    assert.doesNotMatch(page, /Trust-led|trust-led|Public docs only|Relayer is API-only|Privacy claims constrained|No wallet prompts|understand (?:the|how|what)/i);
    const componentCount = (page.match(/class="(?:hero-panel|card-grid|badge-row|accordion|tabs)"/g) ?? []).length;
    if (rel === "start/overview/index.html") {
      assert.equal((page.match(/class="card-grid"/g) ?? []).length, 1, "overview keeps the only card grid");
      assert.ok(componentCount <= 2, `${rel} uses too many showcase components`);
    } else {
      assert.doesNotMatch(page, /class="card-grid"/, `${rel} must not use cards`);
      assert.doesNotMatch(page, /class="badge-row"/, `${rel} must not use badges`);
      assert.ok(componentCount <= 1, `${rel} uses too many showcase components`);
    }
  }
});
