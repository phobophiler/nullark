import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const DOCS_ORIGIN = "https://docs.nullark.com";
const DEFAULT_REPO_ROOT = path.resolve(import.meta.dirname, "../../..");
const DEFAULT_CONTENT_DIR = path.join(DEFAULT_REPO_ROOT, "apps/docs/content");
const DEFAULT_OUT_DIR = path.join(DEFAULT_REPO_ROOT, "apps/docs/dist");
const DEFAULT_PRIVATE_DIR = path.join(DEFAULT_REPO_ROOT, "apps/docs/.generated");

const SAFE_SOURCE_REFS = new Set([
  "docs/CURRENT.md",
  "docs/public/README.md",
  "docs/developers/runtime-config.md",
  "docs/developers/verifying-artifacts.md",
  "docs/security/threat-model.md",
  "docs/security/known-limitations.md",
  "docs/security/reporting.md",
  "docs/operators/README.md",
  "public-artifacts/current.json",
  "apps/web/public/proving/withdraw-artifacts.manifest.json",
  "apps/web/public/proving/trusted-setup-record.json",
  "apps/web/src/product/productRuntimeConfig.ts",
  "packages/core/src/config.ts",
  "packages/core/src/denominations.ts"
]);

const CLAIM_CONTEXTS = new Set(["non_claim", "risk_caveat", "owner_approved_claim"]);
const SENSITIVE_CLAIM_REGEX =
  /\b(anonym(?:ity|ous)|unlink(?:ability|able)|sender privacy|receiver privacy|amount privacy|MEV protection|chain-level (?:transaction )?privacy|private by default|fully private)\b/i;

export function buildDocs(options = {}) {
  const repoRoot = options.repoRoot ?? DEFAULT_REPO_ROOT;
  const contentDir = options.contentDir ?? path.join(repoRoot, "apps/docs/content");
  const outDir = options.outDir ?? path.join(repoRoot, "apps/docs/dist");
  const privateDir = options.privateDir ?? path.join(repoRoot, "apps/docs/.generated");
  const preview = options.preview ?? false;
  const runtime = readPublicRuntime(repoRoot);
  const pages = loadPages({ repoRoot, contentDir });

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  fs.rmSync(privateDir, { recursive: true, force: true });
  fs.mkdirSync(privateDir, { recursive: true });

  const nav = pages.map((page) => ({ title: page.title, path: page.canonicalPath, section: page.section }));
  const search = [];
  const sourceMap = [];

  for (const [index, page] of pages.entries()) {
    const previous = pages[index - 1];
    const next = pages[index + 1];
    const html = renderPage(page, {
      nav,
      runtime,
      previous,
      next,
      preview
    });
    writeOutputFile(outDir, page.canonicalPath, html);
    search.push({
      title: page.title,
      section: page.section,
      excerpt: page.description,
      url: `${DOCS_ORIGIN}${page.canonicalPath}`
    });
    sourceMap.push({
      canonicalPath: page.canonicalPath,
      title: page.title,
      sourceRefs: page.sourceRefs
    });
  }

  const home = pages.find((page) => page.canonicalPath === "/start/overview/") ?? pages[0];
  writeRaw(path.join(outDir, "index.html"), renderPage({ ...home, canonicalPath: "/", title: "Nullark Docs" }, { nav, runtime, next: home, preview }));
  writeRaw(path.join(outDir, "404.html"), renderNotFound({ nav, runtime, preview }));
  writeRaw(path.join(outDir, "search-index.json"), `${JSON.stringify(search, null, 2)}\n`);
  writeRaw(path.join(outDir, "assets/runtime.json"), `${JSON.stringify(runtime, null, 2)}\n`);
  writeRaw(path.join(outDir, "assets/styles.css"), stylesheet());
  writeRaw(path.join(outDir, "assets/docs.js"), clientScript());
  writeRaw(path.join(privateDir, "source-map.json"), `${JSON.stringify(sourceMap, null, 2)}\n`);
  writeRaw(path.join(outDir, "robots.txt"), preview ? "User-agent: *\nDisallow: /\n" : `User-agent: *\nAllow: /\nSitemap: ${DOCS_ORIGIN}/sitemap.xml\n`);
  if (!preview) {
    writeRaw(path.join(outDir, "sitemap.xml"), renderSitemap(pages));
  }
  writeRaw(path.join(outDir, "_headers"), renderHeaders(preview));
  writeRaw(path.join(outDir, "_redirects"), "/docs /start/overview/ 301\n/reference /reference/contracts/ 301\n");

  return { outDir, privateDir, pages, runtime };
}

export function validateDocsRedactions(options = {}) {
  const repoRoot = options.repoRoot ?? DEFAULT_REPO_ROOT;
  const outDir = options.outDir ?? DEFAULT_OUT_DIR;
  const blockers = [];
  if (!fs.existsSync(outDir)) {
    return [`docs output is missing: ${path.relative(repoRoot, outDir)}`];
  }
  for (const filePath of listFiles(outDir)) {
    const rel = path.relative(outDir, filePath);
    if (!isTextFile(filePath)) continue;
    const text = fs.readFileSync(filePath, "utf8");
    if (/docs\/evidence\/|docs\/CURRENT\.md|docs\/privacy-claim\.md|apps\/web\/src|packages\/core\/src|services\/|circuits\/|\.env|\.wrangler|\.sensitive/.test(text)) {
      blockers.push(`${rel} exposes an internal repo path`);
    }
    if (/0x44387e86cf6cc44b1a7871e2b9aab80072074261b05fcbd3b88c335b87601191/i.test(text)) {
      blockers.push(`${rel} exposes a live-smoke transaction hash`);
    }
    if (/\b(?:privateKey|private_key|PRIVATE_KEY)\b\s*[:=]\s*["']?0x[0-9a-fA-F]{64}\b/.test(text)) {
      blockers.push(`${rel} exposes private key material`);
    }
    if (/\b(owner approval path|funding cap|signer address|Safe address)\b/i.test(text)) {
      blockers.push(`${rel} exposes internal operational material`);
    }
  }
  return blockers;
}

export function validateDocsPrivacyClaims(options = {}) {
  const outDir = options.outDir ?? DEFAULT_OUT_DIR;
  if (!fs.existsSync(outDir)) return [`docs output is missing: ${outDir}`];
  const blockers = [];
  for (const filePath of listFiles(outDir).filter((file) => file.endsWith(".html"))) {
    const rel = path.relative(outDir, filePath);
    const text = fs.readFileSync(filePath, "utf8");
    const stripped = stripAllowedClaimContexts(text);
    if (SENSITIVE_CLAIM_REGEX.test(stripped)) {
      blockers.push(`${rel} contains unsupported privacy claim language outside an approved context`);
    }
  }
  return blockers;
}

export function validateDocsSourceSync(options = {}) {
  const repoRoot = options.repoRoot ?? DEFAULT_REPO_ROOT;
  const outDir = options.outDir ?? DEFAULT_OUT_DIR;
  const blockers = [];
  if (!fs.existsSync(outDir)) return [`docs output is missing: ${path.relative(repoRoot, outDir)}`];
  const expected = readPublicRuntime(repoRoot);
  const actualPath = path.join(outDir, "assets/runtime.json");
  if (!fs.existsSync(actualPath)) return ["public runtime asset is missing"];
  const actual = JSON.parse(fs.readFileSync(actualPath, "utf8"));
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    blockers.push("public runtime asset does not match allowlisted current manifest values");
  }
  return blockers;
}

export function validateDocsLinks(options = {}) {
  const outDir = options.outDir ?? DEFAULT_OUT_DIR;
  if (!fs.existsSync(outDir)) return [`docs output is missing: ${outDir}`];
  const blockers = [];
  for (const filePath of listFiles(outDir).filter((file) => file.endsWith(".html"))) {
    const rel = path.relative(outDir, filePath);
    const text = fs.readFileSync(filePath, "utf8");
    for (const href of text.matchAll(/\shref="([^"]+)"/g)) {
      const target = href[1];
      if (target.startsWith("http") || target.startsWith("mailto:") || target.startsWith("#")) continue;
      if (target === "/assets/styles.css" || target === "/assets/docs.js") continue;
      const targetPath = path.join(outDir, target.replace(/^\//, ""), target.endsWith("/") ? "index.html" : "");
      const htmlPath = target.endsWith("/") ? targetPath : path.join(outDir, target.replace(/^\//, ""));
      if (!fs.existsSync(htmlPath)) {
        blockers.push(`${rel} links to missing internal target ${target}`);
      }
    }
    if (text.includes("https://relayer.nullark.com/transaction") && !/Machine\/API endpoint/.test(text)) {
      blockers.push(`${rel} links to relayer endpoint without machine/API label`);
    }
  }
  return blockers;
}

export function validateDocsSeo(options = {}) {
  const outDir = options.outDir ?? DEFAULT_OUT_DIR;
  const preview = options.preview ?? false;
  if (!fs.existsSync(outDir)) return [`docs output is missing: ${outDir}`];
  const blockers = [];
  const headers = fs.existsSync(path.join(outDir, "_headers")) ? fs.readFileSync(path.join(outDir, "_headers"), "utf8") : "";
  if (preview && !/X-Robots-Tag: noindex, nofollow/.test(headers)) {
    blockers.push("preview headers must include X-Robots-Tag noindex, nofollow");
  }
  if (!preview && !fs.existsSync(path.join(outDir, "sitemap.xml"))) {
    blockers.push("production docs sitemap is missing");
  }
  if (preview && fs.existsSync(path.join(outDir, "sitemap.xml"))) {
    blockers.push("preview docs must not generate sitemap.xml");
  }
  for (const filePath of listFiles(outDir).filter((file) => file.endsWith(".html"))) {
    const rel = path.relative(outDir, filePath);
    const text = fs.readFileSync(filePath, "utf8");
    if (!/<title>[^<]+<\/title>/.test(text)) blockers.push(`${rel} is missing title`);
    if (!/<meta name="description" content="[^"]+">/.test(text)) blockers.push(`${rel} is missing meta description`);
    if (preview) {
      if (!/<meta name="robots" content="noindex, nofollow">/.test(text)) blockers.push(`${rel} is missing preview noindex meta`);
    } else if (!new RegExp(`<link rel="canonical" href="${DOCS_ORIGIN.replaceAll("/", "\\/")}\\/`).test(text)) {
      blockers.push(`${rel} canonical must start with ${DOCS_ORIGIN}`);
    }
  }
  if (fs.existsSync(path.join(outDir, "sitemap.xml"))) {
    const sitemap = fs.readFileSync(path.join(outDir, "sitemap.xml"), "utf8");
    for (const loc of sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)) {
      if (!loc[1].startsWith(`${DOCS_ORIGIN}/`)) {
        blockers.push("sitemap contains a non-docs URL");
      }
    }
  }
  return blockers;
}

function readPublicRuntime(repoRoot) {
  const current = JSON.parse(fs.readFileSync(path.join(repoRoot, "public-artifacts/current.json"), "utf8"));
  const proverManifest = JSON.parse(fs.readFileSync(path.join(repoRoot, "apps/web/public/proving/withdraw-artifacts.manifest.json"), "utf8"));
  const trustedSetup = JSON.parse(fs.readFileSync(path.join(repoRoot, "apps/web/public/proving/trusted-setup-record.json"), "utf8"));
  const publicInputOrder = trustedSetup.publicInputOrder ?? [];
  return {
    productVersion: current.productVersion,
    environment: current.network,
    chainId: current.chainId,
    rpcUrl: current.rpcUrl,
    poolContractName: current.poolContractName,
    poolSourcePath: "contracts/src/NullarkPool.sol",
    pool: current.pool,
    poolDeploymentBlock: current.poolDeploymentBlock,
    privateTransferVerifier: current.privateTransferVerifier,
    withdrawVerifier: current.withdrawVerifier,
    verifierAdapter: current.verifierAdapter,
    poseidon2: current.poseidon2,
    feeController: current.feeController,
    withdrawSelector: current.withdrawSelector,
    merkleTreeDepth: current.merkleTreeDepth,
    withdrawalFeeBps: current.withdrawalFeeBps,
    withdrawVerifierBytecodeHash: current.withdrawVerifierBytecodeHash,
    relayerEndpoint: current.relayerEndpoint,
    relayerEndpointLabel: current.relayerEndpointLabel,
    publicBrowserProverManifestPath: `/${current.paths.browserProverManifest.replace("apps/web/public/", "")}`,
    publicBrowserProverManifestSha256: `sha256:${current.artifacts.proverManifestSha256}`,
    trustedSetupRecordPath: proverManifest.trustedSetupRecord.path,
    trustedSetupRecordSha256: `sha256:${current.artifacts.trustedSetupRecordSha256}`,
    provingSystem: "Circom/snarkjs Groth16 over BN254",
    verifierAdapterName: "ActionRoutingGroth16Verifier",
    withdrawVerifierName: "Groth16WithdrawVerifier",
    privateTransferVerifierName: "Groth16PrivateTransferVerifier",
    withdrawWasmPath: proverManifest.artifacts.withdrawWasm.path,
    withdrawWasmSha256: current.artifacts.withdrawWasmSha256,
    withdrawFinalZkeyPath: proverManifest.artifacts.withdrawFinalZkey.path,
    withdrawFinalZkeySha256: current.artifacts.withdrawFinalZkeySha256,
    groth16PublicInputCount: publicInputOrder.length,
    groth16PublicInputOrder: publicInputOrder.join(", "),
    groth16PublicInputOrderText: publicInputOrder.map((input, index) => `${index + 1}. ${input}`).join("\n")
  };
}

function loadPages({ repoRoot, contentDir }) {
  const pages = listFiles(contentDir)
    .filter((file) => file.endsWith(".md"))
    .map((filePath) => parsePage(filePath, { repoRoot, contentDir }))
    .sort((a, b) => a.order - b.order || a.canonicalPath.localeCompare(b.canonicalPath));
  const seen = new Set();
  for (const page of pages) {
    for (const key of ["title", "description", "section", "version", "canonicalPath", "status"]) {
      if (!page[key]) throw new Error(`${page.filePath} missing frontmatter field ${key}`);
    }
    if (page.status !== "public") throw new Error(`${page.filePath} is not marked public`);
    if (!page.canonicalPath.startsWith("/") || !page.canonicalPath.endsWith("/")) {
      throw new Error(`${page.filePath} canonicalPath must start and end with /`);
    }
    if (seen.has(page.canonicalPath)) throw new Error(`duplicate canonicalPath ${page.canonicalPath}`);
    seen.add(page.canonicalPath);
    for (const ref of page.sourceRefs) {
      if (!SAFE_SOURCE_REFS.has(ref)) throw new Error(`${page.filePath} uses unapproved sourceRef ${ref}`);
      if (!fs.existsSync(path.join(repoRoot, ref))) throw new Error(`${page.filePath} sourceRef does not exist ${ref}`);
    }
  }
  return pages;
}

function parsePage(filePath, { contentDir }) {
  const text = fs.readFileSync(filePath, "utf8");
  const match = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) throw new Error(`${filePath} missing frontmatter`);
  const frontmatter = parseFrontmatter(match[1]);
  return {
    ...frontmatter,
    order: Number(frontmatter.order ?? 999),
    sourceRefs: frontmatter.sourceRefs ?? [],
    body: match[2].trim(),
    filePath: path.relative(contentDir, filePath)
  };
}

function parseFrontmatter(text) {
  const out = {};
  let currentList = null;
  for (const line of text.split("\n")) {
    const listItem = line.match(/^\s+-\s+"?([^"]+)"?\s*$/);
    if (listItem && currentList) {
      out[currentList].push(listItem[1]);
      continue;
    }
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) continue;
    currentList = null;
    const [, key, raw] = match;
    if (raw === "") {
      out[key] = [];
      currentList = key;
    } else {
      out[key] = raw.replace(/^"|"$/g, "");
    }
  }
  return out;
}

function renderPage(page, { nav, runtime, previous, next, preview }) {
  const expandedBody = applyRuntimeTokens(page.body, runtime);
  const body = renderMarkdown(expandedBody, { page });
  const toc = extractPageToc(expandedBody);
  const canonical = `${DOCS_ORIGIN}${page.canonicalPath}`;
  const robots = preview ? '<meta name="robots" content="noindex, nofollow">' : "";
  const pageKind = pageKindForSection(page.section);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(page.title)} - Nullark Docs</title>
  <meta name="description" content="${escapeAttr(page.description)}">
  ${robots}
  <link rel="canonical" href="${canonical}">
  <meta property="og:title" content="${escapeAttr(page.title)}">
  <meta property="og:description" content="${escapeAttr(page.description)}">
  <link rel="stylesheet" href="/assets/styles.css">
</head>
<body data-theme="dark">
  <header class="topbar">
    <a class="brand" href="/start/overview/" aria-label="Nullark docs home"><span class="brand-mark" aria-hidden="true">N</span><span>Nullark Docs</span></a>
    <button class="global-search" type="button" data-search-open aria-label="Open docs search"><span>Search docs</span><kbd>/</kbd></button>
    <button class="mobile-nav-toggle" type="button" data-mobile-nav-toggle aria-controls="docs-sidebar" aria-expanded="false">Menu</button>
  </header>
  <div class="safety-strip" role="note">
    <strong>Documentation surface:</strong> docs.nullark.com does not connect wallets, request signatures, recover notes, or submit transactions.
  </div>
  <div class="shell">
    <aside id="docs-sidebar" class="sidebar">
      <nav aria-label="Docs navigation">${renderNav(nav, page.canonicalPath)}</nav>
    </aside>
    <main class="content">
      <article class="article">
        <p class="breadcrumb">${escapeHtml(page.section)} / ${escapeHtml(page.version)}</p>
        <p class="page-kind">${escapeHtml(pageKind)}</p>
        <h1 id="${slug(page.title)}">${escapeHtml(page.title)} <a class="anchor-link" href="#${slug(page.title)}" aria-label="Link to ${escapeAttr(page.title)}">#</a></h1>
        <p class="lede">${escapeHtml(page.description)}</p>
      ${body}
        <nav class="pager" aria-label="Page navigation">
          ${previous ? `<a href="${previous.canonicalPath}"><span>Previous</span>${escapeHtml(previous.title)}</a>` : "<span></span>"}
          ${next ? `<a href="${next.canonicalPath}"><span>Next</span>${escapeHtml(next.title)}</a>` : "<span></span>"}
        </nav>
      </article>
    </main>
    <aside class="toc" aria-label="On this page">
      <div class="toc-card">
        <span>On this page</span>
        ${renderPageToc(toc)}
      </div>
    </aside>
  </div>
  <div class="search-modal" data-search-modal hidden>
    <div class="search-backdrop" data-search-close></div>
    <section class="search-dialog" role="dialog" aria-modal="true" aria-label="Search Nullark docs">
      <div class="search-dialog-bar">
        <input id="docs-search-modal-input" type="search" autocomplete="off" placeholder="Search Nullark docs" aria-label="Search Nullark docs">
        <button type="button" data-search-close>Esc</button>
      </div>
      <div id="docs-search-modal-results" class="search-dialog-results" aria-live="polite"></div>
    </section>
  </div>
  <script src="/assets/docs.js"></script>
</body>
</html>
`;
}

function renderNotFound({ nav, runtime, preview }) {
  return renderPage(
    {
      title: "Page Not Found",
      description: "The requested Nullark documentation page does not exist.",
      section: "system",
      version: "current",
      canonicalPath: "/404/",
      body: "Use the navigation to return to the current Nullark documentation."
    },
    { nav, runtime, preview }
  );
}

function renderNav(nav, currentPath) {
  const sectionLabels = new Map([
    ["start", "Start"],
    ["users", "Use Nullark"],
    ["developers", "Developers"],
    ["operators", "Operators"],
    ["security", "Security"],
    ["reference", "Reference"],
    ["troubleshooting", "Troubleshooting"],
    ["versions", "Versions"]
  ]);
  const groups = new Map();
  for (const item of nav.filter((entry) => entry.section !== "versions")) {
    if (!groups.has(item.section)) groups.set(item.section, []);
    groups.get(item.section).push(item);
  }
  return [...groups.entries()]
    .map(
      ([section, items]) =>
        `<div class="nav-section" data-section="${escapeAttr(section)}"><span>${iconSvg(sectionIconName(section), "section-icon")}${escapeHtml(sectionLabels.get(section) ?? section)}</span><ul>${items
          .map((item) => `<li><a ${item.path === currentPath ? 'aria-current="page"' : ""} href="${item.path}">${escapeHtml(item.title)}</a></li>`)
          .join("")}</ul></div>`
    )
    .join("");
}

function pageKindForSection(section) {
  if (section === "users") return "User flow";
  if (section === "developers") return "Developer note";
  if (section === "security") return "Security note";
  if (section === "reference") return "Reference";
  if (section === "operators") return "Operator note";
  return "Guide";
}

function extractPageToc(markdown) {
  return markdown
    .split("\n")
    .map((line) => line.match(/^(#{2,3})\s+(.+)$/))
    .filter(Boolean)
    .map((match) => {
      const text = match[2].replace(/\s+<[^>]+>$/g, "").trim();
      return { level: match[1].length, text, id: slug(text) };
    })
    .slice(0, 8);
}

function renderPageToc(items) {
  if (!items.length) {
    return `<p class="toc-empty">No page sections.</p>`;
  }
  return `<ol>${items
    .map((item) => `<li class="toc-level-${item.level}"><a href="#${escapeAttr(item.id)}">${escapeHtml(item.text)}</a></li>`)
    .join("")}</ol>`;
}

function applyRuntimeTokens(text, runtime) {
  return text.replace(/\{\{\s*runtime\.([A-Za-z0-9_]+)\s*\}\}/g, (_, key) => {
    if (!(key in runtime)) throw new Error(`unknown runtime token ${key}`);
    return String(runtime[key]);
  });
}

function renderMarkdown(markdown, context = {}) {
  const lines = markdown.split("\n");
  let html = "";
  let paragraph = [];
  let list = [];
  let code = null;
  let claimContext = null;
  let customBlock = null;
  let table = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      html += `<p>${renderInline(paragraph.join(" "))}</p>\n`;
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list.length) {
      html += `<ul>${list.map((item) => `<li>${renderInline(item)}</li>`).join("")}</ul>\n`;
      list = [];
    }
  };
  const flushTable = () => {
    if (table.length) {
      html += renderTable(table);
      table = [];
    }
  };

  for (const line of lines) {
    if (customBlock) {
      if (line === ":::") {
        flushParagraph();
        flushList();
        flushTable();
        html += renderCustomBlock(customBlock.type, customBlock.lines, context);
        customBlock = null;
      } else {
        customBlock.lines.push(line);
      }
      continue;
    }
    if (code !== null) {
      if (line.startsWith("```")) {
        html += renderCodeBlock(code.language, code.lines);
        code = null;
      } else {
        code.lines.push(line);
      }
      continue;
    }
    const codeStart = line.match(/^```([A-Za-z0-9_-]+)?/);
    if (codeStart) {
      flushParagraph();
      flushList();
      flushTable();
      code = { language: codeStart[1] ?? "", lines: [] };
      continue;
    }
    const customStart = line.match(/^:::(hero|cards|facts|checklist|steps|badges|accordion|tabs)$/);
    if (customStart) {
      flushParagraph();
      flushList();
      flushTable();
      customBlock = { type: customStart[1], lines: [] };
      continue;
    }
    const ctxStart = line.match(/^:::(non_claim|risk_caveat|owner_approved_claim)$/);
    if (ctxStart) {
      flushParagraph();
      flushList();
      flushTable();
      claimContext = ctxStart[1];
      html += `<div class="callout" data-claim-context="${claimContext}">${iconSvg(calloutIconName(claimContext), "callout-icon")}\n`;
      continue;
    }
    if (line === ":::" && claimContext) {
      flushParagraph();
      flushList();
      flushTable();
      html += "</div>\n";
      claimContext = null;
      continue;
    }
    if (/^#{2,4}\s+/.test(line)) {
      flushParagraph();
      flushList();
      flushTable();
      const level = line.match(/^#+/)[0].length;
      const text = line.replace(/^#{2,4}\s+/, "");
      const id = slug(text);
      html += `<h${level} id="${id}">${escapeHtml(text)} <a class="anchor-link" href="#${id}" aria-label="Link to ${escapeAttr(text)}">#</a></h${level}>\n`;
      continue;
    }
    if (/^>\s+/.test(line)) {
      flushParagraph();
      flushList();
      flushTable();
      html += `<blockquote>${renderInline(line.replace(/^>\s+/, ""))}</blockquote>\n`;
      continue;
    }
    if (/^\|.+\|$/.test(line.trim())) {
      flushParagraph();
      flushList();
      table.push(line.trim());
      continue;
    }
    if (/^-\s+/.test(line)) {
      flushParagraph();
      flushTable();
      list.push(line.replace(/^-\s+/, ""));
      continue;
    }
    if (line.trim() === "") {
      flushParagraph();
      flushList();
      flushTable();
      continue;
    }
    flushTable();
    paragraph.push(line.trim());
  }
  flushParagraph();
  flushList();
  flushTable();
  if (customBlock) html += renderCustomBlock(customBlock.type, customBlock.lines, context);
  if (claimContext) html += "</div>\n";
  return html;
}

function renderTable(rows) {
  if (rows.length < 2 || !/^\|\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|$/.test(rows[1])) {
    return rows.map((row) => `<p>${renderInline(row)}</p>\n`).join("");
  }
  const headers = splitTableRow(rows[0]);
  const bodyRows = rows.slice(2).map(splitTableRow).filter((row) => row.length === headers.length);
  return `<div class="table-wrap"><table><thead><tr>${headers.map((cell) => `<th>${renderInline(cell, { externalIcons: false })}</th>`).join("")}</tr></thead><tbody>${bodyRows
    .map((row) => `<tr>${row.map((cell) => `<td>${renderInline(cell, { externalIcons: false })}</td>`).join("")}</tr>`)
    .join("")}</tbody></table></div>\n`;
}

function renderCodeBlock(language, lines) {
  const label = language ? `<span class="code-label">${escapeHtml(language)}</span>` : "";
  return `<pre data-language="${escapeAttr(language || "text")}">${label}<code>${escapeHtml(lines.join("\n"))}</code></pre>\n`;
}

function splitTableRow(row) {
  return row
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((cell) => cell.trim());
}

function renderCustomBlock(type, lines, context = {}) {
  if (type === "hero") {
    const [eyebrow = "", headline = "", body = "", primary = "", secondary = ""] = compactLines(lines);
    return `<section class="hero-panel">
  <div class="hero-copy">
    <p class="hero-eyebrow">${escapeHtml(eyebrow)}</p>
    <h2>${escapeHtml(headline)}</h2>
    <p>${renderInline(body)}</p>
    <div class="hero-actions">${renderAction(primary)}${renderAction(secondary)}</div>
  </div>
</section>\n`;
  }
  if (type === "cards") {
    const cardIcons = context.page?.canonicalPath === "/start/overview/";
    return `<div class="card-grid">${compactLines(lines)
      .map((line, index) => {
        const [title = "", href = "", body = ""] = line.split("|").map((part) => part.trim());
        const icon = cardIcons ? iconSvg(overviewCardIconName(index), "card-icon") : "";
        return `<a class="doc-card" href="${escapeAttr(href)}">${icon}<strong>${escapeHtml(title)}</strong><span>${renderInline(body)}</span><em aria-hidden="true">Read</em></a>`;
      })
      .join("")}</div>\n`;
  }
  if (type === "facts") {
    return `<dl class="fact-strip">${compactLines(lines)
      .map((line) => {
        const [label = "", value = ""] = line.split("|").map((part) => part.trim());
        return `<div><dt>${escapeHtml(label)}</dt><dd>${renderInline(value)}</dd></div>`;
      })
      .join("")}</dl>\n`;
  }
  if (type === "checklist") {
    return `<ul class="checklist">${compactLines(lines)
      .map((line) => `<li><span class="checklist-marker" aria-hidden="true"></span><span class="checklist-text">${renderInline(line.replace(/^-\s*/, ""))}</span></li>`)
      .join("")}</ul>\n`;
  }
  if (type === "steps") {
    return `<ol class="steps">${compactLines(lines)
      .map((line) => {
        const [title = "", body = ""] = line.replace(/^-\s*/, "").split("|").map((part) => part.trim());
        return `<li><strong>${escapeHtml(title)}</strong>${body ? `<span>${renderInline(body)}</span>` : ""}</li>`;
      })
      .join("")}</ol>\n`;
  }
  if (type === "badges") {
    return `<div class="badge-row">${compactLines(lines)
      .map((line) => {
        const [label = "", tone = "default"] = line.split("|").map((part) => part.trim());
        return `<span class="doc-badge doc-badge--${escapeAttr(slug(tone) || "default")}">${escapeHtml(label)}</span>`;
      })
      .join("")}</div>\n`;
  }
  if (type === "accordion") {
    return `<div class="accordion">${compactLines(lines)
      .map((line, index) => {
        const [title = "", body = ""] = line.split("|").map((part) => part.trim());
        return `<details ${index === 0 ? "open" : ""}><summary>${escapeHtml(title)}</summary><p>${renderInline(body)}</p></details>`;
      })
      .join("")}</div>\n`;
  }
  if (type === "tabs") {
    const rows = compactLines(lines).map((line) => line.split("|").map((part) => part.trim()));
    return `<div class="tabs">${rows
      .map(([label = "", body = ""], index) => `<section class="tab-panel ${index === 0 ? "is-active" : ""}"><strong>${escapeHtml(label)}</strong><p>${renderInline(body)}</p></section>`)
      .join("")}</div>\n`;
  }
  return "";
}

function renderAction(line) {
  if (!line) return "";
  const [label = "", href = ""] = line.split("|").map((part) => part.trim());
  return `<a class="button-link" href="${escapeAttr(href)}">${escapeHtml(label)}</a>`;
}

function compactLines(lines) {
  return lines.map((line) => line.trim()).filter(Boolean);
}

function renderInline(text, options = {}) {
  const externalIcons = options.externalIcons !== false;
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
      const external = externalIcons && /^https?:\/\//.test(href);
      return `<a href="${escapeAttr(href)}"${external ? ' class="external-link"' : ""}>${label}${external ? iconSvg("external", "inline-icon") : ""}</a>`;
    })
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

function sectionIconName(section) {
  return (
    {
      start: "compass",
      users: "wallet",
      developers: "code",
      operators: "server",
      security: "shield",
      reference: "book",
      troubleshooting: "wrench"
    }[section] ?? "doc"
  );
}

function calloutIconName(context) {
  if (context === "risk_caveat") return "info";
  if (context === "non_claim") return "shield";
  return "info";
}

function overviewCardIconName(index) {
  return ["wallet", "code", "shield"][index] ?? "doc";
}

function iconSvg(name, className = "icon") {
  const attrs = `class="${escapeAttr(className)}" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"`;
  const paths = {
    book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21V5.5Z"/><path d="M4 5.5V21"/><path d="M8 7h8"/>',
    code: '<path d="m9 18-6-6 6-6"/><path d="m15 6 6 6-6 6"/>',
    compass: '<circle cx="12" cy="12" r="9"/><path d="m15 9-2 5-5 2 2-5 5-2Z"/>',
    doc: '<path d="M6 3h8l4 4v14H6V3Z"/><path d="M14 3v5h5"/><path d="M9 13h6"/><path d="M9 17h4"/>',
    external: '<path d="M7 17 17 7"/><path d="M9 7h8v8"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m16 16 4 4"/>',
    server: '<rect x="4" y="4" width="16" height="6" rx="2"/><rect x="4" y="14" width="16" height="6" rx="2"/><path d="M8 7h.01"/><path d="M8 17h.01"/>',
    shield: '<path d="M12 3 20 6v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3Z"/>',
    wallet: '<path d="M5 7h13a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/><path d="M16 12h4"/><path d="M7 7V5a2 2 0 0 1 2-2h8v4"/>',
    warning: '<path d="M12 3 22 20H2L12 3Z"/><path d="M12 9v5"/><path d="M12 17h.01"/>',
    wrench: '<path d="M14.7 6.3a4 4 0 0 0-5 5L4 17l3 3 5.7-5.7a4 4 0 0 0 5-5l-2.8 2.8-3-3 2.8-2.8Z"/>'
  };
  return `<svg ${attrs}>${paths[name] ?? paths.doc}</svg>`;
}

function renderSitemap(pages) {
  const urls = ["/", ...pages.map((page) => page.canonicalPath)];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((url) => `  <url><loc>${DOCS_ORIGIN}${url}</loc></url>`).join("\n")}
</urlset>
`;
}

function renderHeaders(preview) {
  return `/*
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'none'
  Referrer-Policy: strict-origin-when-cross-origin
  X-Content-Type-Options: nosniff
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=()
${preview ? "  X-Robots-Tag: noindex, nofollow\n" : ""}`;
}

function stripAllowedClaimContexts(text) {
  return text.replace(/<div class="callout" data-claim-context="(?:non_claim|risk_caveat|owner_approved_claim)">[\s\S]*?<\/div>/g, "");
}

function stylesheet() {
  return `:root{
  color:#18201c;
  background:#f7f8f4;
  font:16px/1.65 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --bg:#f7f8f4;
  --panel:#ffffff;
  --panel-soft:#f1f5ef;
  --ink:#18201c;
  --muted:#637168;
  --faint:#8a968f;
  --line:#dce3dc;
  --line-strong:#c6d1c8;
  --green:#16583d;
  --green-soft:#e7f2ec;
  --blue:#1b4d72;
  --amber:#7a5620;
  --shadow:0 18px 55px rgba(30,45,35,.08);
}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--ink)}
a{color:var(--green);text-decoration:none}
a:hover{text-decoration:underline;text-underline-offset:3px}
.topbar{
  position:sticky;
  top:0;
  z-index:20;
  height:64px;
  display:grid;
  grid-template-columns:280px minmax(240px,520px) auto;
  gap:20px;
  align-items:center;
  border-bottom:1px solid var(--line);
  padding:0 24px;
  background:rgba(255,255,255,.92);
  backdrop-filter:blur(16px);
}
.brand{display:inline-flex;align-items:center;gap:10px;color:#111712;font-weight:760;letter-spacing:0}
.brand-mark{
  display:grid;
  place-items:center;
  width:30px;
  height:30px;
  border-radius:8px;
  background:#14231b;
  color:#f7fff8;
  font-size:14px;
  box-shadow:inset 0 0 0 1px rgba(255,255,255,.14);
}
.global-search{
  justify-self:stretch;
  height:40px;
  display:flex;
  align-items:center;
  justify-content:space-between;
  border:1px solid var(--line-strong);
  border-radius:9px;
  background:#fff;
  color:#68756d;
  padding:0 12px;
  font:inherit;
  box-shadow:0 1px 0 rgba(20,35,27,.04);
  cursor:pointer;
}
.global-search kbd{
  min-width:22px;
  border:1px solid var(--line);
  border-bottom-color:#bcc9c0;
  border-radius:5px;
  color:#526058;
  background:#f8faf7;
  font:12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
}
.top-links{display:flex;align-items:center;justify-content:flex-end;gap:18px;font-size:14px}
.top-links a{color:#34483d}
.surface-pill{
  display:inline-flex;
  align-items:center;
  min-height:28px;
  border:1px solid #b9d2c3;
  border-radius:999px;
  background:var(--green-soft);
  color:#174c37;
  padding:3px 10px;
  font-size:12px;
  font-weight:760;
}
.safety-strip{
  border-bottom:1px solid #d8e0d8;
  background:#f9fbf8;
  color:#4c5c52;
  padding:9px 24px;
  text-align:center;
  font-size:13px;
}
.safety-strip strong{color:#233229}
.shell{
  display:grid;
  grid-template-columns:292px minmax(0,740px) 236px;
  gap:32px;
  max-width:1350px;
  margin:0 auto;
  padding:0 24px;
}
.sidebar{
  position:sticky;
  top:105px;
  align-self:start;
  height:calc(100vh - 105px);
  overflow:auto;
  border-right:1px solid var(--line);
  padding:24px 22px 48px 0;
}
.runtime-badge{
  display:grid;
  gap:4px;
  border:1px solid #c9dbd0;
  border-radius:10px;
  background:linear-gradient(180deg,#ffffff,#f1f7f3);
  color:#405249;
  padding:13px;
  margin-bottom:18px;
}
.runtime-badge span,.toc-card>span,.trust-card>span{
  color:#66756d;
  font-size:11px;
  font-weight:820;
  letter-spacing:.08em;
  text-transform:uppercase;
}
.runtime-badge strong{color:#173d2c;font-size:15px}
.runtime-badge small{color:#617169;font-size:12px;line-height:1.45}
.search-label,.version-label{
  display:block;
  margin:14px 0 6px;
  color:#5f6e66;
  font-size:12px;
  font-weight:760;
}
.search-input,.version-select{
  width:100%;
  border:1px solid var(--line-strong);
  border-radius:8px;
  background:#fff;
  color:var(--ink);
  padding:9px 10px;
  font:inherit;
}
.search-input:focus,.version-select:focus,.global-search:focus,#docs-search-modal-input:focus{
  outline:2px solid rgba(22,88,61,.18);
  border-color:#7ead92;
}
.search-results{display:grid;gap:6px;margin:9px 0 16px;font-size:13px}
.search-results a{
  display:block;
  border:1px solid var(--line);
  border-radius:8px;
  background:#fff;
  padding:7px 9px;
  color:#25342c;
}
.nav-section{margin-top:20px}
.nav-section>span{
  display:block;
  margin-bottom:6px;
  color:#7a877f;
  font-size:11px;
  font-weight:830;
  letter-spacing:.08em;
  text-transform:uppercase;
}
.sidebar ul{list-style:none;padding:0;margin:0}
.sidebar li{margin:1px 0}
.sidebar a{
  display:block;
  border-radius:7px;
  padding:6px 9px;
  color:#2e3d34;
  font-size:14px;
  line-height:1.35;
}
.sidebar a:hover{background:#eef4ef;text-decoration:none}
.sidebar a[aria-current=page]{
  background:#e5f1ea;
  color:#0f5132;
  font-weight:760;
  box-shadow:inset 3px 0 0 #24704e;
}
.content{min-width:0;padding:42px 0 80px}
.article{
  max-width:720px;
  min-width:0;
}
.breadcrumb{
  margin:0 0 12px;
  color:#68776f;
  font-size:12px;
  font-weight:780;
  letter-spacing:.08em;
  text-transform:uppercase;
}
h1,h2,h3,h4{letter-spacing:0}
h1{
  margin:0 0 10px;
  color:#101712;
  font-size:38px;
  line-height:1.12;
}
h2{
  margin:38px 0 12px;
  border-top:1px solid var(--line);
  padding-top:24px;
  color:#141c17;
  font-size:22px;
  line-height:1.25;
}
h3{margin:28px 0 10px;font-size:20px;line-height:1.3}
h4{margin:22px 0 8px;font-size:17px}
.anchor-link{color:#8b9a91;font-size:.58em;opacity:0;text-decoration:none}
h1:hover .anchor-link,h2:hover .anchor-link,h3:hover .anchor-link,h4:hover .anchor-link{opacity:1}
.lede{
  margin:0 0 24px;
  max-width:720px;
  color:#4f5f56;
  font-size:19px;
  line-height:1.6;
}
p{margin:14px 0;color:#28352e}
code{
  border:1px solid #d7e1da;
  border-radius:6px;
  background:#eef4f0;
  color:#173b2b;
  padding:2px 5px;
  font:13px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace;
  overflow-wrap:anywhere;
}
pre{
  position:relative;
  margin:20px 0;
  border:1px solid #22372d;
  border-radius:12px;
  background:#101a15;
  color:#f2fff5;
  padding:18px;
  overflow:auto;
  box-shadow:var(--shadow);
}
pre code{border:0;background:transparent;color:inherit;padding:0}
.copy{
  float:right;
  border:1px solid #577063;
  border-radius:7px;
  background:#1d2d25;
  color:#fff;
  padding:4px 9px;
  font:12px/1.4 ui-sans-serif, system-ui, sans-serif;
}
blockquote{
  margin:18px 0;
  border-left:4px solid #8aaed0;
  background:#eef5fb;
  color:#21384a;
  padding:12px 16px;
}
.hero-panel{
  display:grid;
  grid-template-columns:minmax(0,1fr) 240px;
  gap:22px;
  align-items:stretch;
  margin:24px 0 22px;
  border:1px solid #c7d8ce;
  border-radius:12px;
  background:
    radial-gradient(circle at 95% 0%, rgba(34,110,77,.12), transparent 34%),
    linear-gradient(135deg,#ffffff 0%,#f1f7f3 100%);
  padding:24px;
  box-shadow:var(--shadow);
}
.hero-panel h2{
  margin:0 0 12px;
  border:0;
  padding:0;
  color:#101812;
  font-size:30px;
  line-height:1.12;
}
.hero-panel p{max-width:660px}
.hero-eyebrow{
  margin:0 0 8px;
  color:#24694a;
  font-size:12px;
  font-weight:840;
  letter-spacing:.08em;
  text-transform:uppercase;
}
.hero-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:20px}
.button-link{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  min-height:40px;
  border:1px solid #174b35;
  border-radius:9px;
  background:#174b35;
  color:#fff;
  padding:9px 13px;
  font-weight:760;
}
.button-link:hover{text-decoration:none;background:#103927}
.button-link+a{background:#fff;color:#174b35}
.button-link+a:hover{background:#eef6f1}
.hero-signal{
  display:flex;
  flex-direction:column;
  justify-content:flex-end;
  min-height:180px;
  border:1px solid #cfe0d5;
  border-radius:13px;
  background:#fbfdfb;
  padding:17px;
}
.hero-signal span{
  color:#66766d;
  font-size:11px;
  font-weight:820;
  letter-spacing:.08em;
  text-transform:uppercase;
}
.hero-signal strong{margin-top:8px;color:#132219;font-size:20px;line-height:1.15}
.hero-signal small{margin-top:8px;color:#66746c;line-height:1.45}
.page-kind{
  margin:0 0 8px;
  color:var(--faint);
  font-size:13px;
  font-style:italic;
}
.card-grid{
  display:grid;
  grid-template-columns:repeat(2,minmax(0,1fr));
  gap:14px;
  margin:22px 0;
}
.doc-card{
  position:relative;
  display:grid;
  min-height:142px;
  border:1px solid #d9e2da;
  border-radius:13px;
  background:#fff;
  color:var(--ink);
  padding:18px;
  box-shadow:0 1px 0 rgba(20,35,27,.03);
  transition:transform .16s ease, border-color .16s ease, box-shadow .16s ease;
}
.doc-card:hover{
  transform:translateY(-2px);
  border-color:#b8d0c0;
  box-shadow:0 14px 36px rgba(35,55,42,.09);
  text-decoration:none;
}
.doc-card strong{display:block;margin-bottom:7px;color:#121b15;font-size:16px}
.doc-card span{display:block;color:#58685f;font-size:14px;line-height:1.55}
.doc-card em{
  align-self:end;
  color:#236448;
  font-size:13px;
  font-style:normal;
  font-weight:760;
}
.fact-strip{
  display:grid;
  grid-template-columns:repeat(4,minmax(0,1fr));
  gap:0;
  overflow:hidden;
  border:1px solid #d4ded7;
  border-radius:13px;
  background:#fff;
  margin:22px 0;
}
.fact-strip div{min-width:0;padding:15px;border-right:1px solid #dce5df}
.fact-strip div:last-child{border-right:0}
.fact-strip dt{
  color:#6e7b74;
  font-size:11px;
  font-weight:820;
  letter-spacing:.08em;
  text-transform:uppercase;
}
.fact-strip dd{margin:5px 0 0;color:#17231c;font-weight:760;overflow-wrap:anywhere}
.checklist{display:grid;gap:8px;padding:0;list-style:none}
.checklist li{
  display:grid;
  grid-template-columns:22px minmax(0,1fr);
  gap:10px;
  align-items:start;
  border:1px solid #dce5df;
  border-radius:11px;
  background:#fff;
  padding:12px 14px;
}
.checklist-marker{
  width:18px;
  height:18px;
  margin-top:3px;
  border-radius:999px;
  background:#e6f2eb;
  border:1px solid #9ec4ad;
  position:relative;
}
.checklist-marker:after{
  content:"";
  position:absolute;
  left:5px;
  top:2px;
  width:5px;
  height:9px;
  border:solid #236448;
  border-width:0 2px 2px 0;
  transform:rotate(45deg);
}
.checklist-text{
  min-width:0;
  overflow-wrap:anywhere;
}
.steps{
  display:grid;
  gap:12px;
  margin:22px 0;
  padding:0;
  list-style:none;
  counter-reset:steps;
}
.steps li{
  display:grid;
  grid-template-columns:34px minmax(0,1fr);
  gap:13px;
  align-items:start;
  border:1px solid #d9e3dc;
  border-radius:13px;
  background:#fff;
  padding:15px;
  counter-increment:steps;
}
.steps li:before{
  display:grid;
  place-items:center;
  width:30px;
  height:30px;
  border-radius:999px;
  background:#173d2c;
  color:#fff;
  content:counter(steps);
  font-size:13px;
  font-weight:800;
}
.steps strong{display:block;color:#142119;line-height:1.35}
.steps span{display:block;grid-column:2;margin-top:-2px;color:#5a695f;font-size:14px;line-height:1.55}
.table-wrap{
  overflow:auto;
  margin:18px 0;
  border:1px solid #d7e1da;
  border-radius:8px;
  background:#fff;
}
table{
  width:100%;
  border-collapse:collapse;
  min-width:560px;
}
th,td{
  border-bottom:1px solid #e1e8e2;
  padding:9px 11px;
  text-align:left;
  vertical-align:top;
}
th{
  background:#f5f8f5;
  color:#64736a;
  font-size:11px;
  font-weight:820;
  letter-spacing:.08em;
  text-transform:uppercase;
}
td{color:#24332a;font-size:14px}
td code{
  border:0;
  border-radius:0;
  background:transparent;
  color:#3a276f;
  padding:0;
  font-size:12.5px;
  line-height:1.5;
  word-break:break-all;
}
tr:last-child td{border-bottom:0}
.callout{
  border:0;
  border-left:3px solid #24704e;
  border-radius:0;
  background:transparent;
  padding:4px 0 4px 14px;
  margin:18px 0;
}
.callout[data-claim-context=risk_caveat]{border-left-color:#9b6b22;background:transparent}
.callout p:first-child{margin-top:0}
.callout p:last-child{margin-bottom:0}
.pager{
  display:grid;
  grid-template-columns:1fr 1fr;
  gap:14px;
  border-top:1px solid var(--line);
  margin-top:48px;
  padding-top:22px;
}
.pager a{
  display:grid;
  gap:4px;
  border:1px solid var(--line);
  border-radius:12px;
  background:#fff;
  padding:13px;
  color:#15231b;
}
.pager a:hover{text-decoration:none;border-color:#b9d0c0;background:#f9fcfa}
.pager a:last-child{text-align:right}
.pager a span{
  color:#6e7b74;
  font-size:11px;
  font-weight:820;
  letter-spacing:.08em;
  text-transform:uppercase;
}
.toc{
  position:sticky;
  top:105px;
  align-self:start;
  height:calc(100vh - 105px);
  padding:42px 0 32px;
  overflow:auto;
}
.toc-card,.trust-card{
  border:1px solid var(--line);
  border-radius:13px;
  background:rgba(255,255,255,.72);
  padding:14px;
}
.toc-card ol{list-style:none;margin:10px 0 0;padding:0}
.toc-card li{margin:6px 0}
.toc-card a{display:block;color:#536158;font-size:13px;line-height:1.35}
.toc-card a:hover{color:#174b35;text-decoration:none}
.toc-level-3{padding-left:12px}
.toc-empty,.trust-card p{margin:8px 0 0;color:#68756e;font-size:13px;line-height:1.5}
.search-modal[hidden]{display:none}
.search-modal{
  position:fixed;
  inset:0;
  z-index:50;
  display:grid;
  place-items:start center;
  padding-top:11vh;
}
.search-backdrop{position:absolute;inset:0;background:rgba(17,25,20,.44);backdrop-filter:blur(3px)}
.search-dialog{
  position:relative;
  width:min(720px,calc(100vw - 32px));
  overflow:hidden;
  border:1px solid rgba(214,225,217,.9);
  border-radius:16px;
  background:#fff;
  box-shadow:0 28px 90px rgba(10,20,14,.26);
}
.search-dialog-bar{
  display:grid;
  grid-template-columns:minmax(0,1fr) auto;
  gap:10px;
  border-bottom:1px solid var(--line);
  padding:12px;
}
#docs-search-modal-input{
  border:0;
  color:var(--ink);
  font:inherit;
  font-size:18px;
  line-height:1.4;
}
.search-dialog-bar button{
  border:1px solid var(--line);
  border-radius:8px;
  background:#f8faf7;
  color:#5a665f;
  padding:6px 10px;
}
.search-dialog-results{display:grid;gap:6px;max-height:420px;overflow:auto;padding:12px}
.search-dialog-results a{
  display:grid;
  gap:3px;
  border:1px solid transparent;
  border-radius:10px;
  padding:10px 11px;
  color:#17231c;
}
.search-dialog-results a:hover{background:#f1f7f3;border-color:#d8e5dc;text-decoration:none}
.search-dialog-results span{color:#68766e;font-size:13px}
@media(max-width:1180px){
  .shell{grid-template-columns:276px minmax(0,1fr);gap:28px}
  .toc{display:none}
  .topbar{grid-template-columns:240px minmax(220px,1fr) auto}
}
@media(max-width:900px){
  .topbar{grid-template-columns:1fr auto;height:auto;min-height:60px;padding:10px 16px}
  .global-search{grid-column:1/-1;order:3}
  .top-links{gap:10px;font-size:13px}
  .surface-pill{display:none}
  .safety-strip{padding:8px 14px;text-align:left}
  .shell{display:flex;flex-direction:column;padding:0 18px}
  .sidebar{
    order:2;
    position:relative;
    top:auto;
    height:auto;
    border-right:0;
    border-top:1px solid var(--line);
    border-bottom:1px solid var(--line);
    padding:18px 0 22px;
  }
  .content{order:1;padding:30px 0 42px}
  h1{font-size:36px}
  .hero-panel{grid-template-columns:1fr;padding:22px}
  .hero-signal{min-height:auto}
  .card-grid,.fact-strip{grid-template-columns:1fr}
  .fact-strip div{border-right:0;border-bottom:1px solid #dce5df}
  .fact-strip div:last-child{border-bottom:0}
  .pager{grid-template-columns:1fr}
  .pager a:last-child{text-align:left}
}
@media(max-width:560px){
  .top-links a:nth-of-type(2){display:none}
  .hero-panel h2{font-size:27px}
  h1{font-size:32px}
  .lede{font-size:17px}
}

/* Nullark accent layer: product-aligned graphite/lavender docs theme. */
:root{
  --bg:#08090d;
  --panel:#121318;
  --panel-soft:#171820;
  --panel-hard:#202126;
  --ink:#f3f4f8;
  --muted:rgba(243,244,248,.68);
  --faint:rgba(243,244,248,.44);
  --line:rgba(243,244,248,.13);
  --line-strong:rgba(167,139,250,.32);
  --accent:#a78bfa;
  --accent-strong:#d8ccff;
  --accent-soft:rgba(167,139,250,.08);
  --danger:#ff6f76;
  --warn:#d8c66c;
  --shadow:0 22px 70px rgba(0,0,0,.32);
  color-scheme:dark;
}
body{
  background:
    linear-gradient(180deg,rgba(167,139,250,.035),transparent 340px),
    repeating-linear-gradient(90deg,rgba(243,244,248,.024) 0 1px,transparent 1px 72px),
    repeating-linear-gradient(0deg,rgba(243,244,248,.018) 0 1px,transparent 1px 18px),
    var(--bg);
  color:var(--ink);
  text-rendering:geometricPrecision;
}
body[data-theme=light]{
  --bg:#f7f7fb;
  --panel:#ffffff;
  --panel-soft:#fbfaff;
  --panel-hard:#f1eefb;
  --ink:#171820;
  --muted:#606272;
  --faint:#858899;
  --line:rgba(139,108,226,.22);
  --line-strong:rgba(139,108,226,.38);
  --accent:#8b6ce2;
  --accent-strong:#5d43ba;
  --accent-soft:rgba(139,108,226,.1);
  --shadow:0 18px 55px rgba(35,28,64,.10);
  color-scheme:light;
}
body:after{
  position:fixed;
  inset:0;
  z-index:-1;
  background:repeating-linear-gradient(0deg,rgba(255,255,255,.026) 0,rgba(255,255,255,.026) 1px,transparent 1px,transparent 5px);
  content:"";
  opacity:.34;
  pointer-events:none;
}
a{color:var(--accent-strong)}
.topbar{
  background:rgba(8,9,13,.86);
  border-bottom-color:var(--line);
  box-shadow:0 1px 0 rgba(255,255,255,.035);
}
body[data-theme=light] .topbar{background:rgba(255,255,255,.9)}
.brand{color:var(--ink);font-weight:900;text-transform:uppercase}
.brand-mark{background:var(--panel-hard);color:var(--accent-strong);border:1px solid var(--line-strong);border-radius:6px;box-shadow:none}
.global-search,.search-input,.version-select,.search-dialog-bar button,.theme-toggle,.mobile-nav-toggle{
  border-color:var(--line);
  background:rgba(255,255,255,.035);
  color:var(--muted);
}
.global-search:hover,.theme-toggle:hover,.mobile-nav-toggle:hover{border-color:var(--line-strong);color:var(--accent-strong)}
.global-search kbd{border-color:var(--line);background:rgba(255,255,255,.045);color:var(--accent-strong)}
.top-links a{color:var(--muted)}
.surface-pill,.doc-badge{
  border:1px solid var(--line-strong);
  background:var(--accent-soft);
  color:var(--accent-strong);
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
  text-transform:uppercase;
}
.theme-toggle,.mobile-nav-toggle{
  min-height:30px;
  border-radius:999px;
  padding:4px 10px;
  font:700 12px/1 ui-monospace,SFMono-Regular,Menlo,monospace;
  cursor:pointer;
}
.mobile-nav-toggle{display:none}
.safety-strip{
  border-bottom-color:var(--line);
  background:rgba(18,19,24,.86);
  color:var(--muted);
}
body[data-theme=light] .safety-strip{background:rgba(255,255,255,.78)}
.safety-strip strong,.breadcrumb,.hero-eyebrow,.nav-section>span,.runtime-badge span,.toc-card>span,.trust-card>span,th{
  color:var(--faint);
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
  font-weight:900;
}
.sidebar{border-right-color:var(--line)}
.runtime-badge,.toc-card,.trust-card,.doc-card,.fact-strip,.checklist li,.steps li,.table-wrap,.pager a,.search-dialog{
  border-color:var(--line);
  background:
    repeating-linear-gradient(0deg,rgba(243,244,248,.022) 0 1px,transparent 1px 12px),
    var(--panel-soft);
  box-shadow:inset 0 1px 0 rgba(243,244,248,.055);
}
.runtime-badge strong,h1,h2,h3,h4,.doc-card strong,.steps strong,.hero-panel h2,.hero-signal strong{color:var(--ink)}
.runtime-badge small,.lede,p,.doc-card span,.steps span,td,.toc-card a,.trust-card p{color:var(--muted)}
.sidebar a{color:var(--muted);border-radius:4px}
.sidebar a:hover{background:rgba(167,139,250,.08);color:var(--ink)}
.sidebar a[aria-current=page]{background:rgba(167,139,250,.14);color:var(--accent-strong);box-shadow:inset 3px 0 0 var(--accent)}
h2{border-top-color:var(--line)}
.anchor-link{color:var(--accent)}
code{
  border-color:var(--line);
  background:rgba(167,139,250,.11);
  color:var(--accent-strong);
}
pre{
  border-color:rgba(205,187,255,.36);
  background:#08090d;
  color:#f3f4f8;
}
.code-label{
  position:absolute;
  top:10px;
  right:58px;
  color:var(--accent-strong);
  font:800 11px/1 ui-monospace,SFMono-Regular,Menlo,monospace;
  letter-spacing:.08em;
  text-transform:uppercase;
}
.copy{border-color:var(--line);background:rgba(167,139,250,.12);color:var(--accent-strong)}
.hero-panel{
  grid-template-columns:minmax(0,1fr);
  border-color:var(--line);
  background:linear-gradient(135deg,rgba(24,24,34,.98),rgba(8,10,14,.96));
}
body[data-theme=light] .hero-panel{
  background:linear-gradient(135deg,#fff,#faf9ff);
}
.button-link{border-color:var(--line-strong);background:var(--panel-hard);color:var(--ink)}
.button-link:hover{background:var(--accent-strong);color:#08090d}
.button-link+a{background:transparent;color:var(--muted)}
.button-link+a:hover{background:rgba(167,139,250,.1)}
.hero-signal{border-color:var(--line);background:rgba(255,255,255,.035)}
.doc-card:hover{border-color:var(--line-strong);box-shadow:0 18px 52px rgba(0,0,0,.26)}
.doc-card em,.toc-card a:hover{color:var(--accent-strong)}
.fact-strip dd{color:var(--ink)}
.fact-strip div{border-right-color:var(--line)}
.checklist-marker,.steps li:before{border-color:var(--line-strong);background:var(--accent);color:#08090d}
.checklist-marker:after{border-color:#08090d}
th{background:rgba(167,139,250,.08)}
td,th{border-bottom-color:var(--line)}
td code{color:var(--accent-strong)}
.callout{border-left-color:var(--accent);background:transparent}
.callout[data-claim-context=risk_caveat]{border-left-color:var(--warn);background:transparent}
.pager{border-top-color:var(--line)}
.pager a:hover{border-color:var(--line-strong);background:rgba(167,139,250,.08)}
.search-backdrop{background:rgba(8,9,13,.66)}
.search-dialog{background:var(--panel);box-shadow:0 30px 90px rgba(0,0,0,.45)}
.search-dialog-bar{border-bottom-color:var(--line)}
.search-dialog-results a{color:var(--ink)}
.search-dialog-results a:hover,.search-dialog-results a.is-active{background:rgba(167,139,250,.12);border-color:var(--line)}
.search-dialog-results span{color:var(--faint)}
.search-dialog-results mark{background:transparent;color:var(--accent-strong);font-weight:900}
.badge-row{display:flex;flex-wrap:wrap;gap:8px;margin:18px 0}
.doc-badge{border-radius:999px;padding:5px 9px;font-size:11px;font-weight:900}
.doc-badge--risk,.doc-badge--warning{border-color:rgba(216,198,108,.44);background:rgba(216,198,108,.1);color:#f2df80}
.doc-badge--boundary{border-color:rgba(255,111,118,.42);background:rgba(255,111,118,.1);color:#ff9ca1}
.accordion{display:grid;gap:10px;margin:20px 0}
.accordion details{border:1px solid var(--line);border-radius:12px;background:var(--panel-soft);padding:12px 14px}
.accordion summary{cursor:pointer;color:var(--ink);font-weight:850}
.tabs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:20px 0}
.tab-panel{border:1px solid var(--line);border-radius:12px;background:var(--panel-soft);padding:14px}
.tab-panel strong{color:var(--accent-strong)}
body.sidebar-open .sidebar{display:block}
@media(max-width:900px){
  .mobile-nav-toggle{display:inline-flex;align-items:center;justify-content:center}
  .topbar{grid-template-columns:1fr auto auto}
  .global-search{grid-column:1/-1}
  .top-links{display:none}
  .sidebar{display:none}
  body.sidebar-open .sidebar{order:0}
  .tabs{grid-template-columns:1fr}
}

/* Protocol Manual layer: dense, neutral, article-first documentation shell. */
:root{
  --bg:#090a0d;
  --panel:#0f1116;
  --panel-soft:#12141a;
  --panel-hard:#171a22;
  --ink:#f4f5f7;
  --muted:#a7adb8;
  --faint:#747b87;
  --line:#282c35;
  --line-strong:#3a3f4b;
  --accent:#a78bfa;
  --accent-strong:#cbbdff;
  --accent-soft:rgba(167,139,250,.10);
  --danger:#ff6f76;
  --warn:#d8c66c;
  --shadow:none;
  color-scheme:dark;
}
body[data-theme=light]{
  --bg:#ffffff;
  --panel:#ffffff;
  --panel-soft:#f6f8fa;
  --panel-hard:#f6f8fa;
  --ink:#1f2328;
  --muted:#57606a;
  --faint:#6e7781;
  --line:#d0d7de;
  --line-strong:#8c959f;
  --accent:#7c3aed;
  --accent-strong:#5b21b6;
  --accent-soft:rgba(124,58,237,.08);
  --shadow:none;
  color-scheme:light;
}
body{
  background:var(--bg);
  color:var(--ink);
  text-rendering:optimizeLegibility;
}
body:after{display:none}
a{color:var(--accent-strong)}
.topbar{
  height:52px;
  grid-template-columns:250px minmax(220px,420px) auto;
  gap:18px;
  border-bottom:1px solid var(--line);
  padding:0 18px;
  background:color-mix(in srgb,var(--bg) 94%,transparent);
  box-shadow:none;
}
body[data-theme=light] .topbar{background:rgba(255,255,255,.94)}
.brand{gap:9px;font-size:14px;font-weight:760;text-transform:none}
.brand-mark{
  width:26px;
  height:26px;
  border-radius:6px;
  border:1px solid var(--line);
  background:var(--panel-soft);
  color:var(--accent-strong);
  font-size:13px;
}
.global-search{
  height:34px;
  border-color:var(--line);
  border-radius:6px;
  background:var(--panel);
  color:var(--muted);
  box-shadow:none;
}
.global-search:hover{border-color:var(--line-strong);color:var(--ink)}
.global-search kbd{
  border-color:var(--line);
  background:var(--panel-soft);
  color:var(--faint);
}
.top-links{gap:16px;font-size:14px}
.top-links a{color:var(--muted)}
.top-links a:hover{color:var(--ink)}
.theme-toggle,.mobile-nav-toggle{
  min-height:28px;
  border:1px solid var(--line);
  border-radius:6px;
  background:var(--panel);
  color:var(--muted);
  padding:4px 8px;
  font:650 12px/1 ui-sans-serif,system-ui,sans-serif;
}
.safety-strip{
  border-bottom:1px solid var(--line);
  background:var(--bg);
  color:var(--faint);
  padding:5px 18px;
  text-align:center;
  font-size:12px;
  line-height:1.45;
}
.safety-strip strong{color:var(--muted)}
.shell{
  grid-template-columns:250px minmax(0,700px) 180px;
  gap:28px;
  max-width:1210px;
  padding:0 18px;
}
.sidebar{
  top:81px;
  height:calc(100vh - 81px);
  border-right:1px solid var(--line);
  padding:22px 18px 40px 0;
}
.runtime-badge{
  border:0;
  border-radius:0;
  background:transparent;
  box-shadow:none;
  border-bottom:1px solid var(--line);
  padding:0 0 16px;
  margin-bottom:18px;
}
.runtime-badge span,.toc-card>span,.trust-card>span,.breadcrumb,.nav-section>span,th{
  color:var(--faint);
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
  font-size:11px;
  font-weight:760;
  letter-spacing:.08em;
}
.runtime-badge strong{color:var(--ink);font-size:14px;font-weight:700}
.runtime-badge small{color:var(--muted);font-size:12px;line-height:1.45}
.search-label,.version-label{
  margin:13px 0 5px;
  color:var(--muted);
  font-size:12px;
  font-weight:650;
}
.search-input,.version-select{
  border-color:var(--line);
  border-radius:6px;
  background:var(--panel);
  color:var(--ink);
  padding:8px 9px;
}
.search-input:focus,.version-select:focus,.global-search:focus,#docs-search-modal-input:focus{
  outline:2px solid color-mix(in srgb,var(--accent) 28%,transparent);
  border-color:var(--accent);
}
.search-results a{
  border-color:var(--line);
  border-radius:6px;
  background:var(--panel);
  color:var(--ink);
}
.nav-section{margin-top:18px}
.nav-section>span{display:flex;align-items:center;gap:7px;margin-bottom:6px}
.section-icon,.callout-icon,.card-icon,.inline-icon,.search-result-icon{
  flex:0 0 auto;
  width:14px;
  height:14px;
  color:currentColor;
}
.section-icon{color:var(--faint)}
.sidebar a{
  border-radius:4px;
  padding:5px 8px;
  color:var(--muted);
  font-size:13.5px;
}
.sidebar a:hover{background:var(--panel-soft);color:var(--ink)}
.sidebar a[aria-current=page]{
  background:transparent;
  color:var(--accent-strong);
  font-weight:700;
  box-shadow:none;
}
.content{padding:36px 0 72px}
.article{max-width:700px}
.breadcrumb{margin:0 0 10px;text-transform:uppercase}
.page-kind{
  margin:0 0 10px;
  color:var(--faint);
  font-size:13px;
  font-style:normal;
}
h1{
  margin:0 0 10px;
  color:var(--ink);
  font-size:32px;
  line-height:1.18;
  font-weight:760;
}
h2{
  margin:34px 0 10px;
  border-top:1px solid var(--line);
  padding-top:22px;
  color:var(--ink);
  font-size:20px;
  line-height:1.32;
  font-weight:720;
}
h3{color:var(--ink);font-size:17px}
h4{color:var(--ink);font-size:15px}
.lede{
  max-width:680px;
  margin:0 0 22px;
  color:var(--muted);
  font-size:17px;
  line-height:1.65;
}
p{color:var(--muted);line-height:1.68}
code{
  border:0;
  border-radius:4px;
  background:var(--panel-soft);
  color:var(--accent-strong);
  padding:1px 4px;
  font-size:12.5px;
}
pre{
  border-color:var(--line);
  border-radius:8px;
  background:#08090d;
  box-shadow:none;
}
.hero-panel,.doc-card,.fact-strip,.checklist li,.steps li,.table-wrap,.pager a,.search-dialog,.tab-panel,.accordion details{
  border-color:var(--line);
  background:var(--panel);
  box-shadow:none;
}
.hero-panel{
  border-radius:8px;
  padding:20px;
  background:var(--panel);
}
.hero-panel h2{font-size:26px}
.button-link{
  min-height:36px;
  border-color:var(--line-strong);
  border-radius:6px;
  background:var(--panel-hard);
  color:var(--ink);
}
.button-link:hover{background:var(--accent-strong);color:var(--bg)}
.button-link+a{background:transparent;color:var(--muted)}
.card-grid{gap:10px}
.doc-card{
  min-height:120px;
  border-radius:8px;
  padding:14px;
}
.doc-card .card-icon{
  width:16px;
  height:16px;
  margin-bottom:12px;
  color:var(--faint);
}
.doc-card:hover{transform:none;border-color:var(--line-strong);box-shadow:none}
.doc-card strong{color:var(--ink)}
.doc-card span{color:var(--muted)}
.fact-strip{
  border-radius:8px;
  margin:18px 0;
}
.fact-strip div{padding:12px;border-right-color:var(--line)}
.fact-strip dd{color:var(--ink);font-size:13.5px}
.checklist li,.steps li{border-radius:8px;padding:10px 12px}
.checklist-marker,.steps li:before{
  border-color:var(--line);
  background:transparent;
  color:var(--accent-strong);
}
.checklist-marker:after{border-color:var(--accent-strong)}
.table-wrap{
  border-radius:0;
  margin:16px 0;
  background:transparent;
}
table{min-width:560px}
th,td{
  padding:8px 10px;
  border-bottom-color:var(--line);
}
th{
  background:var(--panel-soft);
  color:var(--faint);
}
td{color:var(--muted);font-size:13.5px}
td code{
  background:transparent;
  color:var(--accent-strong);
  padding:0;
  font-size:12px;
  word-break:normal;
  overflow-wrap:anywhere;
}
.callout{
  display:grid;
  grid-template-columns:16px minmax(0,1fr);
  gap:9px;
  border-left:2px solid var(--line-strong);
  padding:2px 0 2px 12px;
  margin:18px 0;
  color:var(--muted);
}
.callout[data-claim-context=risk_caveat]{
  display:block;
  border-left:0;
  padding:0;
  margin:12px 0 22px;
  background:transparent;
}
.callout[data-claim-context=non_claim]{
  border-left-color:var(--accent);
  background:transparent;
}
.callout .callout-icon{
  width:13px;
  height:13px;
  margin-top:7px;
  color:var(--faint);
}
.callout[data-claim-context=non_claim] .callout-icon{
  color:var(--accent-strong);
}
.callout[data-claim-context=risk_caveat] .callout-icon{
  display:none;
}
.callout p{
  color:var(--muted);
  font-size:14.5px;
  line-height:1.65;
}
.callout[data-claim-context=risk_caveat] p{
  max-width:640px;
  color:var(--muted);
  font-size:15px;
  line-height:1.7;
}
.pager a{
  border-radius:6px;
  background:transparent;
}
.pager a:hover{background:var(--panel-soft);border-color:var(--line-strong)}
.toc{
  top:81px;
  height:calc(100vh - 81px);
  padding:36px 0 32px;
}
.toc-card,.trust-card{
  border:0;
  border-radius:0;
  background:transparent;
  box-shadow:none;
  padding:0;
}
.toc-card ol{margin:10px 0 0}
.toc-card a{color:var(--muted);font-size:13px}
.toc-card a:hover{color:var(--accent-strong)}
.search-dialog{
  border-radius:10px;
  background:var(--panel);
}
.search-dialog-results a{border-radius:6px;color:var(--ink)}
.search-dialog-results a{
  grid-template-columns:16px minmax(0,1fr);
  column-gap:9px;
}
.search-dialog-results a>span{grid-column:2}
.search-result-icon{
  grid-row:1 / span 2;
  margin-top:2px;
  color:var(--faint);
}
.search-dialog-results a:hover,.search-dialog-results a.is-active{
  background:var(--accent-soft);
  border-color:var(--accent);
}
.search-dialog-results mark{color:var(--accent-strong)}
.external-link{
  display:inline-flex;
  align-items:baseline;
  gap:3px;
}
.external-link .inline-icon{
  width:12px;
  height:12px;
  transform:translateY(1px);
}
@media(max-width:1180px){
  .shell{grid-template-columns:248px minmax(0,1fr);gap:24px;max-width:1000px}
}
@media(max-width:900px){
  .topbar{height:auto;min-height:52px;grid-template-columns:1fr auto auto;padding:8px 14px}
  .global-search{height:34px;grid-column:1/-1}
  .safety-strip{padding:6px 14px;text-align:left}
  .shell{padding:0 18px}
  .sidebar{
    top:auto;
    height:auto;
    border-right:0;
    padding:16px 0 20px;
  }
  .content{padding:28px 0 46px}
  h1{font-size:29px}
  h2{font-size:19px}
  .lede{font-size:16px}
}
@media(prefers-reduced-motion:reduce){
  *,*:before,*:after{scroll-behavior:auto!important;transition:none!important;animation:none!important}
}`;
}

function clientScript() {
  return `const storedTheme = localStorage.getItem('nullark-docs-theme');
if (storedTheme === 'light' || storedTheme === 'dark') {
  document.body.dataset.theme = storedTheme;
} else {
  document.body.dataset.theme = 'dark';
}

const mobileNavToggle = document.querySelector('[data-mobile-nav-toggle]');
mobileNavToggle?.addEventListener('click', () => {
  const open = !document.body.classList.contains('sidebar-open');
  document.body.classList.toggle('sidebar-open', open);
  mobileNavToggle.setAttribute('aria-expanded', String(open));
});

for (const block of document.querySelectorAll('pre')) {
  const button = document.createElement('button');
  button.textContent = 'Copy';
  button.type = 'button';
  button.className = 'copy';
  button.addEventListener('click', () => navigator.clipboard?.writeText(block.innerText.replace(/^Copy/, '').trim()));
  block.prepend(button);
}

const modal = document.querySelector('[data-search-modal]');
const modalInput = document.getElementById('docs-search-modal-input');
const modalResults = document.getElementById('docs-search-modal-results');
const searchIconMarkup = '<svg class="search-result-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m16 16 4 4"/></svg>';
let index = [];
let activeSearchIndex = 0;

fetch('/search-index.json').then((response) => response.json()).then((value) => {
  index = value;
}).catch(() => {});

function scoreSearchItem(item, q) {
  const title = item.title.toLowerCase();
  const section = item.section.toLowerCase();
  const excerpt = item.excerpt.toLowerCase();
  if (title === q) return 100;
  if (title.startsWith(q)) return 80;
  if (title.includes(q)) return 60;
  if (section.includes(q)) return 40;
  if (excerpt.includes(q)) return 20;
  return 0;
}

function highlight(text, q) {
  if (!q) return document.createTextNode(text);
  const lower = text.toLowerCase();
  const index = lower.indexOf(q.toLowerCase());
  if (index === -1) return document.createTextNode(text);
  const fragment = document.createDocumentFragment();
  fragment.append(document.createTextNode(text.slice(0, index)));
  const mark = document.createElement('mark');
  mark.textContent = text.slice(index, index + q.length);
  fragment.append(mark);
  fragment.append(document.createTextNode(text.slice(index + q.length)));
  return fragment;
}

function renderResults(target, query, rich = false) {
  target.innerHTML = '';
  const q = query.trim().toLowerCase();
  if (q.length < 2) return;
  const matches = index
    .map((item) => ({ item, score: scoreSearchItem(item, q) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.item.title.localeCompare(b.item.title))
    .slice(0, rich ? 8 : 6)
    .map((entry) => entry.item);
  for (const item of matches) {
    const a = document.createElement('a');
    a.href = item.url.replace('https://docs.nullark.com', '');
    const icon = document.createElement('span');
    icon.innerHTML = searchIconMarkup;
    a.append(icon.firstElementChild);
    a.append(highlight(item.title, q));
    if (rich) {
      const section = document.createElement('span');
      section.textContent = item.section + ' - ' + item.excerpt;
      a.append(section);
    }
    target.append(a);
  }
  activeSearchIndex = 0;
  updateActiveSearchResult();
}

modalInput?.addEventListener('input', () => renderResults(modalResults, modalInput.value, true));

function updateActiveSearchResult() {
  if (!modalResults) return;
  const links = [...modalResults.querySelectorAll('a')];
  links.forEach((link, index) => link.classList.toggle('is-active', index === activeSearchIndex));
}

function openSearch(seed = '') {
  if (!modal || !modalInput || !modalResults) return;
  modal.hidden = false;
  modalInput.value = seed;
  renderResults(modalResults, seed, true);
  setTimeout(() => modalInput.focus(), 0);
}

function closeSearch() {
  if (modal) modal.hidden = true;
}

for (const opener of document.querySelectorAll('[data-search-open]')) {
  opener.addEventListener('click', () => openSearch());
}
for (const closer of document.querySelectorAll('[data-search-close]')) {
  closer.addEventListener('click', closeSearch);
}
document.addEventListener('keydown', (event) => {
  if (event.key === '/' && !/input|textarea|select/i.test(document.activeElement?.tagName ?? '')) {
    event.preventDefault();
    openSearch();
  }
  if (!modal?.hidden && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
    const links = [...modalResults.querySelectorAll('a')];
    if (!links.length) return;
    event.preventDefault();
    activeSearchIndex = event.key === 'ArrowDown'
      ? Math.min(activeSearchIndex + 1, links.length - 1)
      : Math.max(activeSearchIndex - 1, 0);
    updateActiveSearchResult();
  }
  if (!modal?.hidden && event.key === 'Enter') {
    const active = modalResults.querySelector('a.is-active') ?? modalResults.querySelector('a');
    if (active) {
      event.preventDefault();
      location.href = active.href;
    }
  }
  if (event.key === 'Escape') closeSearch();
});`;
}

function listFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

function writeOutputFile(outDir, canonicalPath, html) {
  writeRaw(path.join(outDir, canonicalPath.replace(/^\//, ""), "index.html"), html);
}

function writeRaw(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text);
}

function isTextFile(filePath) {
  return /\.(html|json|xml|txt|css|js|map|md)$|_headers$|_redirects$/.test(filePath);
}

function slug(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

export const internals = {
  DEFAULT_CONTENT_DIR,
  DEFAULT_OUT_DIR,
  DEFAULT_PRIVATE_DIR,
  DOCS_ORIGIN,
  sha256(text) {
    return crypto.createHash("sha256").update(text).digest("hex");
  }
};
