# Architecture

How the project is put together: the stack, the folder layout, the Markdown pipeline
and the shared UI.

## Tech stack

| Concern | Choice |
| --- | --- |
| Framework | **Astro 7** (static output) + **TypeScript** |
| Styling | **Tailwind CSS v4** (`@tailwindcss/vite`) + `@tailwindcss/typography` |
| Content | **@astrojs/mdx** — one MDX file per article (`.astro` when a bespoke layout is needed) |
| Search | **FlexSearch** client island over a build-time JSON index (`/search-index.json`) |
| Server | **nginx:alpine** serving `dist/` on port **8080** |
| Runtime | **Docker** (multi-stage build) + `docker-compose` |

## Project structure

```
.
├── docs/
│   ├── sources/                   Source PDFs (reference material, not served)
│   │   ├── regles_fcbq_2026.pdf
│   │   ├── interpretacions_2026.pdf
│   │   └── ... (2024 editions)
│   └── *.md                       This documentation
│
├── docker/
│   └── nginx.conf                 nginx server configuration (listens on 8080)
│
├── development/
│   └── run.sh                     Local development helper (no Docker required)
│
├── scripts/
│   ├── generate_articles.mjs      Regenerates the placeholder articles
│   ├── parse_rulebook.py          Parses the source PDF into JSON
│   └── rulebook-2026.json         Parsed model: rules -> articles -> sub-articles
│
├── src/
│   ├── content.config.ts          Content collection schema (Zod)
│   ├── content/
│   │   └── articles/              One MDX file per article
│   │       ├── art-01.mdx
│   │       ├── art-02.mdx
│   │       └── ...
│   ├── layouts/
│   │   ├── Base.astro             HTML shell + shared header, theme bootstrap
│   │   └── Article.astro          Two-column article layout (sidebar + content)
│   ├── components/
│   │   ├── SiteHeader.astro       Common top navigation (active link highlight)
│   │   ├── SearchIsland.astro     FlexSearch client island in the header
│   │   ├── DocSwitcher.astro      Header dropdown: Reglament ↔ Interpretacions
│   │   ├── ArticleSidebar.astro   Article / interpretation switcher (grouped by rule)
│   │   ├── BackLink.astro         Back-to-landing-page button
│   │   └── ThemeToggle.astro      Light/dark switch
│   ├── lib/
│   │   ├── rehype-rules.mjs       Sub-article id columns (rehype)
│   │   └── remark-annex.mjs       Collapsible annexes (remark)
│   ├── pages/
│   │   ├── index.astro            Landing: the project explained, document collection
│   │   ├── search-index.json.ts   Build-time search index records (FlexSearch input)
│   │   ├── articles/
│   │   │   └── [...slug].astro    Renders a single article
│   │   └── interpretacions/
│   │       └── [id].astro         Renders a single interpretation
│   └── styles/
│       └── global.css             Tailwind entry + design tokens
│
├── public/
│   ├── favicon.svg
│   └── articles/
│       └── art-NN/                Per-article images (figura-1.svg, ...)
│
├── astro.config.mjs
├── package.json
├── tsconfig.json
├── Dockerfile
├── docker-compose.yml
├── .dockerignore
├── .gitignore
└── README.md
```

> Directories that are intentionally empty until implementation begins are kept in version
> control with a `.gitkeep` file.

## Content collection & routing

Articles are a single content collection defined in `src/content.config.ts`. Astro
**auto-discovers** every file under `src/content/articles/`, so adding or removing an
article never requires touching a central registry.

- `src/pages/index.astro` — landing page presenting the document collection.
- There are no list pages: navigation is the per-document sidebar plus the header
  `DocSwitcher` dropdown (shown only on article and interpretation pages), which jumps to the matching
  entry in the other document (Art. 2 ↔ interpretation 2) when one exists.
- `src/pages/articles/[...slug].astro` — renders a single article; the slug is the file
  name (`art-01` → `/articles/art-01`).

Articles are ordered by the `numero` frontmatter field, not by file name.

## Markdown pipeline

Astro 7 ships **Sätteri** as the default Markdown processor, which does **not** run
remark/rehype plugins. To use them the project installs `@astrojs/markdown-remark` and
wires a `unified` processor in `astro.config.mjs`:

```js
markdown: {
  processor: unified({
    remarkPlugins: [remarkAnnex],
    rehypePlugins: [rehypeRules],
  }),
},
```

Two small plugins implement the rulebook layout.

### Sub-article ids — `src/lib/rehype-rules.mjs`

Runs on the HTML (rehype) tree after Markdown conversion:

- A level-2 heading whose text starts with an id (`## 4.1 Definició`) is split into an
  id column (`4.1`) and a title (`Definició`).
- A heading with only an id (`## 6.1`) is supported too.
- A paragraph whose first node is a bold number (`**4.1.1.** …`, or article-level
  `**5.1.** …`) is rendered with the number in the same left column and the body beside
  it. Any depth is accepted (e.g. `4.4.4.1`).

This reproduces the original PDF's hanging-indent look, where every id — article,
sub-article and clause — hangs in one column with its text to the right.

### Collapsible annexes — `src/lib/remark-annex.mjs`

FCBQ-specific additions are authored as `<div class="annex">` with the bold title as the
first line. Because **MDX JSX elements are invisible to rehype plugins**, this conversion
runs at the Markdown (mdast) stage: the plugin rewrites the `div` into a native
`<details><summary>` (open by default), using the first bold paragraph as the summary.
The look lives in `src/styles/global.css` under `.annex`.

## Site-wide search

`src/components.SearchIsland.astro` is a FlexSearch client island living in the top
navbar on every page. The pipeline:

- **Build time** — `src/pages/search-index.json.ts` walks every non-draft entry of the
  content collections (articles + the new `interpretacions` collection, which is
  detected automatically) and emits `/search-index.json`: one record per document with
  `{id, tipo, url, titulo, numero, contexto, texto}`, where `texto` is the raw Markdown
  body stripped of markup.
- **Runtime** — on the first keystroke the island fetches the JSON, builds a
  FlexSearch `Document` index (fields `titulo`, `numero`, `texto`) and caches it for the
  rest of the session.
- **Results** — a dropdown lists the top matches with the document type
  (Reglament / Interpretacions), the article number and a snippet around the first hit
  with the query terms highlighted. Arrow keys move through the results, `Enter`
  navigates, `Esc` closes, and `/` focuses the search box from anywhere.

## Navigation UI

Shared across the site and kept in a few small components:

- **`SiteHeader.astro`** — the common top bar. The active link is highlighted from
  `Astro.url.pathname`. Rendered by `Base.astro` on every page.
- **`ArticleSidebar.astro`** — shown on article pages. Lists every (non-draft) article
  grouped by rule with the current article highlighted, auto-scrolled into view, and a
  quick filter box. It is a sticky column on large screens and collapses into a
  "Canviar d'article" disclosure on small screens.
- **`BackLink.astro`** — a clear **"← Tornar"** button that returns to the landing page (`/`).

The two-column article layout (sidebar + content) is provided by `Article.astro`:

```
lg:grid lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-10
```

## Light / dark theme

A toggle (`ThemeToggle.astro`) sits on the top navbar and remembers the choice in
`localStorage`.

- The theme is **class-based**: adding/removing `dark` on `<html>` drives every `dark:`
  utility, enabled by `@custom-variant dark (&:where(.dark, .dark *));` in
  `src/styles/global.css`.
- On a first visit (no saved preference) the theme follows the OS
  (`prefers-color-scheme`).
- A tiny inline script in `Base.astro`'s `<head>` applies the saved theme **before** the
  page paints, avoiding a flash of the wrong theme.
