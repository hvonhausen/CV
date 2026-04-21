#!/usr/bin/env node
/**
 * Build script: renders HTML per language, copies assets and source PDFs.
 *
 * Inputs:  data/cv.<lang>.json, data/cv.<lang>.pdf
 *          src/template.html        → individual language pages
 *          src/cv-body-partial.html → CV body (no header/summary) embedded
 *                                     below the hero for both languages
 *          src/landing.html         → root shell: hero + bilingual CV bodies
 *          src/styles.css, src/assets/*
 *
 * Output:  dist/index.html          (combined bilingual page with JS toggle)
 *          dist/<lang>/index.html   (standalone pages kept for direct links)
 *          dist/<lang>/cv.pdf       (source PDF copied verbatim)
 *          dist/styles.css, dist/assets/*
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
const GITHUB_USER =
  process.env.GITHUB_USER ||
  process.env.GITHUB_REPOSITORY_OWNER ||
  "hvonhausen";
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
      if (entry.isDirectory()) await copyDir(s, d);
      else await copyFile(s, d);
    }
  } catch (err) {
    if (err.code === "ENOENT") return;
    throw err;
  }
}

function decorate(data) {
  return {
    ...data,
    skills: data.skills.map((s) => ({
      ...s,
      itemsJoined: s.items.join(" \u2022 "),
    })),
    hasCourses: Array.isArray(data.courses) && data.courses.length > 0,
    profile: {
      ...data.profile,
      phoneDigits: data.profile.phone.replace(/[^0-9]/g, ""),
    },
    githubUser: GITHUB_USER,
    buildDate: BUILD_DATE,
  };
}

async function main() {
  console.log("Building CV site...");

  await fs.rm(distDir, { recursive: true, force: true });
  await ensureDir(distDir);

  await copyFile(
    path.join(srcDir, "styles.css"),
    path.join(distDir, "styles.css")
  );
  await copyDir(path.join(srcDir, "assets"), path.join(distDir, "assets"));

  const pageTemplate = await fs.readFile(
    path.join(srcDir, "template.html"),
    "utf8"
  );
  const bodyPartialTemplate = await fs.readFile(
    path.join(srcDir, "cv-body-partial.html"),
    "utf8"
  );
  const landingShell = await fs.readFile(
    path.join(srcDir, "landing.html"),
    "utf8"
  );

  const bodyPartials = {};
  const hero = {};
  let sharedProfile = null;

  for (const lang of LANGS) {
    const data = await readJson(path.join(dataDir, `cv.${lang}.json`));
    const view = decorate(data);

    // Individual language page (kept for direct links / SEO)
    const pageHtml = Mustache.render(pageTemplate, view);
    await writeFile(path.join(distDir, lang, "index.html"), pageHtml);

    // Embeddable CV body (no header/summary — hero owns those)
    bodyPartials[lang] = Mustache.render(bodyPartialTemplate, view);

    // Hero data for this language
    const topCompany = data.experience?.[0]?.company ?? "";
    hero[lang] = {
      headline: data.profile.headline,
      affiliation: `${topCompany} · ${data.profile.location}`,
      bio: data.summary,
    };

    if (!sharedProfile) sharedProfile = view.profile;

    // Copy source PDF verbatim
    const pdfSrc = path.join(dataDir, `cv.${lang}.pdf`);
    try {
      await fs.access(pdfSrc);
      await copyFile(pdfSrc, path.join(distDir, lang, "cv.pdf"));
      console.log(`  OK dist/${lang}/cv.pdf`);
    } catch {
      console.warn(`  WARN no source PDF for ${lang}`);
    }

    console.log(`  OK dist/${lang}/index.html`);
  }

  // Root combined page — hero with language-toggled text + both CV bodies
  const combined = Mustache.render(landingShell, {
    profile: sharedProfile,
    hero,
    cvEnBody: bodyPartials.en,
    cvEsBody: bodyPartials.es,
    buildDate: BUILD_DATE,
    githubUser: GITHUB_USER,
  });
  await writeFile(path.join(distDir, "index.html"), combined);
  console.log("  OK dist/index.html (combined bilingual)");

  await writeFile(path.join(distDir, ".nojekyll"), "");
  console.log("Build complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
