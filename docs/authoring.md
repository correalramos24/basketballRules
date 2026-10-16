# Authoring articles

Content is written by hand, one article per file. Every article is **fully
self-contained**, which keeps editing simple and history clean.

```
src/content/articles/art-05.mdx   ← text and image tags
public/articles/art-05/           ← images for that article
```

Because of this:

- **No central registry to edit.** The content collection auto-discovers files in
  `src/content/articles/`.
- **Nothing leaks between articles.** Each file carries its own text and markup; per-article
  styles can be scoped under a `.art-NN` class if needed.
- **Git is naturally per-article.** Commit one `art-NN.mdx` on its own; edits touch no
  shared files.

## Day-to-day loop

1. Start the dev server:
   ```bash
   npm run dev
   ```
2. Open the article you are working on — `http://localhost:4321/articles/art-05`.
2. Edit `art-05.mdx`; the page **hot-reloads** on save.
3. Drop images into `public/articles/art-05/`; they appear immediately.
4. Flip `draft` to `false` and commit when it is ready.

## Content model (frontmatter)

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `numero` | `number` | yes | Article number (used for ordering and URLs) |
| `titulo` | `string` | yes | Article title |
| `regla` | `number` | yes | Parent rule number (groups the article in the sidebar) |
| `reglaTitol` | `string` | no | Parent rule title |
| `tags` | `string[]` | no | Keywords for lookup |
| `draft` | `boolean` | no | Hide from index/nav while `true` |

```mdx
---
numero: 5
titulo: "Jugadors: lesions i assistència"
regla: 3
reglaTitol: "ELS EQUIPS"
tags: ["regla 3", "article 5"]
draft: false
---
```

## Sub-articles

Write a section as a level-2 heading that starts with its id, optionally followed by a
title:

```md
## 1.1 El partit de basquetbol

Un partit de basquetbol es disputa entre 2 equips de 5 jugadors cadascun...
```

The id (`1.1`) is rendered in its own column and the title sits beside it, like the
original PDF. The body text is indented to align under the title (not under the id). A
heading with only an id (`## 6.1`) works too.

Numbered clauses without a title are written as a bold number at the start of a paragraph —
the id goes in the same column as the others:

```md
**4.1.1.** Un membre d'un equip és apte per jugar quan...

**5.1.** Els àrbitres poden aturar el partit en cas de lesió...
```

Any depth is accepted (e.g. `4.4.4.1`). See
[architecture.md](./architecture.md#sub-article-ids--srclibrehype-rulesmjs) for the plugin
that does this.

## FCBQ annexes

FCBQ-specific additions ("Annex a l'article X.X. Per les competicions de l'FCBQ") use the
shared `.annex` class — an orange callout that renders as a **collapsible** `<details>`
(open by default). Wrap the block in a `div` with the bold title as the first line:

```mdx
<div class="annex">

**Annex a l'article 1.1. Per les competicions de l'FCBQ**

El número d'àrbitres i auxiliars de taula ve determinada per...

</div>
```

The bold first line becomes the clickable `<summary>`; only the title is bold and the body
text stays regular. See
[architecture.md](./architecture.md#collapsible-annexes--srclibremark-annexmjs).

## Images

Place images under `public/articles/art-NN/` and reference them with an absolute path:

```mdx
![Figura 1](/articles/art-01/figura-1.svg)
```

Use `<figure>`/`<figcaption>` for captioned figures.

## Drafts

Set `draft: true` in the frontmatter to preview an unfinished article at its normal URL
while keeping it **out of the index, navigation and search**. Flip it to `false` when ready.

## Bespoke layouts

Most articles are MDX. When an article needs a bespoke layout, write it as an Astro
component instead — Astro scopes its `<style>` block to that component automatically. Both
patterns coexist; use MDX by default and `.astro` only when needed.
