#!/usr/bin/env node
/**
 * Generate Lorem Ipsum article stubs from the parsed rulebook structure.
 *
 *   node scripts/generate_articles.mjs
 *
 * Reads scripts/rulebook-2026.json and writes:
 *   src/content/articles/art-NN.mdx          one file per article
 *   public/articles/art-NN/figura-1.svg       placeholder figure
 *
 * Re-runnable: overwrites generated files.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const model = JSON.parse(readFileSync(join(root, 'scripts/rulebook-2026.json'), 'utf8'));

const ARTICLES_DIR = join(root, 'src/content/articles');
const IMAGES_DIR = join(root, 'public/articles');

const LOREM = [
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
  'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.',
  'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.',
  'Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.',
];

const pad = (n) => String(n).padStart(2, '0');
const slugOf = (n) => `art-${pad(n)}`;

// The source PDF groups some sub-article numbers away from their titles, which can
// leave a numeric string as the "title". Fall back to a generic label in those cases.
function cleanTitle(raw) {
  const s = (raw ?? '').trim().replace(/\s+$/, '');
  if (!s || /^\d+(\.\d+)+\.?$/.test(s)) return '';
  // Long lines are body sentences caught by the PDF grouping, not headings.
  if (s.length > 60) return '';
  return s.replace(/\.$/, '');
}


function figureSvg(numero) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" role="img" aria-label="Figura de mostra article ${numero}">
  <rect width="640" height="360" fill="#e8edf4"/>
  <rect x="24" y="24" width="592" height="312" fill="none" stroke="#3e587c" stroke-width="4"/>
  <circle cx="320" cy="180" r="70" fill="none" stroke="#e8590c" stroke-width="4"/>
  <line x1="320" y1="24" x2="320" y2="336" stroke="#3e587c" stroke-width="4"/>
  <text x="320" y="188" font-family="sans-serif" font-size="48" font-weight="700" fill="#3e587c" text-anchor="middle">Art. ${numero}</text>
</svg>
`;
}

function buildMdx(article, rule) {
  const numero = article.numero;
  const slug = slugOf(numero);

  const fm = [
    '---',
    `numero: ${numero}`,
    `titulo: ${JSON.stringify(article.titulo)}`,
    `regla: ${rule.numero}`,
    `reglaTitol: ${JSON.stringify(rule.titulo)}`,
    `tags: ["regla ${rule.numero}", "article ${numero}"]`,
    'draft: false',
    '---',
    '',
  ].join('\n');

  const out = [fm];

  const apartats = article.apartats ?? [];
  if (apartats.length === 0) {
    out.push(`## ${numero} ${article.titulo}\n`);
    out.push(`${LOREM[0]}\n`);
    out.push(`${LOREM[1]}\n`);
    out.push(`![Figura 1 — ${article.titulo}](/articles/${slug}/figura-1.svg)\n`);
  } else {
    apartats.forEach((ap, i) => {
      const title = cleanTitle(ap.titulo);
      out.push(title ? `## ${ap.num} ${title}\n` : `## ${ap.num}\n`);
      out.push(`${LOREM[i % LOREM.length]}\n`);
      out.push(`${LOREM[(i + 1) % LOREM.length]}\n`);
      if (i === 0) {
        out.push(`![Figura 1 — ${article.titulo}](/articles/${slug}/figura-1.svg)\n`);
      }
    });
  }

  return out.join('\n');
}

const FORCE = process.argv.includes('--force');

let created = 0;
let skipped = 0;
for (const rule of model.rules) {
  for (const article of rule.articles) {
    const slug = slugOf(article.numero);
    const mdxPath = join(ARTICLES_DIR, `${slug}.mdx`);
    mkdirSync(join(IMAGES_DIR, slug), { recursive: true });
    if (!FORCE && existsSync(mdxPath)) {
      skipped++;
      continue;
    }
    writeFileSync(join(IMAGES_DIR, slug, 'figura-1.svg'), figureSvg(article.numero));
    writeFileSync(mdxPath, buildMdx(article, rule));
    created++;
  }
}

console.log(`Generated ${created} article file(s); skipped ${skipped} existing (use --force to overwrite).`);
