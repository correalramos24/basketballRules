
document.addEventListener('DOMContentLoaded', () => {
  initReglamentPage();
});

async function initReglamentPage() {
  try {
    const markdown = await fetchText('reglesFIBA.md');
    const annotatedMarkdown = annotateMarkdown(markdown);

    const html = marked.parse(annotatedMarkdown, {
      headerIds: true,
      mangle: false,
    });

    const container = document.getElementById('reglament');
    container.innerHTML = html;

    ensureHeadingIds(container);
    wrapSections(container);
    buildSidebarNav(container);
  } catch (error) {
    console.error(error);
    document.getElementById('reglament').innerText = 'Internal error';
  }
}

function annotateMarkdown(markdown) {

  const regex = /(^|\r?\n):::\s*annex\s*\r?\n([\s\S]*?)\r?\n:::/gi;
  let found = 0;
  const replaced = markdown.replace(regex, (match, prefix, content) => {
    return `${prefix}<div class="annex">\n${content.trim()}\n</div>`;
  });

  return replaced;
}

async function fetchText(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error('Internal error');
  }

  return response.text();
}

function ensureHeadingIds(container) {
  const usedIds = new Set();

  const headings = container.querySelectorAll('h1, h2, h3, h4');
  headings.forEach((heading) => {
    // Style rule titles specifically
    if (heading.tagName === 'H1') {
      heading.classList.add('rule');
    }

    if (!heading.id) {
      const slug = generateIdFromText(heading.textContent || '', usedIds);
      heading.id = slug;
    } else {
      // Avoid duplicates if the markdown already provides ids
      let id = heading.id;
      let counter = 1;
      while (usedIds.has(id)) {
        id = `${heading.id}-${counter++}`;
      }
      heading.id = id;
      usedIds.add(id);
    }
  });
}

function generateIdFromText(text, usedIds) {
  const base = text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s\-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/\-+/g, '-');

  let id = base || 'heading';
  let counter = 1;
  while (usedIds.has(id)) {
    id = `${base}-${counter++}`;
  }

  usedIds.add(id);
  return id;
}

function wrapSections(container) {
  wrapHeadingGroup(container, 'h2', 'article', (node) => node.classList.add('article'), ['h2']);
  wrapHeadingGroup(container, 'h3', 'div', (node) => node.classList.add('epigraf'), ['h2', 'h3']);
}

function wrapHeadingGroup(container, headingSelector, wrapperTag, initWrapper, stopAtTags = []) {
  const headings = container.querySelectorAll(headingSelector);

  headings.forEach((heading) => {
    const wrapper = document.createElement(wrapperTag);
    if (initWrapper) {
      initWrapper(wrapper);
    }

    // Capture the next sibling before moving the heading into its wrapper.
    let next = heading.nextElementSibling;

    heading.parentNode.insertBefore(wrapper, heading);
    wrapper.appendChild(heading);

    while (next && !stopAtTags.includes(next.tagName.toLowerCase())) {
      const current = next;
      next = next.nextElementSibling;
      wrapper.appendChild(current);
    }
  });
}


function buildSidebarNav(container) {
  const nav = document.querySelector('#sidebar nav');
  if (!nav) return;

  const title = nav.querySelector('h1');
  nav.innerHTML = '';
  if (title) {
    nav.appendChild(title);
  }

  const articles = container.querySelectorAll('.article');
  articles.forEach((article) => {
    const h2 = article.querySelector('h2');
    if (!h2) return;

    nav.appendChild(createNavLink(h2.textContent, `#${h2.id}`));

  });
}

function createNavLink(text, href, extraClasses = []) {
  const a = document.createElement('a');
  a.classList.add('nav-link', ...extraClasses);
  a.href = href;
  a.textContent = text;
  return a;
}

