# Basketball Rules — FCBQ / FIBA Lookup

A minimal, fast web app for looking up the **FIBA basketball rules** (adapted by the
**FCBQ** — Federació Catalana de Basquetbol). Content is implemented **manually, article
by article**, so each rule/article is an independent, self-contained unit.

The site is a **static Astro build** served by **nginx** (port **8080**) inside a **Docker**
container.

---

## Stack

| Concern | Choice |
| --- | --- |
| Framework | **Astro 7** (static output) + **TypeScript** |
| Styling | **Tailwind CSS v4** (`@tailwindcss/vite`) + `@tailwindcss/typography` |
| Content | **@astrojs/mdx** — one MDX file per article (`.astro` when a bespoke layout is needed) |
| Search | **FlexSearch** client island + build-time JSON index |
| Server | **nginx:alpine** serving `dist/` on port **8080** |
| Runtime | **Docker** (multi-stage build) + `docker-compose` |

---

## Folder structure

```
.
├── docs/                          Source PDFs (reference material, not served)
│   ├── regles_fcbq.pdf            FCBQ rules
│   ├── regles_fcbq_2026.pdf       FCBQ rules, 2026 edition
│   ├── interpretacions_fcbq.pdf   FCBQ official interpretations
│   └── INTERPRETACIONS_2026.pdf   FCBQ interpretations, 2026 edition
│
├── docker/
│   └── nginx.conf                 nginx server configuration (listens on 8080)
│
├── scripts/
│   ├── generate_articles.mjs      Regenerates the placeholder articles
│   └── parse_rulebook.py          Parses the source PDF into JSON
│
│
├── src/
│   ├── content/
│   │   ├── config.ts              Content collection schema (Zod)
│   │   └── articles/              One MDX (+ optional CSS) file per article
│   │       ├── art-01.mdx         Article text, image tags
│   │       ├── art-01.css         Per-article styles, scoped under .art-01
│   │       └── ...
│   ├── layouts/
│   │   ├── Base.astro             HTML shell + shared header, theme
│   │   └── Article.astro          Two-column article layout (sidebar + content)
│   ├── components/
│   │   ├── SiteHeader.astro       Common top navigation (active link highlight)
│   │   ├── ArticleSidebar.astro   Quick article switcher (grouped by rule)
│   │   ├── BackLink.astro         Back-to-origin button
│   │   ├── Search.astro           FlexSearch island (planned)
│   │   └── SideBySide.astro       Resizable two-pane compare view (planned)
│   ├── pages/
│   │   ├── index.astro            Article list + lookup entry point
│   │   ├── articles/
│   │   │   └── [slug].astro       Renders a single article
│   │   ├── compare.astro          Side-by-side view (?a=art-01&b=art-33)
│   │   └── search-index.json.ts   Build-time search index endpoint
│   └── styles/
│       └── global.css             Tailwind entry + design tokens
│
├── public/
│   └── articles/
│       └── art-01/                Per-article images (figura-1.png, ...)
│
├── astro.config.mjs
├── package.json
├── tsconfig.json
├── Dockerfile
├── docker-compose.yml
└── README.md
```

> Directories that are intentionally empty until implementation begins are kept in
> version control with a `.gitkeep` file.

---

## Working on an article, independently

Every article is fully self-contained in its own paths:

```
src/content/articles/art-05.mdx     ← text, image tags
src/content/articles/art-05.css     ← styles, scoped under .art-05
public/articles/art-05/figura-1.png ← images
```

Because of this:

- **No central registry to edit.** The content collection auto-discovers files in
  `src/content/articles/`. Adding or removing an article never requires touching an index.
- **CSS cannot leak.** `Article.astro` renders `<article class="art art-05">`, and
  `art-05.css` is written under `.art-05 …`. Your styles only ever affect article 05.
- **Git is naturally per-article.** Commit `art-05.*` on its own; edits touch no shared files.

### Day-to-day loop

1. Start the dev server:
   ```bash
   npm run dev
   ```
2. Open just your article — `https://localhost:4321/articles/05`.
3. Edit `art-05.mdx` / `art-05.css`; the page **hot-reloads** on save.
4. Drop images into `public/articles/art-05/`; they appear immediately.
5. Commit when the article is done.

### Authoring format

Write the article as **MDX** (plain text/markdown, with HTML only for special bits):

```mdx
---
numero: 5
titulo: "Canasta"
regla: 5
reglaTitol: "FALTES"
tags: ["anotación", "canasta"]
draft: false
---

## 5.1 Definición

Una canasta se convierte cuando el balón entra por la canasta desde arriba...

![Figura 1](/articles/art-05/figura-1.png)
```

For articles that need a bespoke layout, write them as an Astro component
(`src/articles/Art05.astro`) whose `<style>` block Astro scopes automatically to that
component. Both patterns coexist; use MDX by default and `.astro` only when needed.

### Drafts

Set `draft: true` in the frontmatter to preview an unfinished article at its normal URL
while keeping it **out of the index, navigation, and search**. Flip it to `false` when
ready.

### Inserting images

Place images under `public/articles/art-NN/` and reference them with an absolute path
(`/articles/art-NN/figura-1.png`). Use `<figure>`/`<figcaption>` for captioned figures.

### FCBQ annexes

FCBQ-specific additions ("Annex a l'article X.X. Per les competicions de l'FCBQ") use the
shared `.annex` class — an orange callout that renders as a **collapsible** `<details>`
(open by default). Wrap the block in a `div` with the bold title as the first line:

```mdx
<div class="annex">

**Annex a l'article 1.1. Per les competicions de l'FCBQ**

Text de l'annex...

</div>
```

The bold first line becomes the `<summary>`; only the title is bold. The conversion is
done by `src/lib/remark-annex.mjs` (JSX is invisible to rehype, so it runs at the
Markdown stage), and the style lives in `src/styles/global.css`, shared by every article.

---

## Navigation UI

Navigation is shared across the site and lives in a few small components:

- **`SiteHeader.astro`** — the common top bar (logo, `Inici`, `Índex`). The active link is
  highlighted from `Astro.url.pathname`. Rendered by `Base.astro` on every page.
- **`ArticleSidebar.astro`** — shown on article pages. Lists every (non-draft) article
  grouped by rule with the current article highlighted, auto-scrolled into view, and a
  quick filter box. On large screens it is a sticky column; on small screens it collapses
  into a "Canviar d'article" disclosure.
- **`BackLink.astro`** — a clear **"← Tornar"** button at the top of every article that
  returns to the origin page (uses browser history, falling back to `/`).

The two-column article layout (sidebar + content) is provided by `Article.astro`:

```
lg:grid lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-10
```

---

## Light / dark theme

A theme toggle button (`ThemeToggle.astro`) sits on the top navbar. It switches between
the light and dark themes and remembers the choice in `localStorage`.

- The theme is class-based: adding/removing `dark` on `<html>` drives every `dark:`
  utility. This is enabled by `@custom-variant dark (&:where(.dark, .dark *));` in
  `src/styles/global.css`.
- On first visit (no saved preference) the theme follows the OS
  (`prefers-color-scheme`).
- A tiny inline script in `Base.astro`'s `<head>` applies the saved theme **before**
  the page paints, avoiding a flash of the wrong theme.

---

## Content model (frontmatter)

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `numero` | `number` | yes | Article number (used for ordering and URLs) |
| `titulo` | `string` | yes | Article title |
| `regla` | `string` | no | Parent rule/section |
| `tags` | `string[]` | no | Keywords for lookup |
| `draft` | `boolean` | no | Hide from index/nav/search while `true` |

### Authoring sub-articles

Write each sub-article as a level-2 heading that starts with its id, followed by the title:

```md
## 1.1 El partit de basquetbol

Un partit de basquetbol es disputa entre 2 equips...
```

A rehype plugin (`src/lib/rehype-rules.mjs`) splits the heading so the id (`1.1`) is
rendered on its own and the title sits next to it with a little spacing, like the original
PDF. The body text is indented to align under the title (not under the id). A heading with
only an id (`## 6.1`) is supported too. Clauses written as a bold number, e.g.
`**5.1.** …` (two levels) or `**4.1.1.** …` (any depth), are put in the same id column with
their text beside them.

> Astro 7 ships Sätteri as the default Markdown processor, which does not run remark/rehype
> plugins. That is why the project installs `@astrojs/markdown-remark` and sets
> `markdown.processor: unified({ rehypePlugins: […] })` in `astro.config.mjs`.

### Annexes

Wrap FCBQ-specific annex text in a `div.annex` (orange, collapsible callout). Only the bold
title is emphasised; the body text stays regular. The bold first line of the block becomes
the clickable `<summary>`:

```md
<div class="annex">

**Annex a l'article 1.1. Per les competicions de l'FCBQ**

El número d'àrbitres i auxiliars de taula ve determinada per...

</div>
```

---

## Local development (no Docker)

Everything for day-to-day authoring runs on your machine — **no Docker required**. The
only prerequisite is Node.js ≥ 20.

```bash
npm install
npm run dev
```

This launches the Astro dev server on **http://localhost:4321** with hot reload. Open the
article you are working on directly, e.g. `http://localhost:4321/articles/art-21`, and edit
its `.mdx` file — the page updates on save.

Astro manages the dev server as a background process, so it stays running until you stop
it. Convenience scripts:

```bash
npm run dev          # start (http://localhost:4321)
npm run dev:host     # start and expose on your LAN (e.g. http://192.168.x.x:4321)
npm run dev:status   # show the dev server status
npm run dev:logs     # stream the dev server logs
npm run dev:stop     # stop the dev server

npm run build        # static build; Zod errors point at the offending art-NN.mdx
npm run preview      # preview the production build locally
```

Optional: serve the local dev server over HTTPS:

```bash
npx astro dev --https
```

### Convenience script

The same commands are wrapped in `development/run.sh`:

```bash
development/run.sh install    # install dependencies
development/run.sh dev        # start dev server (http://localhost:4321)
development/run.sh host       # start dev server on the LAN
development/run.sh stop       # stop the dev server
development/run.sh status     # dev server status
development/run.sh logs       # stream dev server logs
development/run.sh build      # static build
development/run.sh preview    # preview the production build
development/run.sh check      # type-check
development/run.sh generate   # regenerate Lorem Ipsum articles
development/run.sh parse      # re-parse the rulebook PDF
development/run.sh clean      # remove .astro and dist
development/run.sh help

# pick a custom port
PORT=8080 development/run.sh dev
```

### Regenerating the Lorem Ipsum scaffold

The article stubs are generated from the rulebook structure:

```bash
# 1. Extract text from the PDF and parse the rule/article structure
pdftotext docs/regles_fcbq_2026.pdf /tmp/regles.txt
python3 scripts/parse_rulebook.py /tmp/regles.txt scripts/rulebook-2026.json

# 2. Generate src/content/articles/art-NN.mdx + placeholder figures
npm run generate:articles
```

Docker is only needed for the production-style preview described below.

---

## Docker

The site is built in a multi-stage image and served as static files by nginx on port
**8080** (the same port the existing deployment uses).

```bash
# Build and run with Docker Compose
docker compose up --build

# or with plain Docker
docker build -t basketballrules:latest .
docker run --rm -p 8080:8080 basketballrules:latest
```

Then open **http://localhost:8080**. The container listens on **8080** internally and
exposes **8080** externally, so it can sit behind a TLS-terminating reverse proxy as-is.

---

## Build & deployment summary

- **`Dockerfile`** — multi-stage: build the Astro site with Node (`npm ci && npm run
  build`), then copy `dist/` into an `nginx:alpine` image.
- **`docker/nginx.conf`** — listens on `8080`, serves the static build, sets long-lived
  caching for `/_astro/` assets and gzip compression.
- **`docker-compose.yml`** — builds the image and maps host `8080` → container `8080`.
- **`.dockerignore`** — keeps `node_modules/`, `dist/`, `.git/`, `docs/` and certs out of
  the build context.

---

## Milestones

1. Scaffold Astro + TypeScript + Tailwind + MDX; base layout, tokens, global CSS.
2. Content collection schema + one sample article (MDX + CSS + image + draft).
3. Article page, navigation, index/list.
4. FlexSearch island + build-time search index.
5. Side-by-side compare view.
6. `nginx.conf` + Dockerfile + docker-compose → static site on port 8080.
7. Authoring guide (text / images / styles / side-by-side / drafts).

---

## Credits

Project by Victor Correal Ramos © 2026.
