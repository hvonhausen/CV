#!/usr/bin/env node
/**
 * Build script: renders HTML per language, copies assets, copies source PDFs.
 *
 * Inputs:  data/cv.<lang>.json, data/cv.<lang>.pdf, src/template.html,
 *          src/styles.css, src/landing.html, src/assets/*
 * Output:  dist/index.html, dist/styles.css, dist/assets/*,
 *          dist/<lang>/index.html, dist/<lang>/cv.pdf
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

Mustache.escape = (text) => String(text);

async function readJson(p) {
  return JSON.parse(await fs.readFile(p, "utf8"));
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

async function copyDir(src, dest) {
  try {
    const entries = await fs.readdir(src, { withFileTypes: true });
    for (const entry of entries) {
      const s = path.join(src, entry.name);
      const d = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        await copyDir(s, d);
      } else {
        await copyFile(s, d);
      }
    }
  } catch (err) {
    if (err.code === "ENOENT") return;
    throw err;
  }
}

async function cleanDist() {
  await fs.rm(distDir, { recursive: true, force: true });
  await ensureDir(distDir);
}

function decorate(data) {
  return {
    ...data,
    skills: data.skills.map((s) => ({ ...s, itemsJoined: s.items.join(" • ") })),
    hasCourses: Array.isArray(data.courses) && data.courses.length > 0,
    githubUser: GITHUB_USER,
    buildDate: BUILD_DATE,
  };
}

async function renderLanguage(template, lang) {
  const data = await readJson(path.join(dataDir, `cv.${lang}.json`));
  const html = Mustache.render(template, decorate(data));
  await writeFile(path.join(distDir, lang, "index.html"), html);
  // Copy source PDF alongside the language page so the download button
  // at ./cv.pdf serves the file the user authored.
  const pdfSrc = path.join(dataDir, `cv.${lang}.pdf`);
  try {
    await fs.access(pdfSrc);
    await copyFile(pdfSrc, path.join(distDir, lang, "cv.pdf"));
    console.log(`  ✓ dist/${lang}/cv.pdf`);
  } catch {
    console.warn(`  ⚠ no source PDF at ${pdfSrc} — download button will 404`);
  }
  console.log(`  ✓ dist/${lang}/index.html`);
  return { lang, data };
}

async function main() {
  console.log("→ Building CV site…");
  await cleanDist();

  // Global static files
  await copyFile(path.join(srcDir, "styles.css"), path.join(distDir, "styles.css"));
  await copyDir(path.join(srcDir, "assets"), path.join(distDir, "assets"));

  // Language pages + PDFs
  const template = await fs.readFile(path.join(srcDir, "template.html"), "utf8");
  for (const lang of LANGS) {
    await renderLanguage(template, lang);
  }

  // Landing page
  const landing = await fs.readFile(path.join(srcDir, "landing.html"), "utf8");
  await writeFile(path.join(distDir, "index.html"), landing);
  console.log("  ✓ dist/index.html (landing)");

  // Bypass Jekyll processing
  await writeFile(path.join(distDir, ".nojekyll"), "");

  console.log("✓ Build complete → dist/");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
