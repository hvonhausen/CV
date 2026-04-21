#!/usr/bin/env node
/**
 * Build script: renders HTML per language, copies assets, generates PDFs.
 *
 * Inputs:  data/cv.<lang>.json, src/template.html, src/styles.css, src/landing.html
 * Output:  dist/index.html, dist/styles.css, dist/<lang>/index.html, dist/<lang>/cv.pdf
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Mustache from "mustache";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

const dataDir = path.join(root, "data");
const srcDir = path.join(root, "src");
const distDir = path.join(root, "dist");

const LANGS = ["en", "es"];
const GITHUB_USER = process.env.GITHUB_USER || process.env.GITHUB_REPOSITORY_OWNER || "your-github-user";
const BUILD_DATE = new Date().toISOString().slice(0, 10);

// Mustache treats HTML-escaped output by default. We trust our own JSON data,
// but keep escaping on to prevent accidental issues. Email-safe strings only.
Mustache.escape = (text) => String(text);

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true });
}

async function copyFile(src, dest) {
  await ensureDir(path.dirname(dest));
  await fs.copyFile(src, dest);
}

async function writeFile(dest, content) {
  await ensureDir(path.dirname(dest));
  await fs.writeFile(dest, content, "utf8");
}

async function cleanDist() {
  await fs.rm(distDir, { recursive: true, force: true });
  await ensureDir(distDir);
}

function decorate(data) {
  return {
    ...data,
    skills: data.skills.map((s) => ({
      ...s,
      itemsJoined: s.items.join(" • "),
    })),
    hasCourses: Array.isArray(data.courses) && data.courses.length > 0,
    githubUser: GITHUB_USER,
    buildDate: BUILD_DATE,
  };
}

async function renderLanguage(template, lang) {
  const data = await readJson(path.join(dataDir, `cv.${lang}.json`));
  const view = decorate(data);
  const html = Mustache.render(template, view);
  await writeFile(path.join(distDir, lang, "index.html"), html);
  return { lang, html, data };
}

async function renderLanding() {
  const landingPath = path.join(srcDir, "landing.html");
  const landing = await fs.readFile(landingPath, "utf8");
  await writeFile(path.join(distDir, "index.html"), landing);
}

async function copyStyles() {
  await copyFile(path.join(srcDir, "styles.css"), path.join(distDir, "styles.css"));
}

async function generatePdfs(rendered) {
  if (process.env.SKIP_PDF === "1") {
    console.log("SKIP_PDF=1 → skipping PDF generation");
    return;
  }
  let puppeteer;
  try {
    puppeteer = (await import("puppeteer")).default;
  } catch (err) {
    console.warn(
      "puppeteer not installed; skipping PDF generation. Install with `npm install` to enable."
    );
    return;
  }

  const browser = await puppeteer.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  try {
    for (const { lang } of rendered) {
      const htmlPath = path.join(distDir, lang, "index.html");
      const page = await browser.newPage();
      const fileUrl = "file://" + htmlPath.replace(/\\/g, "/");
      await page.goto(fileUrl, { waitUntil: "networkidle0" });
      await page.emulateMediaType("print");
      const pdfPath = path.join(distDir, lang, "cv.pdf");
      await page.pdf({
        path: pdfPath,
        format: "A4",
        printBackground: true,
        margin: { top: "14mm", right: "14mm", bottom: "14mm", left: "14mm" },
      });
      await page.close();
      console.log(`  ✓ ${path.relative(root, pdfPath)}`);
    }
  } finally {
    await browser.close();
  }
}

async function main() {
  console.log("→ Building CV site…");
  await cleanDist();
  await copyStyles();
  const template = await fs.readFile(path.join(srcDir, "template.html"), "utf8");

  const rendered = [];
  for (const lang of LANGS) {
    const r = await renderLanguage(template, lang);
    console.log(`  ✓ dist/${lang}/index.html`);
    rendered.push(r);
  }

  await renderLanding();
  console.log("  ✓ dist/index.html (landing)");

  // .nojekyll so GitHub Pages serves every file as-is.
  await writeFile(path.join(distDir, ".nojekyll"), "");

  await generatePdfs(rendered);

  console.log("✓ Build complete → dist/");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
