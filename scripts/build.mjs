#!/usr/bin/env node
/**
 * Build script: renders bilingual landing + resume pages from JSON data.
 *
 * Inputs:  data/cv.<lang>.json, data/cv.<lang>.pdf
 *          src/landing.html              → intro page shell
 *          src/resume.html               → resume page shell
 *          src/resume-body-partial.html  → full CV body embedded twice per lang
 *          src/styles.css
 *
 * Output:  dist/index.html               (intro)
 *          dist/resume/index.html        (full resume, bilingual toggle)
 *          dist/<lang>/cv.pdf            (source PDF copied verbatim)
 *          dist/styles.css
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

function decorate(data) {
  const courses = Array.isArray(data.courses) ? data.courses : [];
  return {
    ...data,
    courses,
    hasCourses: courses.length > 0,
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

  const landingShell = await fs.readFile(
    path.join(srcDir, "landing.html"),
    "utf8"
  );
  const resumeShell = await fs.readFile(
    path.join(srcDir, "resume.html"),
    "utf8"
  );
  const resumeBodyTemplate = await fs.readFile(
    path.join(srcDir, "resume-body-partial.html"),
    "utf8"
  );

  const resumeBodies = {};
  const hero = {};
  let sharedProfile = null;

  for (const lang of LANGS) {
    const data = await readJson(path.join(dataDir, `cv.${lang}.json`));
    const view = decorate(data);

    resumeBodies[lang] = Mustache.render(resumeBodyTemplate, view);

    hero[lang] = {
      headline: data.profile.headline,
      bio: data.summary,
    };

    if (!sharedProfile) sharedProfile = view.profile;

    const pdfSrc = path.join(dataDir, `cv.${lang}.pdf`);
    try {
      await fs.access(pdfSrc);
      await copyFile(pdfSrc, path.join(distDir, lang, "cv.pdf"));
      console.log(`  OK dist/${lang}/cv.pdf`);
    } catch {
      console.warn(`  WARN no source PDF for ${lang}`);
    }
  }

  // Intro (landing)
  const landingHtml = Mustache.render(landingShell, {
    profile: sharedProfile,
    hero,
    buildDate: BUILD_DATE,
    githubUser: GITHUB_USER,
  });
  await writeFile(path.join(distDir, "index.html"), landingHtml);
  console.log("  OK dist/index.html (intro)");

  // Resume page (bilingual, full CV body for both)
  const resumeHtml = Mustache.render(resumeShell, {
    profile: sharedProfile,
    resumeEnBody: resumeBodies.en,
    resumeEsBody: resumeBodies.es,
    buildDate: BUILD_DATE,
    githubUser: GITHUB_USER,
  });
  await writeFile(path.join(distDir, "resume", "index.html"), resumeHtml);
  console.log("  OK dist/resume/index.html");

  await writeFile(path.join(distDir, ".nojekyll"), "");
  console.log("Build complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
