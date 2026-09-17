import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { public13fFunds } from "./public-13f-funds.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "dist/public");
const siteUrl = (process.env.PUBLIC_SITE_URL || "https://diyabsolutereturns.com").replace(/\/$/, "");
const shell = await readFile(path.join(output, "index.html"), "utf8");
const artifactConfig = await readFile(path.join(root, ".replit-artifact/artifact.toml"), "utf8");
const backendFundSource = await readFile(path.join(root, "../api-server/src/lib/edgar-fetcher.ts"), "utf8");

const pages = [
  {
    route: "/macro",
    title: "US Macro Dashboard & Economic Indicators",
    description: "Track GDP, inflation, labor, financial conditions, global markets, and the US economic cycle with current Federal Reserve and FRED data.",
    heading: "US Macro Dashboard and Economic Indicators",
    body: "Review the economic indicators that shape long-term investment conditions, including growth, inflation, employment, interest rates, credit, and global markets.",
    links: [["Explore hedge fund 13F portfolios", "/13f"], ["Compare research plans", "/pricing"]],
  },
  {
    route: "/13f",
    title: "Hedge Fund 13F Holdings & Portfolio Insights",
    description: "Research quarterly SEC 13F holdings, portfolio changes, concentration, and position history for leading hedge funds and long-term investors.",
    heading: "Hedge Fund 13F Holdings and Portfolio Insights",
    body: "Explore public SEC 13F filings, compare quarterly portfolio changes, and study the disclosed US equity holdings of leading investment managers.",
    links: public13fFunds.map(([slug, name]) => [`${name} 13F holdings`, `/13f/${slug}`]),
  },
  {
    route: "/pricing",
    title: "Stock Research Platform Pricing",
    description: "Compare monthly and annual access to stock screens, company filings, valuation models, analyst insights, and investor intelligence.",
    heading: "Stock Research Platform Pricing",
    body: "Compare access to stock screens, company research, SEC filings, valuation models, and investor intelligence for long-term fundamental analysis.",
    links: [["View free 13F research", "/13f"], ["Open the macro dashboard", "/macro"]],
  },
  ...public13fFunds.map(([slug, name]) => ({
    route: `/13f/${slug}`,
    title: `${name} 13F Holdings & Portfolio`,
    description: `Review ${name}'s latest SEC 13F holdings, quarterly portfolio changes, position weights, and disclosed US equity investment history.`,
    heading: `${name} 13F Holdings and Portfolio`,
    body: `Research ${name}'s public SEC 13F filings, disclosed US equity positions, portfolio concentration, and quarter-to-quarter holding changes.`,
    links: [["Browse all hedge fund portfolios", "/13f"], ["Open the macro dashboard", "/macro"]],
  })),
];

const manifestSlugs = public13fFunds.map(([slug]) => slug).sort();
const trackedFundsBlock = backendFundSource.match(/const TRACKED_FUNDS[\s\S]*?^];/m)?.[0];
if (!trackedFundsBlock) throw new Error("Could not find the backend TRACKED_FUNDS roster.");
const backendSlugs = [...trackedFundsBlock.matchAll(/slug:\s*"([^"]+)"/g)].map((match) => match[1]).sort();
const rewriteSlugs = [...artifactConfig.matchAll(/from = "\/13f\/([^"]+)"/g)].map((match) => match[1]).sort();

function assertSameSlugs(label, actual) {
  const expectedValue = JSON.stringify(manifestSlugs);
  const actualValue = JSON.stringify(actual);
  if (actualValue !== expectedValue) {
    const missing = manifestSlugs.filter((slug) => !actual.includes(slug));
    const extra = actual.filter((slug) => !manifestSlugs.includes(slug));
    throw new Error(`${label} differs from the public 13F manifest. Missing: ${missing.join(", ") || "none"}. Extra: ${extra.join(", ") || "none"}.`);
  }
}

assertSameSlugs("Backend tracked-fund roster", backendSlugs);
assertSameSlugs("Production clean-URL rewrites", rewriteSlugs);

const escapeHtml = (value) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

function renderPage(page) {
  const canonical = `${siteUrl}${page.route}`;
  const links = page.links.map(([label, href]) => `<li><a href="${escapeHtml(href)}">${escapeHtml(label)}</a></li>`).join("");
  const content = `<main id="prerendered-content"><article><header><p>DIY Absolute Returns</p><h1>${escapeHtml(page.heading)}</h1></header><p>${escapeHtml(page.body)}</p><nav aria-label="Related research"><h2>Related research</h2><ul>${links}</ul></nav></article></main>`;
  const schema = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: page.heading,
    description: page.description,
    url: canonical,
    isPartOf: { "@id": `${siteUrl}/#website` },
  }).replaceAll("<", "\\u003c");

  return shell
    .replace(/<title>.*?<\/title>/s, `<title>${escapeHtml(page.title)}</title>`)
    .replace(/<meta name="description" content="[^"]*"\s*\/?>/, `<meta name="description" content="${escapeHtml(page.description)}" />`)
    .replace(/<link rel="canonical" href="[^"]*"\s*\/?>/, `<link rel="canonical" href="${canonical}" />`)
    .replace(/<meta property="og:title" content="[^"]*"\s*\/?>/, `<meta property="og:title" content="${escapeHtml(page.title)}" />`)
    .replace(/<meta property="og:description" content="[^"]*"\s*\/?>/, `<meta property="og:description" content="${escapeHtml(page.description)}" />`)
    .replace(/<meta property="og:url" content="[^"]*"\s*\/?>/, `<meta property="og:url" content="${canonical}" />`)
    .replace(/<meta name="twitter:title" content="[^"]*"\s*\/?>/, `<meta name="twitter:title" content="${escapeHtml(page.title)}" />`)
    .replace(/<meta name="twitter:description" content="[^"]*"\s*\/?>/, `<meta name="twitter:description" content="${escapeHtml(page.description)}" />`)
    .replace("</head>", `    <script type="application/ld+json" data-route-schema>${schema}</script>\n  </head>`)
    .replace('<div id="root"></div>', `<div id="root">${content}</div>`);
}

for (const page of pages) {
  const directory = path.join(output, page.route.slice(1));
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "index.html"), renderPage(page));
}

const sitemapEntries = pages.map(({ route }) => `  <url><loc>${siteUrl}${route}</loc></url>`).join("\n");
await writeFile(path.join(output, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapEntries}\n</urlset>\n`);
await writeFile(path.join(output, "robots.txt"), `User-agent: *\nAllow: /\nDisallow: /account\nDisallow: /admin/\nDisallow: /sign-in\nDisallow: /sign-up\nDisallow: /stock\nDisallow: /watchlist\nDisallow: /indexes\n\nSitemap: ${siteUrl}/sitemap.xml\n`);
await writeFile(path.join(output, "llms.txt"), `# DIY Absolute Returns\n\n> Public fundamental investment research covering macroeconomic indicators and SEC 13F portfolio disclosures.\n\n## Public research\n\n- [US Macro Dashboard](${siteUrl}/macro): GDP, inflation, labor, financial conditions, global markets, and market-cycle indicators.\n- [Hedge Fund 13F Insights](${siteUrl}/13f): quarterly SEC holdings and portfolio changes for tracked investment managers.\n- [Research Platform Pricing](${siteUrl}/pricing): access options for stock screens, filings, valuation models, and investor intelligence.\n\n## 13F manager pages\n\n${public13fFunds.map(([slug, name]) => `- [${name}](${siteUrl}/13f/${slug})`).join("\n")}\n`);

console.log(`Generated ${pages.length} prerendered public pages and crawler indexes.`);