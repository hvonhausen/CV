# CV — Hernan von Hausen

Personal CV managed as a small webapp. Content is stored as structured JSON in both English and Spanish; on every push to `main`, GitHub Actions renders two static HTML pages and two print-ready PDFs and deploys everything to GitHub Pages.

**Live site:** https://hvonhausen.github.io/CV/ 

**LinkedIn:** https://www.linkedin.com/in/hvonhausen/

## How it works

```
data/               ← edit this
  cv.en.json
  cv.es.json
src/
  template.html     ← Mustache template used for both languages
  landing.html      ← language picker at /
  styles.css
scripts/
  build.mjs         ← renders HTML + PDF into dist/
.github/workflows/
  deploy.yml        ← builds on push, publishes to Pages
```

On each push to `main`:

1. `npm ci` installs Mustache + Puppeteer.
2. `npm run build` renders `dist/en/index.html`, `dist/es/index.html`, and a landing page at `dist/index.html`.
3. Puppeteer prints each language page to `dist/<lang>/cv.pdf`.
4. The entire `dist/` folder is deployed to GitHub Pages.

## Updating the CV

Edit `data/cv.en.json` and/or `data/cv.es.json`, commit, push. The new HTML + PDF are live in ~1–2 minutes.

The JSON schema is the same in both languages — if you add a section or field in one, mirror it in the other so builds stay in sync.

## Local development

```bash
npm install
npm run build          # HTML + PDF → dist/
npm run build:html     # HTML only (skip puppeteer)
npm run dev            # build HTML and serve on http://localhost:8080
```

PDFs download directly from each language page via the **Download PDF** button (served from `/<lang>/cv.pdf`).

## Enabling GitHub Pages (one-time)

After pushing to GitHub:

1. Go to **Settings → Pages**.
2. Under **Source**, select **GitHub Actions**.
3. Push any commit to `main` (or re-run the workflow). The site will appear at `https://<user>.github.io/CV/`.
