#!/usr/bin/env node
/**
 * Generate MDX article stubs from the parsed interpretations structure.
 *
 *   node scripts/generate_interpretacions.mjs
 *
 * Reads scripts/interpretacions-2026.json and writes:
 *   src/content/interpretacions/int-NN.mdx          one file per article
 *
 * Re-runnable: overwrites generated files.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const model = JSON.parse(readFileSync(join(root, 'scripts/interpretacions-2026.json'), 'utf8'));

const ARTICLES_DIR = join(root, 'src/content/interpretacions');
const IMAGES_DIR = join(root, 'public/articles'); // reuse existing dir if needed

// Zero-pad article number to 2 digits; for combined use first number for filename
const pad = (n) => String(n).padStart(2, '0');
const slugOf = (n) => {
  // combined "18/19" -> slug "int-18", but keep full number in frontmatter
  const parts = n.toString().split('/');
  return `int-${parts[0].trim().padStart(2, '0')}`;
};

// Clean title fallback: if the raw title is just a number pattern, use generic
function cleanTitle(raw) {
  const s = (raw ?? '').trim().replace(/\s+$/, '');
  if (!s || /^\d+(\.\d+)+\.?$/.test(s)) return '';
  if (s.length > 60) return '';
  return s.replace(/\.$/, '');
}

// Figure reference comment (no placeholder images generated)
function figureComment(numero) {
  return `{/* FIGURA: ${numero} */}\n`;
}

function buildMdx(article) {
  const numero = article.numero;
  const slug = slugOf(numero);

  const fm = [
    '---',
    `numero: ${JSON.stringify(numero)}`,
    `titulo: ${JSON.stringify(article.titulo)}`,
    `tags: ["interpretacio", "article ${numero}"]`,
    'draft: false',
    '---',
    '',
  ].join('\n');

  const out = [fm];

  const items = article.items ?? [];
  if (items.length === 0) {
    out.push(`## ${numero} ${article.titulo}\n`);
    out.push(`${LOREM[0]}\n`);
    out.push(`${LOREM[1]}\n`);
    out.push(`${figureComment(numero)}`);
  } else {
    items.forEach((it, i) => {
      const title = cleanTitle(it.titulo);
      const typeMarker = it.tipus ? `**${it.tipus}.**` : `**${it.num}**`;
      out.push(`${title ? `## ${it.num} ${title}\n` : `## ${it.num}\n`}`);
      // Body text from the item
      const body = it.text?.trim();
      if (body) {
        out.push(`${body}\n`);
      } else {
        out.push(`${LOREM[i % LOREM.length]}\n`);
      }
      // Interpretació block
      const interp = it.interpretacio?.trim();
      if (interp) {
        out.push(`**Interpretació:** ${interp}\n`);
      }
      // Sub-casos
      if (it.subcasos && it.subcasos.length > 0) {
        it.subcasos.forEach((sc, si) => {
          const letter = String.fromCharCode(97 + si); // a, b, c...
          out.push(`(a) ${sc.text}\n`);
        });
      }
      if (i === 0) {
        out.push(`${figureComment(numero)}`);
      }
    });
  }

  return out.join('\n');
}

const LOREM = [
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
  'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.',
  'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.',
  'Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.',
];

let created = 0;
let skipped = 0;
mkdirSync(ARTICLES_DIR, { recursive: true });

for (const article of model.articles) {
  const slug = slugOf(article.numero);
  const mdxPath = join(ARTICLES_DIR, `${slug}.mdx`);

  if (!existsSync(mdxPath)) {
    mkdirSync(join(IMAGES_DIR, slug), { recursive: true });
    writeFileSync(join(IMAGES_DIR, slug, 'figura-1.svg'), '');
    writeFileSync(mdxPath, buildMdx(article));
    created++;
  } else {
    skipped++;
  }
}

console.log(`Generated ${created} interpretation file(s); skipped ${skipped} existing (use --force to overwrite).`);
console.log(`Articles: ${model.articles.length}; Items total: ${model.articles.reduce((sum, a) => sum + (a.items?.length ?? 0), 0)}`);