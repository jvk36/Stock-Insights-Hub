import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { public13fFunds } from "./public-13f-funds.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "dist/public");
const publicRoutes = ["/macro", "/13f", "/pricing", ...public13fFunds.map(([slug]) => `/13f/${slug}`)];
const privateRoutes = ["/account", "/admin/members", "/sign-in", "/sign-up", "/stock", "/watchlist", "/indexes"];

const adsenseMeta = '<meta name="google-adsense-account" content="ca-pub-0681600473886225"';
const homeHtml = await readFile(path.join(output, "index.html"), "utf8");
if (!homeHtml.includes(adsenseMeta)) throw new Error("Home page is missing the static AdSense verification meta tag");
const adsTxt = await readFile(path.join(output, "ads.txt"), "utf8");
if (adsTxt.trim() !== "google.com, pub-0681600473886225, DIRECT, f08c47fec0942fa0") {
  throw new Error("ads.txt does not contain the expected authorized Google publisher entry");
}

for (const route of publicRoutes) {
  const html = await readFile(path.join(output, route.slice(1), "index.html"), "utf8");
  if (!html.includes(adsenseMeta)) throw new Error(`${route} is missing the static AdSense verification meta tag`);
  for (const marker of ["<title>", '<link rel="canonical"', "<h1>", '<meta name="description"', 'data-route-schema']) {
    if (!html.includes(marker)) throw new Error(`${route} is missing ${marker}`);
  }
  if (!html.includes(`href="https://diyabsolutereturns.com${route}"`)) {
    throw new Error(`${route} has an incorrect canonical URL`);
  }
}

const [sitemap, robots, llms, artifactConfig] = await Promise.all([
  readFile(path.join(output, "sitemap.xml"), "utf8"),
  readFile(path.join(output, "robots.txt"), "utf8"),
  readFile(path.join(output, "llms.txt"), "utf8"),
  readFile(path.join(root, ".replit-artifact/artifact.toml"), "utf8"),
]);

for (const route of publicRoutes) {
  if (!sitemap.includes(`<loc>https://diyabsolutereturns.com${route}</loc>`)) throw new Error(`Sitemap is missing ${route}`);
  if (!artifactConfig.includes(`from = "${route}"\nto = "${route}/index.html"`)) throw new Error(`Clean-URL rewrite is missing ${route}`);
}

for (const route of privateRoutes) {
  if (sitemap.includes(`<loc>https://diyabsolutereturns.com${route}`)) throw new Error(`Sitemap exposes private route ${route}`);
  if (llms.includes(`](${`https://diyabsolutereturns.com${route}`}`)) throw new Error(`llms.txt exposes private route ${route}`);
}

for (const route of ["/account", "/admin/", "/sign-in", "/sign-up", "/stock", "/watchlist", "/indexes"]) {
  if (!robots.includes(`Disallow: ${route}`)) throw new Error(`robots.txt does not disallow ${route}`);
}

console.log(`Verified ${publicRoutes.length} prerendered public routes and crawler indexes.`);