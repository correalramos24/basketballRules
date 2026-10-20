# Basketball Rules — FCBQ 2026

A fast, self-contained web app for looking up the **FIBA basketball rules** as adapted by
the **FCBQ** (Federació Catalana de Basquetbol), 2026 edition. The content is authored by
hand, one file per article, and served as a static site.

## About

The rulebook is split into **rules → articles → sub-articles**. Each article is an
independent MDX file, so the text is easy to edit, review and version. The site renders the
familiar hanging-indent layout of the original PDF (every id in its own column), supports
light/dark themes and is packaged as a small Docker image for deployment.

## Features

- One MDX file per article, auto-discovered (no central registry).
- Hanging-indent layout: article, sub-article and clause ids in one column.
- Collapsible FCBQ annex callouts.
- Shared navigation: header, grouped article sidebar with filter, back link.
- Site-wide search: FlexSearch client island over a build-time JSON index
  (`/search-index.json`); covers the rulebook and (as soon as it is generated)
  the interpretations collection. Focus it anywhere with `/`.
- Light/dark theme with OS preference detection and no flash on load.
- Static output served by nginx in a multi-stage Docker image on port 8080.

## Tech stack

| Concern | Choice |
| --- | --- |
| Framework | **Astro 7** (static output) + **TypeScript** |
| Styling | **Tailwind CSS v4** (`@tailwindcss/vite`) + `@tailwindcss/typography` |
| Content | **@astrojs/mdx** — one MDX file per article |
| Search | **FlexSearch** (dependency in place; client island planned) |
| Server | **nginx:alpine** on port **8080** |
| Runtime | **Docker** (multi-stage build) + `docker-compose` |

## Getting started

Requires **Node.js ≥ 20** (Node 22 recommended).

```bash
npm install
npm run dev      # http://localhost:4321
```

Edit an article and the page reloads on save. Build and preview the production output with:

```bash
npm run build
npm run preview
```

See [Local development](docs/development.md) for the full list of scripts and the
`development/run.sh` helper.

## Project structure

```
src/
├── content/articles/     One MDX file per article
├── components/           Header, sidebar, back link, theme toggle
├── layouts/              Base shell and two-column article layout
├── lib/                  rehype/remark plugins (id columns, annexes)
│   ├── rehype-rules.mjs
│   └── remark-annex.mjs
├── pages/                index, rules overview, article route
└── styles/global.css     Tailwind entry + design tokens

docs/                     Documentation and source PDFs (docs/sources)
docker/nginx.conf         nginx configuration (port 8080)
scripts/                  Rulebook parser and article generator
```

See [architecture.md](./docs/architecture.md) for the full layout and the Markdown pipeline.

## Authoring

Articles live in `src/content/articles/art-NN.mdx`. A minimal example:

```mdx
---
numero: 5
titulo: "Jugadors: lesions i assistència"
regla: 3
reglaTitol: "ELS EQUIPS"
draft: false
---

## 5.1 ...

**5.1.** Els àrbitres poden aturar el partit en cas de lesió d'un o més jugadors.

<div class="annex">

**Annex a l'article 6.2. Per les competicions de l'FCBQ**

Text de l'annex...

</div>
```

See [authoring.md](./docs/authoring.md) for the content model, sub-articles, annexes, images
and drafts.

## Deployment

```bash
docker compose up --build      # http://localhost:8080
```

See [deployment.md](./docs/deployment.md) for the image details, nginx configuration and
TLS/reverse-proxy notes.

## Documentation

| Document | Contents |
| --- | --- |
| [authoring.md](./docs/authoring.md) | Content model, sub-articles, annexes, images, drafts |
| [development.md](./docs/development.md) | Local setup, npm scripts, `run.sh`, regenerating content |
| [architecture.md](./docs/architecture.md) | Stack, project layout, Markdown pipeline, UI, theming |
| [deployment.md](./docs/deployment.md) | Docker build, nginx, port 8080, TLS notes |
| [roadmap.md](./docs/roadmap.md) | Milestones |

## License

Project by Victor Correal Ramos © 2026.
