function walk(node, fn) {
  fn(node);
  if (node.children) {
    for (const child of node.children) walk(child, fn);
  }
}

function isAnnex(node) {
  if (node.type !== 'mdxJsxFlowElement' || node.name !== 'div') return false;
  return (node.attributes ?? []).some(
    (attr) =>
      attr.name === 'class' &&
      typeof attr.value === 'string' &&
      attr.value.split(/\s+/).includes('annex'),
  );
}

function attr(name, value) {
  return { type: 'mdxJsxAttribute', name, value };
}

/**
 * Rewrites the authoring `<div class="annex">**Title** …</div>` into a native
 * collapsible `<details>` whose `<summary>` is the bold first line.
 *
 * This has to run at the markdown (mdast) stage: MDX JSX elements are compiled
 * to <details>/<summary> directly and are not visible to rehype plugins.
 */
export default function remarkAnnex() {
  return (tree) => {
    walk(tree, (node) => {
      if (!isAnnex(node)) return;

      const [first, ...rest] = node.children ?? [];
      if (!first) return;

      const summaryChildren = first.type === 'paragraph' ? first.children : [first];

      node.name = 'details';
      node.attributes = [attr('class', 'annex'), attr('open', null)];
      node.children = [
        {
          type: 'mdxJsxFlowElement',
          name: 'summary',
          attributes: [attr('class', 'annex-summary')],
          children: summaryChildren,
        },
        ...rest,
      ];
    });
  };
}
