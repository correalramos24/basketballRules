function textOf(node) {
  if (node.type === 'text') return node.value;
  if (!node.children) return '';
  return node.children.map(textOf).join('');
}

function visitElements(node, fn) {
  if (node.type === 'element') fn(node);
  if (node.children) {
    for (const child of node.children) visitElements(child, fn);
  }
}

function makeElement(tagName, className, children) {
  return {
    type: 'element',
    tagName,
    properties: { className: [className] },
    children,
  };
}

function spanText(className, value) {
  return makeElement('span', className, [{ type: 'text', value }]);
}

const SUB_ID = /^\d+(?:\.\d+){1,}\.?$/;

// Heading ids: rulebook `4.1`, interpretations `36-1` or `29/51-12`.
const HEADING_ID = String.raw`\d+(?:\/\d+)?(?:[.-]\d+)*`;

function transformHeading(node) {
  const text = textOf(node).trim();
  if (!text) return;

  let id = '';
  let title = '';

  let match = text.match(new RegExp(`^(${HEADING_ID})\\s+(.+)$`));
  if (match) {
    id = match[1];
    title = match[2].trim();
  } else {
    match =
      text.match(new RegExp(`^Apartat\\s+(${HEADING_ID})$`, 'i')) ||
      text.match(new RegExp(`^(${HEADING_ID})$`));
    if (match) id = match[1];
  }

  if (!id) return;

  node.children = [spanText('sub-id', id)];
  if (title) node.children.push(spanText('sub-title', title));
}

function transformSubItem(node) {
  const first = node.children?.[0];
  if (!first || first.type !== 'element' || first.tagName !== 'strong') return;

  const id = textOf(first).trim();
  if (!SUB_ID.test(id)) return;

  const rest = node.children.slice(1);
  if (rest[0] && rest[0].type === 'text') {
    rest[0] = { type: 'text', value: rest[0].value.replace(/^\s+/, '') };
  }

  node.properties = node.properties ?? {};
  node.properties.className = ['sub-item'];
  node.children = [spanText('sub-id', id), makeElement('span', 'sub-body', rest)];
}

/**
 * Markdown niceties for the rulebook:
 *   - `## 4.1 Definició`      -> id `4.1` + title `Definició` in their own column
 *   - `## 36-1`, `## 29/51-12` -> interpretation ids, styled the same way
 *   - `**4.1.1.** Un membre…` -> id `4.1.1.` + body `Un membre…` (any depth, e.g. 4.4.4.1)
 *     Also applies to article-level clauses without a title, e.g. `**5.1.** …`
 *
 * The annex `<div class="annex">…</div>` is turned into a collapsible <details>
 * at the markdown stage (see `remark-annex.mjs`), because JSX elements are not
 * visible to rehype plugins.
 */
export default function rehypeRules() {
  return (tree) => {
    visitElements(tree, (node) => {
      if (node.tagName === 'h2') return transformHeading(node);
      if (node.tagName === 'p') return transformSubItem(node);
    });
  };
}
