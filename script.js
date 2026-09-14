const DOCS = {
  regles: {
    file: "reglesFCBQ.md",
    subtitle: "Regles FIBA 2024 adaptades per l'FCBQ",
    bodyClass: "doc-regles",
  },
  interps: {
    file: "interpretacionsFCBQ.md",
    subtitle: "Interpretacions oficials de les Regles de Joc · FCBQ",
    bodyClass: "doc-interps",
  },
};

let currentKey = null;
let markdownCache = {};
let spyObserver = null;
let spyLinks = {};
let docIndex = {};
let currentQuery = "";

document.addEventListener("DOMContentLoaded", () => {
  init();
});

async function init() {
  document.querySelectorAll(".doc-tab").forEach((btn) => {
    btn.addEventListener("click", () => switchDoc(btn.dataset.doc));
  });

  const search = document.getElementById("search");
  search.addEventListener("input", () => scheduleSearch());
  search.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const first = resultsPanel().querySelector(".search-result");
      if (first) {
        e.preventDefault();
        jumpTo(first.dataset.target);
      }
    }
  });

  resultsPanel().addEventListener("click", (e) => {
    const btn = e.target.closest(".search-result");
    if (btn) {
      e.preventDefault();
      jumpTo(btn.dataset.target);
    }
  });

  const toggle = document.getElementById("sidebar-toggle");
  toggle.addEventListener("click", () => {
    document.getElementById("sidebar").classList.toggle("open");
  });

  switchDoc("regles");
}

async function switchDoc(key) {
  const doc = DOCS[key];
  if (!doc || key === currentKey) return;
  currentKey = key;

  document.querySelectorAll(".doc-tab").forEach((btn) => {
    const active = btn.dataset.doc === key;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", String(active));
  });
  document.getElementById("doc-subtitle").textContent = doc.subtitle;
  document.body.classList.remove("doc-regles", "doc-interps");
  document.body.classList.add(doc.bodyClass);

  if (!(key in markdownCache)) {
    try {
      markdownCache[key] = await fetchText(doc.file);
    } catch (error) {
      console.error(`No s'ha pogut carregar ${doc.file}`, error);
      showError(`No s'ha pogut carregar el document ${doc.file}.`);
      currentKey = null;
      return;
    }
  }

  renderDoc(key);

  document.getElementById("content-scroll").scrollTop = 0;
  document.getElementById("reglament").focus({ preventScroll: true });
  resetSearch();
}

function renderDoc(key) {
  const markdown = annotateMarkdown(markdownCache[key]);
  const html = marked.parse(markdown, { headerIds: true, mangle: false });

  const container = document.getElementById("reglament");
  container.innerHTML = html;

  ensureHeadingIds(container);
  wrapSections(container);
  buildSidebarNav(container);
  buildSearchIndex(container);
  initScrollSpy();
}

function annotateMarkdown(markdown) {
  const regex = /(^|\r?\n):::\s*annex\s*\r?\n([\s\S]*?)\r?\n:::/gi;
  return markdown.replace(regex, (match, prefix, content) => {
    return `${prefix}<div class="annex">\n${content.trim()}\n</div>`;
  });
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} -> ${response.status}`);
  }
  return response.text();
}

function showError(message) {
  const container = document.getElementById("reglament");
  container.innerHTML = `<div class="sidebar-msg">${message}</div>`;
}

/* ---------- ids d'encapçalaments ---------- */

const DIACRITICS = {
  á: "a", à: "a", â: "a", ä: "a", ã: "a", å: "a",
  é: "e", è: "e", ê: "e", ë: "e",
  í: "i", ì: "i", î: "i", ï: "i",
  ó: "o", ò: "o", ô: "o", ö: "o", õ: "o",
  ú: "u", ù: "u", û: "u", ü: "u",
  ñ: "n", ç: "c", ß: "ss", ø: "o", æ: "ae",
};

function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\x00-\x7F]/g, (ch) => DIACRITICS[ch] || "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "heading";
}

function ensureHeadingIds(container) {
  const usedIds = new Set();
  container.querySelectorAll("h1, h2, h3, h4").forEach((heading) => {
    let id = heading.id || slugify(heading.textContent || "");
    let candidate = id;
    let counter = 1;
    while (usedIds.has(candidate)) {
      candidate = `${id}-${counter++}`;
    }
    heading.id = candidate;
    usedIds.add(candidate);
  });
}

/* ---------- agrupació de seccions ---------- */

function wrapSections(container) {
  wrapHeadingGroup(container, "h2", "div", (node) => node.classList.add("article"), ["h2"]);
  wrapHeadingGroup(container, "h3", "div", (node) => node.classList.add("epigraf"), ["h2", "h3"]);
}

function wrapHeadingGroup(container, headingSelector, wrapperTag, initWrapper, stopAtTags) {
  container.querySelectorAll(headingSelector).forEach((heading) => {
    const wrapper = document.createElement(wrapperTag);
    if (initWrapper) initWrapper(wrapper);

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

/* ---------- índex (sidebar) ---------- */

function buildSidebarNav(container) {
  const nav = document.getElementById("sidebar-nav");
  nav.innerHTML = "";

  const h1s = container.querySelectorAll("h1");
  if (h1s.length === 0) {
    nav.appendChild(msgEl("No hi ha índex per a aquest document."));
    return;
  }

  const rootUl = document.createElement("ul");
  rootUl.className = "sidebar-tree";

  h1s.forEach((h1) => {
    const rootLi = document.createElement("li");
    rootLi.appendChild(linkEl(h1));
    rootUl.appendChild(rootLi);

    let cur = h1.nextElementSibling;
    const subUl = document.createElement("ul");
    while (cur && cur.tagName !== "H1") {
      if (cur.classList.contains("article")) {
        const h2 = cur.querySelector(":scope > h2");
        if (h2) {
          const childLi = document.createElement("li");
          childLi.appendChild(linkEl(h2));
          subUl.appendChild(childLi);
          const epiUl = document.createElement("ul");
          cur.querySelectorAll(":scope > .epigraf").forEach((ep) => {
            const h3 = ep.querySelector(":scope > h3");
            if (h3) {
              const epiLi = document.createElement("li");
              epiLi.appendChild(linkEl(h3));
              epiUl.appendChild(epiLi);
            }
          });
          if (epiUl.children.length) childLi.appendChild(epiUl);
        }
      } else if (cur.classList.contains("epigraf")) {
        const h3 = cur.querySelector(":scope > h3");
        if (h3) {
          const childLi = document.createElement("li");
          childLi.appendChild(linkEl(h3));
          subUl.appendChild(childLi);
        }
      }
      cur = cur.nextElementSibling;
    }
    if (subUl.children.length) rootLi.appendChild(subUl);
  });

  nav.appendChild(rootUl);
}

function linkEl(heading) {
  const a = document.createElement("a");
  a.className = "sidebar-link";
  a.href = `#${heading.id}`;
  a.textContent = heading.textContent.replace(/\s+/g, " ").trim();
  return a;
}

function msgEl(text) {
  const div = document.createElement("div");
  div.className = "sidebar-msg";
  div.textContent = text;
  return div;
}

function filterSidebar(queryRaw) {
  const q = queryRaw.trim().toLowerCase();
  const items = document.querySelectorAll("#sidebar-nav .sidebar-tree li");
  if (!q) {
    items.forEach((li) => li.classList.remove("hidden"));
    return;
  }
  items.forEach((li) => {
    const hit = Array.from(li.querySelectorAll(".sidebar-link")).some((a) =>
      a.textContent.toLowerCase().includes(q)
    );
    li.classList.toggle("hidden", !hit);
  });
}

/* ---------- scroll-spy ---------- */

function initScrollSpy() {
  if (spyObserver) spyObserver.disconnect();
  spyLinks = {};

  document.querySelectorAll(".sidebar-link").forEach((a) => {
    const id = a.getAttribute("href").slice(1);
    if (id) spyLinks[id] = a;
  });

  const content = document.getElementById("content-scroll");
  const targets = [];
  document.querySelectorAll("#reglament h1, #reglament h2, #reglament h3").forEach((h) => {
    if (h.id && spyLinks[h.id]) targets.push(h);
  });

  const setActive = (id) => {
    document.querySelectorAll(".sidebar-link.active").forEach((a) => a.classList.remove("active"));
    const anchor = spyLinks[id];
    if (anchor) anchor.classList.add("active");
  };

  spyObserver = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible.length) setActive(visible[0].target.id);
    },
    { root: content, rootMargin: "-30% 0px -55% 0px", threshold: 0 }
  );

  targets.forEach((t) => spyObserver.observe(t));
  if (targets.length) setActive(targets[0].id);
}

/* ---------- cerca dins del reglament ---------- */

function resultsPanel() {
  return document.getElementById("search-results");
}

function normalizeText(t) {
  return t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tokenize(query) {
  return normalizeText(query)
    .split(/\s+/)
    .filter(Boolean);
}

let searchTimer = null;
function scheduleSearch() {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => onSearchChange(), 120);
}

function onSearchChange() {
  const q = document.getElementById("search").value;
  currentQuery = q;
  filterSidebar(q);
  const panel = resultsPanel();
  if (!q.trim()) {
    resetSearch();
    return;
  }
  const segments = docIndex[currentKey] || [];
  const tokens = tokenize(q);
  if (!tokens.length) {
    panel.hidden = true;
    clearMarks();
    return;
  }
  const matched = segments
    .filter((s) => tokens.every((t) => s.norm.includes(t)))
    .sort((a, b) => {
      const sA = tokens.reduce((n, t) => n + (a.norm.includes(t) ? 3 : 0) + (normalizeText(a.title).includes(t) ? 2 : 0), 0);
      const sB = tokens.reduce((n, t) => n + (b.norm.includes(t) ? 3 : 0) + (normalizeText(b.title).includes(t) ? 2 : 0), 0);
      return sB - sA;
    });
  renderSearchResults(matched.slice(0, 24), matched.length, q);
  highlightWith(document.getElementById("reglament"), q);
}

function renderSearchResults(results, total, query) {
  const panel = resultsPanel();
  const q = normalizeText(query);
  const tokens = q.split(/\s+/).filter(Boolean);
  if (!total) {
    panel.innerHTML = `<div class="search-msg">Sense resultats per a «${escHtml(query.trim())}»</div>`;
    panel.hidden = false;
    return;
  }
  const shown = results.length < total ? `Mostrant ${results.length} de ` : "";
  const rows = results.map((s) => {
    const snippet = makeSnippet(s.text, tokens[0] || "");
    return `<button class="search-result" data-target="#${escHtml(s.id)}"><span class="search-result-title">${escHtml(s.title)}</span><span class="search-result-snippet">${escHtml(snippet)}</span></button>`;
  });
  panel.innerHTML =
    `<div class="search-count">${shown}${total} resultat${total !== 1 ? "s" : ""}</div>` +
    rows.join("");
  panel.hidden = false;
}

function makeSnippet(text, token) {
  if (!text) return "";
  const lower = text.toLowerCase();
  const idx = lower.indexOf(token);
  if (idx < 0) return text.slice(0, 120) + (text.length > 120 ? "…" : "");
  const start = Math.max(0, idx - 55);
  const end = Math.min(text.length, idx + token.length + 65);
  return (start > 0 ? "…" : "") + text.slice(start, end) + (end < text.length ? "…" : "");
}

function escHtml(s) {
  const d = document.createElement("div");
  d.appendChild(document.createTextNode(s));
  return d.innerHTML;
}

function jumpTo(id) {
  const el = document.getElementById(String(id).replace(/^#/, ""));
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  el.classList.remove("search-flash");
  void el.offsetWidth;
  el.classList.add("search-flash");
  if (spyLinks[id]) {
    document.querySelectorAll(".sidebar-link.active").forEach((a) => a.classList.remove("active"));
    spyLinks[id].classList.add("active");
  }
}

function highlightWith(container, query) {
  clearMarks();
  const tokens = tokenize(query);
  if (!tokens.length) return;
  const pattern = tokens.map(escapeRegExp).join("|");
  const re = new RegExp("(" + pattern + ")", "gi");
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const nodes = [];
  const maxNodes = 600;
  while (walker.nextNode() && nodes.length < maxNodes) {
    const n = walker.currentNode;
    if (!n.textContent.trim()) continue;
    nodes.push(n);
  }
  let count = 0;
  const maxMarks = 500;
  for (const node of nodes) {
    if (count >= maxMarks) break;
    re.lastIndex = 0;
    if (!re.test(node.textContent)) {
      re.lastIndex = 0;
      continue;
    }
    re.lastIndex = 0;
    const frag = document.createDocumentFragment();
    let last = 0;
    let m;
    while ((m = re.exec(node.textContent)) !== null) {
      if (m[0].length === 0) {
        re.lastIndex++;
        continue;
      }
      if (last < m.index) frag.appendChild(document.createTextNode(node.textContent.slice(last, m.index)));
      const mark = document.createElement("mark");
      mark.className = "search-hit";
      mark.textContent = m[0];
      frag.appendChild(mark);
      last = m.index + m[0].length;
      count++;
      if (count >= maxMarks) break;
    }
    if (last < node.textContent.length) frag.appendChild(document.createTextNode(node.textContent.slice(last)));
    if (last > 0) node.parentNode.replaceChild(frag, node);
    re.lastIndex = 0;
  }
}

function clearMarks() {
  document.querySelectorAll("#reglament mark.search-hit").forEach((m) => {
    m.replaceWith(document.createTextNode(m.textContent));
  });
}

function resetSearch() {
  document.getElementById("search").value = "";
  resultsPanel().hidden = true;
  resultsPanel().innerHTML = "";
  currentQuery = "";
  clearMarks();
  filterSidebar("");
}

function buildSearchIndex(container) {
  const segments = [];
  const headings = Array.from(container.querySelectorAll("h1, h2, h3, h4"));
  headings.forEach((h, i) => {
    const next = headings[i + 1];
    const range = document.createRange();
    range.setStartAfter(h);
    if (next) range.setEndBefore(next);
    else range.selectNodeContents(container);
    const text = range.toString().replace(/\s+/g, " ").trim();
    segments.push({
      id: h.id,
      level: parseInt(h.tagName[1], 10),
      title: h.textContent.replace(/\s+/g, " ").trim(),
      text,
      norm: normalizeText(text),
      el: h,
    });
  });
  docIndex[currentKey] = segments;
}