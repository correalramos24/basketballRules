# Local development

Everything for day-to-day authoring runs on your machine — **no Docker required**.

## Prerequisites

- **Node.js ≥ 20** (Node 22 recommended)
- Optional, only for regenerating content: `pdftotext` (poppler) and Python 3

## Install and run

```bash
npm install
npm run dev
```

This launches the Astro dev server on **http://localhost:4321** with hot reload. Open the
article you are working on directly, e.g. `http://localhost:4321/articles/art-21`, and edit
its `.mdx` file — the page updates on save.

Astro manages the dev server as a background process, so it stays running until you stop it.

## npm scripts

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

## Convenience script

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

## Regenerating the placeholder articles

The placeholder article stubs are generated from the parsed rulebook structure:

```bash
# 1. Extract text from the PDF and parse the rule/article structure
pdftotext docs/sources/regles_fcbq_2026.pdf /tmp/regles.txt
python3 scripts/parse_rulebook.py /tmp/regles.txt scripts/rulebook-2026.json

# 2. Generate src/content/articles/art-NN.mdx + placeholder figures
npm run generate:articles
```

Docker is only needed for the production-style preview described in
[deployment.md](./deployment.md).
